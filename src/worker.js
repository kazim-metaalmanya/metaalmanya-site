// MetaAlmanya — randevu API'si, hatırlatma e-postaları ve ekip paneli.
// Cloudflare Workers ücretsiz planında çalışacak şekilde yazıldı.

// ---------------------------------------------------------------------------
// AYARLAR — çalışma saatleri ve randevu kuralları (hepsi Türkiye saati)
// ---------------------------------------------------------------------------
const WEEKDAY_SLOTS = ['10:00', '11:00', '12:30', '14:00', '15:30', '16:30'];
const SATURDAY_SLOTS = ['11:00', '12:30', '14:00'];
// 0 = Pazar, 1 = Pazartesi ... 6 = Cumartesi
const SCHEDULE = { 0: [], 1: WEEKDAY_SLOTS, 2: WEEKDAY_SLOTS, 3: WEEKDAY_SLOTS, 4: WEEKDAY_SLOTS, 5: WEEKDAY_SLOTS, 6: SATURDAY_SLOTS };
// Kapalı günler (resmi tatil, izin vb.) — 'YYYY-MM-DD'
const CLOSED_DATES = [];
const DAYS_AHEAD = 60;        // en fazla kaç gün sonrasına randevu verilir
const MIN_LEAD_HOURS = 12;    // en az kaç saat önceden randevu alınabilir
const DURATION_MIN = 30;      // görüşme süresi (dakika)
const RETENTION_DAYS = 365;   // eski randevular kaç gün sonra silinir (hukukçunuzla netleştirin)
const TR_OFFSET = '+03:00';   // Türkiye'de yaz/kış saati yok

const TOPICS = {
  ausbildung: { tr: 'Ausbildung', de: 'Ausbildung' },
  hemsire: { tr: 'Hemşire denklik kampı', de: 'Anerkennung Pflege (Kenntnisprüfung)' },
  surucu: { tr: 'Sürücü yerleştirme', de: 'Fahrervermittlung' },
  kurye: { tr: 'Kurye ve dağıtım (NRW)', de: 'Kurier und Zustellung (NRW)' },
  vize: { tr: 'Vize ve §81a', de: 'Visum und §81a' },
  sirket: { tr: 'Şirket kurulumu', de: 'Firmengründung' },
  egitim: { tr: 'Dil okulu ve yurtdışı eğitim', de: 'Sprachschule und Studium im Ausland' },
  isveren: { tr: 'İşveren görüşmesi', de: 'Arbeitgebergespräch' },
};
const MODES = {
  online: { tr: 'Online görüntülü görüşme', de: 'Online-Videogespräch' },
  telefon: { tr: 'Telefon görüşmesi', de: 'Telefongespräch' },
  ofis: { tr: 'Ofiste görüşme', de: 'Gespräch im Büro' },
};
const OFFICES = {
  bochum: { label: 'Bochum', addr: 'Kortumstr. 56, 44787 Bochum' },
  bandirma: { label: 'Bandırma', addr: 'Sunullah Mah. 20039 Sk. Tek Gıda İş 1 No: 23 İç Kapı No: 23, 10200 Bandırma / Balıkesir' },
  istanbul: { label: 'İstanbul', addr: 'Yakuplu Mah. Yakuplu Cad. Ceylan Rezidans No: 6 K: 1/29, Beylikdüzü / İstanbul' },
};
const LEVELS = ['', 'yok', 'A1', 'A2', 'B1', 'B2', 'C1'];
const STATUSES = { onaylandi: 'Onaylandı', iptal: 'İptal', gelmedi: 'Gelmedi', tamamlandi: 'Tamamlandı' };
const PHONE_DISPLAY = '+90 551 867 52 05';
const WHATSAPP_URL = 'https://wa.me/905518675205';

// ---------------------------------------------------------------------------
// Yardımcılar
// ---------------------------------------------------------------------------
function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}
function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function trToday(now) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
function instant(date, time) {
  return new Date(`${date}T${time}:00${TR_OFFSET}`);
}
function addDays(date, n) {
  const d = new Date(date + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function weekday(date) {
  return new Date(date + 'T12:00:00Z').getUTCDay();
}
function isValidDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + 'T12:00:00Z');
  return !isNaN(d) && d.toISOString().slice(0, 10) === s;
}
function deTime(date, time) {
  return new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' }).format(instant(date, time));
}
function longDate(date, time, lang) {
  const opts = { timeZone: 'Europe/Istanbul', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' };
  return new Intl.DateTimeFormat(lang === 'de' ? 'de-DE' : 'tr-TR', opts).format(instant(date, time));
}
function baseSlots(date) {
  if (CLOSED_DATES.includes(date)) return [];
  return SCHEDULE[weekday(date)] || [];
}
function maxDate(now) {
  return addDays(trToday(now), DAYS_AHEAD);
}
function bookable(date, time, now) {
  if (date < trToday(now) || date > maxDate(now)) return false;
  return instant(date, time).getTime() - now.getTime() >= MIN_LEAD_HOURS * 3600e3;
}
async function takenSet(env, from, to) {
  const { results } = await env.DB
    .prepare("SELECT date, time FROM appointments WHERE date BETWEEN ?1 AND ?2 AND status != 'iptal'")
    .bind(from, to)
    .all();
  return new Set(results.map((r) => r.date + ' ' + r.time));
}
function daySlots(date, taken, now) {
  return baseSlots(date).map((t) => ({ time: t, de: deTime(date, t), available: bookable(date, t, now) && !taken.has(date + ' ' + t) }));
}
function makeId(date, time) {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const rnd = crypto.getRandomValues(new Uint8Array(4));
  const suffix = Array.from(rnd, (b) => abc[b % abc.length]).join('');
  return `MA-${date.slice(8, 10)}${date.slice(5, 7)}-${time.replace(':', '')}-${suffix}`;
}
function whereText(a, lang) {
  if (a.mode === 'ofis' && OFFICES[a.office]) return OFFICES[a.office].addr;
  if (a.mode === 'telefon') return lang === 'de' ? `Wir rufen Sie unter ${a.phone} an.` : `Sizi ${a.phone} numarasından arayacağız.`;
  return lang === 'de' ? 'Den Link zum Gespräch senden wir Ihnen vor dem Termin.' : 'Görüşme bağlantısını randevudan önce size ileteceğiz.';
}
function modeLabel(a, lang) {
  const m = MODES[a.mode] ? MODES[a.mode][lang] : a.mode;
  return a.mode === 'ofis' && OFFICES[a.office] ? `${m} · ${OFFICES[a.office].label}` : m;
}
function gcalLink(a) {
  const start = instant(a.date, a.time);
  const end = new Date(start.getTime() + DURATION_MIN * 60e3);
  const f = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const p = new URLSearchParams({
    action: 'TEMPLATE',
    text: 'MetaAlmanya ön görüşme',
    dates: `${f(start)}/${f(end)}`,
    details: `Randevu no: ${a.id}\n${TOPICS[a.topic].tr}`,
    location: a.mode === 'ofis' && OFFICES[a.office] ? OFFICES[a.office].addr : modeLabel(a, 'tr'),
  });
  return 'https://calendar.google.com/calendar/render?' + p.toString();
}

// ---------------------------------------------------------------------------
// Spam koruması (Cloudflare Turnstile — ücretsiz)
// ---------------------------------------------------------------------------
async function verifyTurnstile(env, token, ip) {
  if (!token || typeof token !== 'string') return false;
  const form = new FormData();
  form.append('secret', env.TURNSTILE_SECRET);
  form.append('response', token);
  if (ip) form.append('remoteip', ip);
  const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: form });
  const j = await r.json();
  return j.success === true;
}

// ---------------------------------------------------------------------------
// E-posta — Google Workspace (Gmail API) üzerinden gönderilir
// ---------------------------------------------------------------------------
function b64utf8(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}
function encodeHeader(str) {
  if (/^[\x20-\x7E]*$/.test(str)) return str;
  // Uzun başlıkları RFC 2047'ye uygun küçük parçalara böl (her parça 75 karakterin altında).
  const chars = Array.from(str);
  const parts = [];
  for (let i = 0; i < chars.length; i += 15) parts.push(`=?UTF-8?B?${b64utf8(chars.slice(i, i + 15).join(''))}?=`);
  return parts.join('\r\n ');
}
function encodeAddress(addr) {
  const m = /^(.*)<([^>]+)>\s*$/.exec(addr || '');
  if (!m) return addr;
  return `${encodeHeader(m[1].trim())} <${m[2]}>`;
}
async function gmailAccessToken(env) {
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.GMAIL_CLIENT_ID,
      client_secret: env.GMAIL_CLIENT_SECRET,
      refresh_token: env.GMAIL_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }),
  });
  if (!r.ok) throw new Error('Google token hatası ' + r.status);
  return (await r.json()).access_token;
}
async function sendMail(env, { to, subject, html, replyTo }) {
  if (!env.GMAIL_CLIENT_ID || !env.GMAIL_CLIENT_SECRET || !env.GMAIL_REFRESH_TOKEN) {
    console.log('E-posta ayarlanmamış, gönderilmedi:', subject);
    return false;
  }
  const token = await gmailAccessToken(env);
  const body64 = b64utf8(html).replace(/.{1,76}/g, '$&\r\n');
  const headers = [
    `From: ${encodeAddress(env.MAIL_FROM)}`,
    `To: ${to}`,
    replyTo ? `Reply-To: ${replyTo}` : null,
    `Subject: ${encodeHeader(subject)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
  ].filter(Boolean);
  const raw = b64utf8(headers.join('\r\n') + '\r\n\r\n' + body64).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const r = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' },
    body: JSON.stringify({ raw }),
  });
  if (!r.ok) throw new Error('Gmail gönderim hatası ' + r.status + ' ' + (await r.text()));
  return true;
}

function mailShell(inner, lang) {
  const foot = lang === 'de'
    ? `MetaAlmanya · Kortumstr. 56, 44787 Bochum · ${PHONE_DISPLAY}`
    : `MetaAlmanya · Bochum · Bandırma · İstanbul · ${PHONE_DISPLAY}`;
  return `<!doctype html><html><body style="margin:0;background:#F7F4EF;font-family:Arial,Helvetica,sans-serif;color:#2C2C2A;">
<div style="max-width:560px;margin:0 auto;padding:24px 16px;">
<p style="margin:0 0 16px;font-size:20px;font-weight:bold;">Meta<span style="color:#C24A22;">Almanya</span></p>
<div style="background:#ffffff;border:1px solid #E6E0D6;border-radius:14px;padding:24px;font-size:15px;line-height:1.6;">${inner}</div>
<p style="margin:16px 0 0;font-size:12px;color:#5E5B55;">${esc(foot)}</p>
</div></body></html>`;
}
function detailsTable(rows) {
  return `<table role="presentation" style="width:100%;border-collapse:collapse;margin:16px 0;font-size:15px;">${rows
    .map(([k, v]) => `<tr><td style="padding:6px 12px 6px 0;color:#5E5B55;vertical-align:top;white-space:nowrap;">${esc(k)}</td><td style="padding:6px 0;font-weight:bold;">${esc(v)}</td></tr>`)
    .join('')}</table>`;
}
function btn(href, label) {
  return `<a href="${esc(href)}" style="display:inline-block;margin:4px 8px 4px 0;padding:10px 18px;border-radius:999px;background:#C24A22;color:#ffffff;text-decoration:none;font-weight:bold;">${esc(label)}</a>`;
}

function candidateMail(env, a) {
  const de = a.lang === 'de';
  const cancelUrl = `${env.SITE_URL}/randevu/iptal/?id=${encodeURIComponent(a.id)}&t=${encodeURIComponent(a.cancel_token)}`;
  const time = `${a.time} (${de ? 'Türkei' : 'Türkiye'}) · ${deTime(a.date, a.time)} (${de ? 'Deutschland' : 'Almanya'})`;
  const rows = de
    ? [['Termin-Nr.', a.id], ['Thema', TOPICS[a.topic].de], ['Datum', longDate(a.date, a.time, 'de')], ['Uhrzeit', time], ['Gespräch', modeLabel(a, 'de')], ['Ort / Link', whereText(a, 'de')]]
    : [['Randevu no', a.id], ['Konu', TOPICS[a.topic].tr], ['Tarih', longDate(a.date, a.time, 'tr')], ['Saat', time], ['Görüşme', modeLabel(a, 'tr')], ['Yer / bağlantı', whereText(a, 'tr')]];
  const subject = de
    ? `Ihr Termin bei MetaAlmanya: ${longDate(a.date, a.time, 'de')}, ${deTime(a.date, a.time)} Uhr`
    : `Randevunuz alındı: ${longDate(a.date, a.time, 'tr')}, ${a.time}`;
  const inner = de
    ? `<p style="margin:0 0 8px;">Hallo ${esc(a.name)},</p><p style="margin:0;">vielen Dank! Ihr kostenloses Erstgespräch mit MetaAlmanya ist bestätigt.</p>${detailsTable(rows)}<p style="margin:0 0 12px;">${btn(gcalLink(a), 'Zum Kalender hinzufügen')}</p><p style="margin:0;font-size:14px;color:#5E5B55;">Sie können nicht? <a href="${esc(cancelUrl)}" style="color:#B4431D;">Termin stornieren</a> · Fragen: <a href="${WHATSAPP_URL}" style="color:#B4431D;">WhatsApp</a></p>`
    : `<p style="margin:0 0 8px;">Merhaba ${esc(a.name)},</p><p style="margin:0;">Teşekkürler! MetaAlmanya ile ücretsiz ön görüşme randevunuz alındı.</p>${detailsTable(rows)}<p style="margin:0 0 12px;">${btn(gcalLink(a), 'Takvime ekle')}</p><p style="margin:0;font-size:14px;color:#5E5B55;">Gelemeyecek misiniz? <a href="${esc(cancelUrl)}" style="color:#B4431D;">Randevuyu iptal edin</a> · Sorularınız için: <a href="${WHATSAPP_URL}" style="color:#B4431D;">WhatsApp</a></p>`;
  return { to: a.email, subject, html: mailShell(inner, a.lang), replyTo: env.TEAM_EMAIL };
}
function teamMail(env, a) {
  const rows = [
    ['Randevu no', a.id],
    ['Konu', TOPICS[a.topic].tr],
    ['Tarih', longDate(a.date, a.time, 'tr')],
    ['Saat', `${a.time} TR · ${deTime(a.date, a.time)} DE`],
    ['Görüşme', modeLabel(a, 'tr')],
    ['Görüşme dili', a.lang === 'de' ? 'Almanca' : 'Türkçe'],
    ['Ad soyad', a.name],
    ['Telefon', a.phone],
    ['E-posta', a.email],
    ['Almanca seviyesi', a.level || '—'],
    ['Not', a.note || '—'],
  ];
  const inner = `<p style="margin:0;font-weight:bold;font-size:17px;">Yeni randevu alındı</p>${detailsTable(rows)}<p style="margin:0;">${btn(env.SITE_URL + '/panel', 'Panelde aç')}</p>`;
  return { to: env.TEAM_EMAIL, subject: `Yeni randevu: ${a.date} ${a.time} · ${TOPICS[a.topic].tr} · ${a.name}`, html: mailShell(inner, 'tr'), replyTo: a.email };
}
function reminderMail(env, a) {
  const de = a.lang === 'de';
  const cancelUrl = `${env.SITE_URL}/randevu/iptal/?id=${encodeURIComponent(a.id)}&t=${encodeURIComponent(a.cancel_token)}`;
  const rows = de
    ? [['Datum', longDate(a.date, a.time, 'de')], ['Uhrzeit', `${a.time} (Türkei) · ${deTime(a.date, a.time)} (Deutschland)`], ['Gespräch', modeLabel(a, 'de')], ['Ort / Link', whereText(a, 'de')]]
    : [['Tarih', longDate(a.date, a.time, 'tr')], ['Saat', `${a.time} (Türkiye) · ${deTime(a.date, a.time)} (Almanya)`], ['Görüşme', modeLabel(a, 'tr')], ['Yer / bağlantı', whereText(a, 'tr')]];
  const inner = de
    ? `<p style="margin:0 0 8px;">Hallo ${esc(a.name)},</p><p style="margin:0;">eine kurze Erinnerung an Ihren Termin morgen:</p>${detailsTable(rows)}<p style="margin:0;font-size:14px;color:#5E5B55;">Sie können nicht? <a href="${esc(cancelUrl)}" style="color:#B4431D;">Termin stornieren</a></p>`
    : `<p style="margin:0 0 8px;">Merhaba ${esc(a.name)},</p><p style="margin:0;">Yarınki randevunuzu hatırlatmak isteriz:</p>${detailsTable(rows)}<p style="margin:0;font-size:14px;color:#5E5B55;">Gelemeyecek misiniz? <a href="${esc(cancelUrl)}" style="color:#B4431D;">Randevuyu iptal edin</a></p>`;
  const subject = de ? `Erinnerung: Ihr Termin morgen um ${deTime(a.date, a.time)} Uhr` : `Hatırlatma: Yarın saat ${a.time} randevunuz var`;
  return { to: a.email, subject, html: mailShell(inner, a.lang), replyTo: env.TEAM_EMAIL };
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------
async function api(request, env, ctx, url, now) {
  const p = url.pathname;
  const method = request.method;

  if (p === '/api/config' && method === 'GET') {
    return json({ turnstileSiteKey: env.TURNSTILE_SITE_KEY || '', today: trToday(now), maxDate: maxDate(now), durationMin: DURATION_MIN });
  }

  if (p === '/api/month' && method === 'GET') {
    const ym = url.searchParams.get('ym') || '';
    if (!/^\d{4}-\d{2}$/.test(ym)) return json({ error: 'Geçersiz ay.' }, 400);
    const from = ym + '-01';
    if (!isValidDate(from)) return json({ error: 'Geçersiz ay.' }, 400);
    const next = new Date(from + 'T12:00:00Z');
    next.setUTCMonth(next.getUTCMonth() + 1, 0);
    const to = next.toISOString().slice(0, 10);
    const taken = await takenSet(env, from, to);
    const days = [];
    for (let d = from; d <= to; d = addDays(d, 1)) {
      const slots = daySlots(d, taken, now);
      const free = slots.filter((s) => s.available).length;
      // "Dolu" sadece saatler randevuyla dolduysa; süresi geçen saatler dolu sayılmaz.
      const full = slots.length > 0 && free === 0 && slots.some((s) => taken.has(d + ' ' + s.time));
      days.push({ date: d, open: slots.length > 0, free, full });
    }
    return json({ ym, today: trToday(now), maxDate: maxDate(now), days });
  }

  if (p === '/api/slots' && method === 'GET') {
    const date = url.searchParams.get('date') || '';
    if (!isValidDate(date)) return json({ error: 'Geçersiz tarih.' }, 400);
    const taken = await takenSet(env, date, date);
    return json({ date, slots: daySlots(date, taken, now) });
  }

  if (p === '/api/next' && method === 'GET') {
    const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '3', 10) || 3, 1), 6);
    const today = trToday(now);
    const end = maxDate(now);
    const taken = await takenSet(env, today, end);
    const out = [];
    for (let d = today; d <= end && out.length < limit; d = addDays(d, 1)) {
      for (const s of daySlots(d, taken, now)) {
        if (s.available) out.push({ date: d, time: s.time, de: s.de });
        if (out.length >= limit) break;
      }
    }
    return json({ slots: out });
  }

  if (p === '/api/book' && method === 'POST') {
    return book(request, env, ctx, now);
  }

  if (p === '/api/appointment' && method === 'GET') {
    const id = url.searchParams.get('id') || '';
    const t = url.searchParams.get('t') || '';
    const a = await env.DB.prepare('SELECT * FROM appointments WHERE id = ?1 AND cancel_token = ?2').bind(id, t).first();
    if (!a) return json({ error: 'Randevu bulunamadı.' }, 404);
    return json({
      id: a.id, status: a.status, topic: TOPICS[a.topic] ? TOPICS[a.topic].tr : a.topic,
      date: longDate(a.date, a.time, 'tr'), time: a.time, de: deTime(a.date, a.time), mode: modeLabel(a, 'tr'),
      past: instant(a.date, a.time).getTime() < now.getTime(),
    });
  }

  if (p === '/api/cancel' && method === 'POST') {
    let body;
    try { body = await request.json(); } catch { return json({ error: 'Geçersiz istek.' }, 400); }
    const id = typeof body.id === 'string' ? body.id : '';
    const t = typeof body.t === 'string' ? body.t : '';
    const a = await env.DB.prepare('SELECT * FROM appointments WHERE id = ?1 AND cancel_token = ?2').bind(id, t).first();
    if (!a) return json({ error: 'Randevu bulunamadı.' }, 404);
    if (a.status === 'iptal') return json({ ok: true, already: true });
    if (instant(a.date, a.time).getTime() < now.getTime()) return json({ error: 'Geçmiş bir randevu iptal edilemez.' }, 409);
    await env.DB.prepare("UPDATE appointments SET status = 'iptal' WHERE id = ?1").bind(a.id).run();
    ctx.waitUntil(
      sendMail(env, {
        to: env.TEAM_EMAIL,
        subject: `Randevu iptal edildi: ${a.date} ${a.time} · ${a.name}`,
        html: mailShell(`<p style="margin:0;font-weight:bold;">Aday randevusunu iptal etti.</p>${detailsTable([['Randevu no', a.id], ['Ad soyad', a.name], ['Tarih', longDate(a.date, a.time, 'tr')], ['Saat', a.time + ' TR']])}<p style="margin:0;">Bu saat yeniden randevuya açıldı.</p>`, 'tr'),
      }).catch((e) => console.error('iptal e-postası', e))
    );
    return json({ ok: true });
  }

  return json({ error: 'Bulunamadı.' }, 404);
}

async function book(request, env, ctx, now) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Geçersiz istek.' }, 400); }
  const s = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

  // Bot tuzağı: gerçek kullanıcılar bu alanı görmez ve boş bırakır.
  if (s(body.website, 200)) return json({ error: 'Geçersiz istek.' }, 400);

  const d = {
    topic: s(body.topic, 30),
    mode: s(body.mode, 20),
    office: s(body.office, 20) || null,
    lang: body.lang === 'de' ? 'de' : 'tr',
    date: s(body.date, 10),
    time: s(body.time, 5),
    name: s(body.name, 100),
    phone: s(body.phone, 30),
    email: s(body.email, 160).toLowerCase(),
    level: s(body.level, 5),
    note: s(body.note, 1000),
  };
  if (!TOPICS[d.topic]) return json({ error: 'Lütfen bir konu seçin.' }, 400);
  if (!MODES[d.mode]) return json({ error: 'Lütfen görüşme şeklini seçin.' }, 400);
  if (d.mode === 'ofis' && !OFFICES[d.office]) return json({ error: 'Lütfen bir ofis seçin.' }, 400);
  if (d.mode !== 'ofis') d.office = null;
  if (!isValidDate(d.date) || !baseSlots(d.date).includes(d.time) || !bookable(d.date, d.time, now)) {
    return json({ error: 'Bu saat artık seçilemiyor. Lütfen başka bir saat seçin.', code: 'slot' }, 409);
  }
  if (d.name.length < 2) return json({ error: 'Lütfen adınızı ve soyadınızı yazın.' }, 400);
  if (!/^[0-9+()\-\s]{7,30}$/.test(d.phone)) return json({ error: 'Lütfen geçerli bir telefon numarası yazın.' }, 400);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(d.email)) return json({ error: 'Lütfen geçerli bir e-posta adresi yazın.' }, 400);
  if (!LEVELS.includes(d.level)) d.level = '';
  if (body.kvkk !== true) return json({ error: 'Devam etmek için KVKK ve gizlilik onayı gerekli.' }, 400);

  if (env.TURNSTILE_SECRET) {
    const ok = await verifyTurnstile(env, body.turnstile, request.headers.get('CF-Connecting-IP'));
    if (!ok) return json({ error: 'Güvenlik doğrulaması tamamlanamadı. Sayfayı yenileyip tekrar deneyin.', code: 'turnstile' }, 403);
  }

  const id = makeId(d.date, d.time);
  const token = crypto.randomUUID();
  const nowIso = now.toISOString();
  // Randevu 30 saatten yakınsa ayrıca hatırlatma gönderme (onay e-postası yeterli).
  const reminderDone = instant(d.date, d.time).getTime() - now.getTime() < 30 * 3600e3 ? 1 : 0;
  try {
    await env.DB.prepare(
      `INSERT INTO appointments (id, created_at, topic, mode, office, lang, date, time, name, phone, email, level, note, status, cancel_token, reminder_sent, consent_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, 'onaylandi', ?14, ?15, ?2)`
    )
      .bind(id, nowIso, d.topic, d.mode, d.office, d.lang, d.date, d.time, d.name, d.phone, d.email, d.level || null, d.note || null, token, reminderDone)
      .run();
  } catch (e) {
    if (String(e && e.message).includes('UNIQUE')) {
      return json({ error: 'Bu saat az önce doldu. Lütfen başka bir saat seçin.', code: 'slot' }, 409);
    }
    throw e;
  }

  const appt = { id, ...d, cancel_token: token };
  ctx.waitUntil(
    (async () => {
      await sendMail(env, candidateMail(env, appt)).catch((e) => console.error('aday e-postası', e));
      await sendMail(env, teamMail(env, appt)).catch((e) => console.error('ekip e-postası', e));
    })()
  );

  return json({
    ok: true,
    id,
    topic: TOPICS[d.topic].tr,
    date: longDate(d.date, d.time, 'tr'),
    time: d.time,
    de: deTime(d.date, d.time),
    mode: modeLabel(appt, 'tr'),
    lang: d.lang === 'de' ? 'Deutsch' : 'Türkçe',
    where: whereText(appt, 'tr'),
    gcal: gcalLink(appt),
    email: d.email,
    reminder: reminderDone === 0,
  });
}

// ---------------------------------------------------------------------------
// Ekip paneli (/panel) — şifreyle korunur
// ---------------------------------------------------------------------------
async function checkAuth(request, env) {
  const h = request.headers.get('Authorization') || '';
  if (!h.startsWith('Basic ')) return false;
  let decoded;
  try { decoded = atob(h.slice(6)); } catch { return false; }
  const pass = decoded.slice(decoded.indexOf(':') + 1);
  const a = new TextEncoder().encode(pass);
  const b = new TextEncoder().encode(env.PANEL_PASSWORD);
  if (a.byteLength !== b.byteLength) return false;
  return crypto.subtle.timingSafeEqual(a, b);
}

function panelPage(rows, now, flash) {
  const today = trToday(now);
  const weekEnd = addDays(today, 7);
  const active = rows.filter((r) => r.status === 'onaylandi' && r.date >= today);
  const todayCount = active.filter((r) => r.date === today).length;
  const weekCount = active.filter((r) => r.date <= weekEnd).length;
  const byDate = new Map();
  for (const r of rows) {
    if (!byDate.has(r.date)) byDate.set(r.date, []);
    byDate.get(r.date).push(r);
  }
  const statusColors = { onaylandi: ['#E3F1E6', '#1F6B3A'], iptal: ['#FBE4DA', '#9A3412'], gelmedi: ['#F6EBD3', '#7A4B05'], tamamlandi: ['#E7E5E0', '#3F3D39'] };
  const groups = [...byDate.entries()]
    .map(([date, list]) => {
      const items = list
        .map((r) => {
          const [bg, fg] = statusColors[r.status] || ['#E7E5E0', '#3F3D39'];
          const waDigits = r.phone.replace(/[^0-9]/g, '');
          const opts = Object.entries(STATUSES).map(([k, v]) => `<option value="${k}"${k === r.status ? ' selected' : ''}>${v}</option>`).join('');
          return `<tr${r.status === 'iptal' ? ' style="opacity:.55"' : ''}>
<td style="white-space:nowrap"><b>${esc(r.time)}</b><br><small>${esc(deTime(r.date, r.time))} DE</small></td>
<td><b>${esc(r.name)}</b><br><small>${esc(r.id)}</small></td>
<td>${esc(TOPICS[r.topic] ? TOPICS[r.topic].tr : r.topic)}<br><small>${esc(modeLabel(r, 'tr'))} · ${r.lang === 'de' ? 'Almanca' : 'Türkçe'}</small></td>
<td><a href="tel:${esc(r.phone)}">${esc(r.phone)}</a><br><a href="https://wa.me/${esc(waDigits)}">WhatsApp</a> · <a href="mailto:${esc(r.email)}">${esc(r.email)}</a></td>
<td>${esc(r.level || '—')}</td>
<td style="max-width:260px">${esc(r.note || '—')}</td>
<td><span style="display:inline-block;padding:3px 10px;border-radius:999px;background:${bg};color:${fg};font-weight:700;font-size:13px">${esc(STATUSES[r.status] || r.status)}</span>
<form method="post" action="/panel/durum" style="margin-top:6px;display:flex;gap:6px"><input type="hidden" name="id" value="${esc(r.id)}"><select name="status" aria-label="Durum">${opts}</select><button type="submit">Kaydet</button></form></td>
</tr>`;
        })
        .join('');
      const isToday = date === today;
      return `<h2>${esc(longDate(date, '12:00', 'tr'))}${isToday ? ' <span class="today">Bugün</span>' : ''}</h2>
<div class="tbl"><table><thead><tr><th>Saat (TR)</th><th>Aday</th><th>Konu / görüşme</th><th>İletişim</th><th>Almanca</th><th>Not</th><th>Durum</th></tr></thead><tbody>${items}</tbody></table></div>`;
    })
    .join('');
  return `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Randevu Paneli · MetaAlmanya</title>
<link rel="stylesheet" href="/assets/site.css">
<style>
body{background:#F7F4EF}
.wrap{max-width:1280px;margin:0 auto;padding:28px 20px 60px}
.top{display:flex;flex-wrap:wrap;gap:12px 24px;justify-content:space-between;align-items:center}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin:20px 0}
.stat{background:#fff;border:1px solid #E6E0D6;border-radius:14px;padding:14px 18px}
.stat b{display:block;font-family:'Bricolage Grotesque',sans-serif;font-size:30px;line-height:1.1}
h2{font-size:19px;margin:28px 0 10px}
.today{font-size:12px;background:#FBEDE6;color:#9A3412;padding:3px 10px;border-radius:999px;vertical-align:middle}
.tbl{overflow-x:auto;background:#fff;border:1px solid #E6E0D6;border-radius:14px}
table{width:100%;border-collapse:collapse;font-size:14px}
th,td{text-align:left;padding:10px 12px;border-bottom:1px solid #EFEAE2;vertical-align:top}
th{font-size:12px;color:#5E5B55;letter-spacing:.04em;text-transform:uppercase;background:#FAF8F4}
small{color:#5E5B55}
select,button{font:inherit;font-size:13px;min-height:34px;border-radius:8px;border:1px solid #CFC6B8;background:#fff;padding:0 8px}
button{background:#2C2C2A;color:#fff;border:0;cursor:pointer;padding:0 12px}
.flash{background:#E3F1E6;color:#1F6B3A;padding:10px 14px;border-radius:10px;font-weight:700}
.empty{background:#fff;border:1px solid #E6E0D6;border-radius:14px;padding:24px;color:#5E5B55}
</style></head><body><div class="wrap">
<div class="top"><p style="margin:0;font-family:'Bricolage Grotesque',sans-serif;font-weight:800;font-size:22px">Meta<span style="color:#C24A22">Almanya</span> <span style="font-weight:500;color:#5E5B55;font-size:16px">· Randevu paneli</span></p>
<a href="/randevu/" style="font-weight:700">+ Yeni randevu gir</a></div>
${flash ? `<p class="flash" role="status">${esc(flash)}</p>` : ''}
<div class="stats"><div class="stat">Bugün<b>${todayCount}</b></div><div class="stat">Önümüzdeki 7 gün<b>${weekCount}</b></div><div class="stat">Yaklaşan toplam<b>${active.length}</b></div></div>
${groups || '<p class="empty">Gösterilecek randevu yok.</p>'}
<p style="margin-top:28px;font-size:13px;color:#5E5B55">Son 7 günden itibaren randevular gösterilir. Saatler Türkiye saatidir.</p>
</div></body></html>`;
}

async function panel(request, env, url, now) {
  const headers = { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex' };
  if (!env.PANEL_PASSWORD) return new Response('Panel şifresi ayarlanmamış (PANEL_PASSWORD).', { status: 503, headers });
  if (!(await checkAuth(request, env))) {
    return new Response('Giriş gerekli.', { status: 401, headers: { ...headers, 'WWW-Authenticate': 'Basic realm="MetaAlmanya Panel", charset="UTF-8"' } });
  }
  if (request.method === 'POST' && url.pathname === '/panel/durum') {
    const origin = request.headers.get('Origin');
    if (origin && origin !== url.origin) return new Response('İzin yok.', { status: 403, headers });
    const form = await request.formData();
    const id = String(form.get('id') || '');
    const st = String(form.get('status') || '');
    if (STATUSES[st]) await env.DB.prepare('UPDATE appointments SET status = ?1 WHERE id = ?2').bind(st, id).run();
    return Response.redirect(url.origin + '/panel?ok=1', 303);
  }
  if (request.method !== 'GET' || url.pathname !== '/panel') return new Response('Bulunamadı.', { status: 404, headers });
  const from = addDays(trToday(now), -7);
  const { results } = await env.DB.prepare('SELECT * FROM appointments WHERE date >= ?1 ORDER BY date, time LIMIT 500').bind(from).all();
  return new Response(panelPage(results, now, url.searchParams.get('ok') ? 'Durum güncellendi.' : ''), { headers });
}

// ---------------------------------------------------------------------------
// Veritabanı tablosu yoksa otomatik oluşturulur (ayrı kurulum adımı gerekmez).
// migrations/0001_randevular.sql ile aynıdır.
// ---------------------------------------------------------------------------
let schemaReady = false;
async function ensureSchema(env) {
  if (schemaReady) return;
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS appointments (
      id TEXT PRIMARY KEY, created_at TEXT NOT NULL, topic TEXT NOT NULL, mode TEXT NOT NULL, office TEXT,
      lang TEXT NOT NULL DEFAULT 'tr', date TEXT NOT NULL, time TEXT NOT NULL, name TEXT NOT NULL, phone TEXT NOT NULL,
      email TEXT NOT NULL, level TEXT, note TEXT, status TEXT NOT NULL DEFAULT 'onaylandi', cancel_token TEXT NOT NULL,
      reminder_sent INTEGER NOT NULL DEFAULT 0, consent_at TEXT NOT NULL)`),
    env.DB.prepare("CREATE UNIQUE INDEX IF NOT EXISTS uniq_active_slot ON appointments(date, time) WHERE status != 'iptal'"),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_date ON appointments(date)'),
  ]);
  schemaReady = true;
}

// ---------------------------------------------------------------------------
// Giriş noktaları
// ---------------------------------------------------------------------------
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const now = new Date();
    try {
      if (url.pathname.startsWith('/api/')) {
        await ensureSchema(env);
        return await api(request, env, ctx, url, now);
      }
      if (url.pathname === '/panel' || url.pathname.startsWith('/panel/')) {
        await ensureSchema(env);
        return await panel(request, env, url, now);
      }
      return env.ASSETS.fetch(request);
    } catch (err) {
      console.error(err);
      return json({ error: 'Beklenmeyen bir hata oluştu. Lütfen tekrar deneyin veya WhatsApp üzerinden yazın.' }, 500);
    }
  },

  // Saatte bir: 24 saat kala hatırlatma e-postası, eski kayıtların silinmesi.
  async scheduled(event, env, ctx) {
    await ensureSchema(env);
    const now = new Date();
    const today = trToday(now);
    const { results } = await env.DB
      .prepare("SELECT * FROM appointments WHERE status = 'onaylandi' AND reminder_sent = 0 AND date BETWEEN ?1 AND ?2")
      .bind(today, addDays(today, 2))
      .all();
    for (const a of results) {
      const ms = instant(a.date, a.time).getTime() - now.getTime();
      if (ms > 0 && ms <= 24 * 3600e3) {
        try {
          const sent = await sendMail(env, reminderMail(env, a));
          if (sent) await env.DB.prepare('UPDATE appointments SET reminder_sent = 1 WHERE id = ?1').bind(a.id).run();
        } catch (e) {
          console.error('hatırlatma', a.id, e);
        }
      }
    }
    await env.DB.prepare('DELETE FROM appointments WHERE date < ?1').bind(addDays(today, -RETENTION_DAYS)).run();
  },
};
