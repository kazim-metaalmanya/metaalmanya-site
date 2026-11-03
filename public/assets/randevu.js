// MetaAlmanya randevu ekranı — 5 adım: konu, görüşme şekli, tarih/saat, bilgiler, onay.
(function () {
  'use strict';

  var TOPICS = [
    { id: 'ausbildung', label: 'Ausbildung', desc: 'Maaşlı mesleki eğitim' },
    { id: 'hemsire', label: 'Hemşire denklik kampı', desc: 'Denklik ve Kenntnisprüfung' },
    { id: 'surucu', label: 'Sürücü yerleştirme', desc: 'TIR, otobüs, kargo' },
    { id: 'kurye', label: 'Kurye ve dağıtım', desc: 'NRW bölgesi' },
    { id: 'vize', label: 'Vize ve §81a', desc: 'Hızlandırılmış süreç' },
    { id: 'sirket', label: 'Şirket kurulumu', desc: 'GmbH, UG, İngiltere' },
    { id: 'egitim', label: 'Dil okulu ve yurtdışı eğitim', desc: 'Almanya, Kanada ve diğerleri' },
    { id: 'isveren', label: 'İşveren görüşmesi', desc: 'Für Arbeitgeber' }
  ];
  var MODES = [
    { id: 'online', label: 'Online görüntülü', desc: 'Google Meet veya WhatsApp' },
    { id: 'telefon', label: 'Telefon', desc: 'Seçtiğiniz saatte sizi arıyoruz' },
    { id: 'ofis', label: 'Ofiste', desc: 'Bochum, Bandırma veya İstanbul' }
  ];
  var OFFICES = [
    { id: 'bochum', label: 'Bochum', desc: 'Kortumstr. 56' },
    { id: 'bandirma', label: 'Bandırma', desc: 'Merkez ofis' },
    { id: 'istanbul', label: 'İstanbul', desc: 'Beylikdüzü' }
  ];
  var LANGS = [{ id: 'tr', label: 'Türkçe' }, { id: 'de', label: 'Deutsch' }];
  var STEPS = ['Konu', 'Görüşme şekli', 'Tarih ve saat', 'Bilgileriniz', 'Onay'];
  var MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
  var WD_LONG = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];

  var params = new URLSearchParams(location.search);
  var S = {
    step: 1,
    topic: find(TOPICS, params.get('konu')) ? params.get('konu') : null,
    mode: null,
    office: null,
    lang: params.get('dil') === 'de' ? 'de' : 'tr',
    date: /^\d{4}-\d{2}-\d{2}$/.test(params.get('tarih') || '') ? params.get('tarih') : null,
    time: /^\d{2}:\d{2}$/.test(params.get('saat') || '') ? params.get('saat') : null,
    form: { name: '', phone: '', email: '', level: '', note: '', kvkk: false, website: '' },
    config: null,
    month: null,
    monthData: null,
    slots: null,
    slotsFor: null,
    turnstileToken: '',
    turnstileWidget: null,
    submitting: false,
    error: '',
    result: null
  };

  var stepsEl = document.getElementById('rv-steps');
  var panel = document.getElementById('rv-panel');
  var summary = document.getElementById('rv-summary');

  function find(list, id) {
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }
  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function dateLong(iso) {
    var d = new Date(iso + 'T12:00:00Z');
    return d.getUTCDate() + ' ' + MONTHS[d.getUTCMonth()] + ' ' + d.getUTCFullYear() + ', ' + WD_LONG[d.getUTCDay()];
  }
  function ymOf(iso) { return iso.slice(0, 7); }
  function ymShift(ym, n) {
    var d = new Date(ym + '-15T12:00:00Z');
    d.setUTCMonth(d.getUTCMonth() + n);
    return d.toISOString().slice(0, 7);
  }
  function getJSON(url) {
    return fetch(url, { headers: { accept: 'application/json' } }).then(function (r) {
      return r.json().then(function (j) { if (!r.ok) throw j; return j; });
    });
  }
  var ICON_PREV = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"></path></svg>';
  var ICON_NEXT = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"></path></svg>';

  // ---------- Doğrulama ----------
  function stepOk(step) {
    if (step === 1) return !!S.topic;
    if (step === 2) return !!S.mode && (S.mode !== 'ofis' || !!S.office);
    if (step === 3) return !!S.date && !!S.time && slotAvailable(S.date, S.time);
    if (step === 4) {
      var f = S.form;
      var tsOk = !(S.config && S.config.turnstileSiteKey) || !!S.turnstileToken;
      return f.name.trim().length > 1 && /^[0-9+()\-\s]{7,30}$/.test(f.phone.trim()) &&
        /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(f.email.trim()) && f.kvkk && tsOk;
    }
    return true;
  }
  function slotAvailable(date, time) {
    if (!S.slots || S.slotsFor !== date) return false;
    for (var i = 0; i < S.slots.length; i++) if (S.slots[i].time === time) return S.slots[i].available;
    return false;
  }

  // ---------- Çizim ----------
  function renderSteps() {
    stepsEl.innerHTML = STEPS.map(function (label, i) {
      var k = i + 1;
      var cls = k === S.step ? 'is-current' : (k < S.step ? 'is-done' : '');
      var canGo = k < S.step && S.step < 5;
      return '<li><button type="button" class="rv-step ' + cls + '" data-go="' + k + '"' + (canGo ? '' : ' disabled') +
        (k === S.step ? ' aria-current="step"' : '') + '><span class="num">' + (k < S.step ? '✓' : k) + '</span>' + esc(label) + '</button></li>';
    }).join('');
  }

  function renderSummary() {
    var t = find(TOPICS, S.topic), m = find(MODES, S.mode), o = find(OFFICES, S.office), l = find(LANGS, S.lang);
    var modeText = m ? (S.mode === 'ofis' ? 'Ofiste' + (o ? ' · ' + o.label : '') : m.label) : '—';
    var timeText = '—';
    if (S.date && S.time) {
      var de = '';
      if (S.slots && S.slotsFor === S.date) S.slots.forEach(function (s) { if (s.time === S.time) de = s.de; });
      timeText = S.time + ' Türkiye' + (de ? ' · ' + de + ' Almanya' : '');
    }
    var rows = [['Konu', t ? t.label : '—'], ['Görüşme', modeText], ['Dil', l ? l.label : '—'], ['Tarih', S.date ? dateLong(S.date) : '—'], ['Saat', timeText]];
    summary.innerHTML = rows.map(function (r) { return '<div><dt>' + esc(r[0]) + '</dt><dd>' + esc(r[1]) + '</dd></div>'; }).join('');
  }

  function cards(list, key, selected) {
    return list.map(function (x) {
      return '<button type="button" class="rv-card" data-set="' + key + '" data-val="' + x.id + '" aria-pressed="' + (x.id === selected) + '"><b>' + esc(x.label) + '</b><span>' + esc(x.desc) + '</span></button>';
    }).join('');
  }

  function navHtml() {
    var back = S.step > 1 ? '<button type="button" class="rv-btn secondary" data-action="back">← Geri</button>' : '<span></span>';
    var label = S.step === 4 ? (S.submitting ? 'Gönderiliyor…' : 'Randevuyu onayla') : 'Devam →';
    return '<div class="rv-nav">' + back + '<button type="button" class="rv-btn" id="rv-next" data-action="next"' + (stepOk(S.step) && !S.submitting ? '' : ' disabled') + '>' + label + '</button></div>';
  }
  function errorHtml() {
    return S.error ? '<p class="rv-error" role="alert">' + esc(S.error) + '</p>' : '';
  }

  function renderPanel(focus) {
    var h = '';
    if (S.step === 1) {
      h = '<h2 tabindex="-1">Hangi konuda görüşmek istiyorsunuz?</h2><p class="rv-lead">Seçiminize göre görüşmeyi doğru danışmanla planlıyoruz.</p>' +
        '<div class="rv-grid">' + cards(TOPICS, 'topic', S.topic) + '</div>' + errorHtml() + navHtml();
    } else if (S.step === 2) {
      h = '<h2 tabindex="-1">Nasıl görüşelim?</h2><p class="rv-lead">Size en rahat gelen yolu seçin.</p>' +
        '<div class="rv-grid">' + cards(MODES, 'mode', S.mode) + '</div>' +
        (S.mode === 'ofis' ? '<h3 class="rv-h3">Hangi ofis?</h3><div class="rv-grid">' + cards(OFFICES, 'office', S.office) + '</div>' : '') +
        '<h3 class="rv-h3">Görüşme dili</h3><div style="display:flex;flex-wrap:wrap;gap:8px">' +
        LANGS.map(function (l) { return '<button type="button" class="rv-pill" data-set="lang" data-val="' + l.id + '" aria-pressed="' + (l.id === S.lang) + '">' + l.label + '</button>'; }).join('') +
        '</div>' + errorHtml() + navHtml();
    } else if (S.step === 3) {
      h = '<h2 tabindex="-1">Gün ve saat seçin</h2><p class="rv-lead">Saatler Türkiye saatine göredir; yanında Almanya saati yazar.</p>' +
        '<div class="rv-cal-wrap"><div class="rv-cal">' + calendarHtml() + '</div><div class="rv-slots">' + slotsHtml() + '</div></div>' +
        errorHtml() + navHtml();
    } else if (S.step === 4) {
      var f = S.form;
      h = '<h2 tabindex="-1">Bilgileriniz</h2><p class="rv-lead">Onay ve hatırlatma e-postası bu bilgilere gönderilir.</p>' +
        '<div class="rv-form">' +
        field('rv-name', 'Ad Soyad *', '<input id="rv-name" name="name" type="text" autocomplete="name" required maxlength="100" placeholder="Adınız ve soyadınız" value="' + esc(f.name) + '">') +
        field('rv-phone', 'Telefon (WhatsApp) *', '<input id="rv-phone" name="phone" type="tel" autocomplete="tel" required maxlength="30" placeholder="+90 5xx xxx xx xx" value="' + esc(f.phone) + '">') +
        field('rv-email', 'E-posta *', '<input id="rv-email" name="email" type="email" autocomplete="email" required maxlength="160" placeholder="ornek@eposta.com" value="' + esc(f.email) + '">') +
        field('rv-level', 'Almanca seviyeniz', '<select id="rv-level" name="level">' +
          [['', 'Seçin'], ['yok', 'Henüz yok'], ['A1', 'A1'], ['A2', 'A2'], ['B1', 'B1'], ['B2', 'B2'], ['C1', 'C1 ve üzeri']].map(function (o) {
            return '<option value="' + o[0] + '"' + (o[0] === f.level ? ' selected' : '') + '>' + o[1] + '</option>';
          }).join('') + '</select>') +
        '<div class="rv-field full"><label for="rv-note">Kısa not (isteğe bağlı)</label><textarea id="rv-note" name="note" rows="3" maxlength="1000" placeholder="Mesleğiniz, eğitiminiz veya sormak istedikleriniz">' + esc(f.note) + '</textarea></div>' +
        '</div>' +
        '<div class="rv-hp" aria-hidden="true"><label for="rv-website">Web siteniz</label><input id="rv-website" name="website" type="text" tabindex="-1" autocomplete="off"></div>' +
        '<div style="display:flex;flex-direction:column;gap:12px;margin-top:20px">' +
        '<label class="rv-check"><input type="checkbox" name="kvkk"' + (f.kvkk ? ' checked' : '') + '><span><a href="/kvkk/" target="_blank" rel="noopener">KVKK Aydınlatma Metni</a>\'ni ve <a href="/datenschutz/" target="_blank" rel="noopener" lang="de">Datenschutzerklärung</a>\'u okudum; bilgilerimin randevu için işlenmesini kabul ediyorum. *</span></label>' +
        '</div>' +
        '<div id="ts-box" style="margin-top:16px"></div>' +
        '<p id="rv-missing" style="margin:14px 0 0;font-size:14px;color:#5E5B55">* ile işaretli alanlar ve onay kutusu zorunludur.</p>' +
        errorHtml() + navHtml();
    } else if (S.step === 5) {
      var r = S.result;
      h = '<div style="text-align:center;padding:8px 0 4px"><span class="rv-ok"><svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"></path></svg></span>' +
        '<h2 tabindex="-1" style="margin:16px 0 6px;font-size:28px">Randevunuz alındı.</h2>' +
        '<p style="margin:0;color:#5E5B55">Onay e-postası <b style="color:#2C2C2A">' + esc(r.email) + '</b> adresine gönderiliyor. Gelen kutunuzda yoksa spam klasörüne bakın.</p></div>' +
        '<dl class="rv-summary">' +
        [['Randevu no', r.id], ['Konu', r.topic], ['Tarih', r.date], ['Saat', r.time + ' Türkiye · ' + r.de + ' Almanya'], ['Görüşme', r.mode + ' · ' + r.lang], ['Yer / bağlantı', r.where]]
          .map(function (x) { return '<div><dt>' + esc(x[0]) + '</dt><dd>' + esc(x[1]) + '</dd></div>'; }).join('') +
        '</dl>' +
        '<div style="display:flex;flex-wrap:wrap;gap:10px;margin-top:20px;justify-content:center">' +
        '<a class="rv-btn dark" style="display:inline-flex;align-items:center;text-decoration:none;color:#fff" href="' + esc(r.gcal) + '" target="_blank" rel="noopener">Google Takvim\'e ekle</a>' +
        '<a class="rv-btn secondary" style="display:inline-flex;align-items:center;text-decoration:none" href="https://wa.me/905518675205">WhatsApp\'tan yaz</a>' +
        '<a class="rv-btn secondary" style="display:inline-flex;align-items:center;text-decoration:none;border-color:transparent;color:#B4431D" href="/">Ana sayfaya dön</a>' +
        '</div>' +
        '<p style="margin:18px 0 0;text-align:center;font-size:14px;color:#5E5B55">' +
        (r.reminder ? 'Görüşmeden bir gün önce hatırlatma e-postası alacaksınız. ' : '') +
        'İptal bağlantısı onay e-postasındadır.</p>';
    }
    panel.innerHTML = h;
    if (S.step === 4) setupTurnstile();
    renderSteps();
    renderSummary();
    if (focus) {
      var h2 = panel.querySelector('h2');
      if (h2) h2.focus();
    }
  }

  function field(id, label, control) {
    return '<div class="rv-field"><label for="' + id + '">' + label + '</label>' + control + '</div>';
  }

  function calendarHtml() {
    if (!S.monthData || S.monthData.ym !== S.month) {
      return '<div class="skeleton" style="height:44px"></div><div class="skeleton" style="height:300px;margin-top:12px"></div>';
    }
    var md = S.monthData;
    var y = +S.month.slice(0, 4), mo = +S.month.slice(5, 7);
    var minYm = ymOf(md.today), maxYm = ymOf(md.maxDate);
    var head = '<div class="rv-cal-head"><button type="button" class="rv-icon-btn" data-action="prev-month" aria-label="Önceki ay"' + (S.month <= minYm ? ' disabled' : '') + '>' + ICON_PREV + '</button>' +
      '<p style="margin:0;font-weight:700;font-size:18px">' + MONTHS[mo - 1] + ' ' + y + '</p>' +
      '<button type="button" class="rv-icon-btn" data-action="next-month" aria-label="Sonraki ay"' + (S.month >= maxYm ? ' disabled' : '') + '>' + ICON_NEXT + '</button></div>';
    var week = '<div class="rv-week" aria-hidden="true"><span>Pzt</span><span>Sal</span><span>Çar</span><span>Per</span><span>Cum</span><span>Cmt</span><span>Paz</span></div>';
    var first = new Date(S.month + '-01T12:00:00Z').getUTCDay();
    var blanks = (first + 6) % 7;
    var cells = '';
    for (var b = 0; b < blanks; b++) cells += '<span aria-hidden="true"></span>';
    md.days.forEach(function (d) {
      var n = +d.date.slice(8, 10);
      var inRange = d.date >= md.today && d.date <= md.maxDate;
      var avail = inRange && d.open && d.free > 0;
      var full = inRange && !!d.full;
      var label = n + ' ' + MONTHS[mo - 1] + (avail ? ', ' + d.free + ' boş saat' : full ? ', dolu' : !d.open ? ', kapalı' : '');
      cells += '<button type="button" class="rv-day' + (full ? ' is-full' : '') + '" data-day="' + d.date + '" aria-label="' + esc(label) + '" aria-pressed="' + (S.date === d.date) + '"' + (avail ? '' : ' disabled') + '>' + n + '</button>';
    });
    var legend = '<div class="rv-legend"><span>Kalın: müsait</span><span style="text-decoration:line-through">Üstü çizili: dolu</span><span>Pazar: kapalı</span></div>';
    return head + week + '<div class="rv-days">' + cells + '</div>' + legend;
  }

  function slotsHtml() {
    if (!S.date) return '<p style="margin:0 0 12px;font-weight:700;font-size:17px">Saat seçimi</p><p class="rv-note">Takvimden müsait bir gün seçin; o günün boş saatleri burada görünür.</p>';
    var title = '<p style="margin:0 0 12px;font-weight:700;font-size:17px">' + esc(dateLong(S.date)) + '</p>';
    if (S.slotsFor !== S.date || !S.slots) return title + '<div class="skeleton" style="height:52px"></div><div class="skeleton" style="height:52px;margin-top:8px"></div><div class="skeleton" style="height:52px;margin-top:8px"></div>';
    if (!S.slots.length) return title + '<p class="rv-note">Bu gün randevu verilmiyor.</p>';
    return title + '<div class="rv-slot-list">' + S.slots.map(function (s) {
      return '<button type="button" class="rv-slot" data-time="' + s.time + '" aria-pressed="' + (S.time === s.time && s.available) + '"' + (s.available ? '' : ' disabled') + '>' +
        '<b>' + s.time + ' <span style="font-weight:500;font-size:13px">TR</span></b><small>' + (s.available ? s.de + ' DE' : 'Dolu') + '</small></button>';
    }).join('') + '</div>';
  }

  // ---------- Veri ----------
  function loadMonth(ym) {
    S.month = ym;
    S.monthData = null;
    renderPanel(false);
    return getJSON('/api/month?ym=' + ym).then(function (data) {
      if (S.month !== ym) return;
      S.monthData = data;
      renderPanel(false);
    }).catch(function () {
      S.error = 'Takvim yüklenemedi. Sayfayı yenileyin veya WhatsApp\'tan yazın.';
      renderPanel(false);
    });
  }
  function loadSlots(date) {
    S.slotsFor = date;
    S.slots = null;
    renderPanel(false);
    return getJSON('/api/slots?date=' + date).then(function (data) {
      if (S.slotsFor !== date) return;
      S.slots = data.slots;
      if (S.time && !slotAvailable(date, S.time)) S.time = null;
      renderPanel(false);
    }).catch(function () {
      S.error = 'Saatler yüklenemedi. Lütfen tekrar deneyin.';
      renderPanel(false);
    });
  }
  function enterStep3() {
    var c = S.config;
    var startYm = S.date && S.date >= c.today && S.date <= c.maxDate ? ymOf(S.date) : ymOf(c.today);
    if (!(S.date && S.date >= c.today && S.date <= c.maxDate)) { S.date = null; S.time = null; }
    if (!S.monthData || S.monthData.ym !== startYm) loadMonth(startYm);
    if (S.date && S.slotsFor !== S.date) loadSlots(S.date);
  }

  // ---------- Turnstile (spam koruması) ----------
  function setupTurnstile() {
    var key = S.config && S.config.turnstileSiteKey;
    var box = document.getElementById('ts-box');
    if (!key || !box) return;
    S.turnstileToken = '';
    function render() {
      S.turnstileWidget = window.turnstile.render(box, {
        sitekey: key,
        language: 'tr',
        callback: function (t) { S.turnstileToken = t; updateNext(); },
        'expired-callback': function () { S.turnstileToken = ''; updateNext(); },
        'error-callback': function () { S.turnstileToken = ''; updateNext(); }
      });
    }
    if (window.turnstile) return render();
    window.onTurnstileLoad = render;
    if (!document.getElementById('ts-script')) {
      var s = document.createElement('script');
      s.id = 'ts-script';
      s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onTurnstileLoad&render=explicit';
      s.async = true;
      document.head.appendChild(s);
    }
  }

  function updateNext() {
    var btn = document.getElementById('rv-next');
    if (btn) btn.disabled = !stepOk(S.step) || S.submitting;
  }

  // ---------- Gönderim ----------
  function submit() {
    if (S.submitting || !stepOk(4)) return;
    S.submitting = true;
    S.error = '';
    updateNext();
    var btn = document.getElementById('rv-next');
    if (btn) btn.textContent = 'Gönderiliyor…';
    var f = S.form;
    fetch('/api/book', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        topic: S.topic, mode: S.mode, office: S.office, lang: S.lang, date: S.date, time: S.time,
        name: f.name, phone: f.phone, email: f.email, level: f.level, note: f.note, kvkk: f.kvkk,
        website: f.website, turnstile: S.turnstileToken
      })
    }).then(function (r) {
      return r.json().then(function (j) { return { status: r.status, body: j }; });
    }).then(function (res) {
      S.submitting = false;
      if (res.body && res.body.ok) {
        S.result = res.body;
        S.step = 5;
        renderPanel(true);
        return;
      }
      S.error = (res.body && res.body.error) || 'Randevu kaydedilemedi. Lütfen tekrar deneyin.';
      if (res.body && res.body.code === 'slot') {
        S.time = null;
        S.step = 3;
        S.monthData = null;
        enterStep3();
        renderPanel(true);
        return;
      }
      renderPanel(false);
    }).catch(function () {
      S.submitting = false;
      S.error = 'Bağlantı hatası. İnternetinizi kontrol edip tekrar deneyin.';
      renderPanel(false);
    });
  }

  // ---------- Olaylar ----------
  function goStep(n) {
    S.error = '';
    S.step = n;
    if (n === 3) enterStep3();
    renderPanel(true);
  }

  document.addEventListener('click', function (e) {
    var t = e.target.closest('button');
    if (!t || !t.closest('main')) return;
    if (t.dataset.go) { goStep(+t.dataset.go); return; }
    if (t.dataset.set) {
      var key = t.dataset.set, val = t.dataset.val;
      S[key] = val;
      if (key === 'mode' && val !== 'ofis') S.office = null;
      S.error = '';
      renderPanel(false);
      return;
    }
    if (t.dataset.day) {
      if (S.date !== t.dataset.day) { S.date = t.dataset.day; S.time = null; S.error = ''; loadSlots(S.date); }
      return;
    }
    if (t.dataset.time) { S.time = t.dataset.time; S.error = ''; renderPanel(false); return; }
    var a = t.dataset.action;
    if (a === 'next') {
      if (!stepOk(S.step)) return;
      if (S.step === 4) submit(); else goStep(S.step + 1);
    } else if (a === 'back') {
      goStep(S.step - 1);
    } else if (a === 'prev-month') {
      loadMonth(ymShift(S.month, -1));
    } else if (a === 'next-month') {
      loadMonth(ymShift(S.month, 1));
    }
  });

  panel.addEventListener('input', function (e) {
    var n = e.target.name;
    if (!n || !(n in S.form)) return;
    S.form[n] = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    updateNext();
  });
  panel.addEventListener('change', function (e) {
    var n = e.target.name;
    if (!n || !(n in S.form)) return;
    S.form[n] = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    updateNext();
  });

  // ---------- Başlangıç ----------
  getJSON('/api/config').then(function (c) {
    S.config = c;
    renderPanel(false);
  }).catch(function () {
    panel.innerHTML = '<p class="rv-error" role="alert">Randevu sistemine şu an ulaşılamıyor. Lütfen biraz sonra tekrar deneyin veya WhatsApp\'tan yazın: <a href="https://wa.me/905518675205">+90 551 867 52 05</a></p>';
  });
  renderSteps();
  renderSummary();
})();
