# MetaAlmanya web sitesi ve randevu sistemi

Ana sayfa, 5 adımlı randevu ekranı, randevu iptal sayfası, ekip paneli ve otomatik e-postalar.
Tamamı **Cloudflare'in ücretsiz planında** çalışır. Kart bilgisi gerekmez.

| Parça | Nerede | Ücret |
|---|---|---|
| Site ve randevu API'si | Cloudflare Workers (ücretsiz plan, günde 100.000 istek) | 0 |
| Randevu kayıtları | Cloudflare D1, **sadece AB'de** (EU jurisdiction) | 0 |
| Spam koruması | Cloudflare Turnstile | 0 |
| Onay, hatırlatma, ekip e-postaları | Mevcut Google Workspace (Gmail API) | 0 (mevcut abonelik) |
| Fontlar | Kendi sunucumuzdan (Google Fonts kullanılmaz — DSGVO) | 0 |

## Klasörler

- `public/` — sayfalar (ana sayfa, `/randevu/`, `/randevu/iptal/`, yasal sayfalar, 404)
- `public/assets/` — stil ve JavaScript dosyaları
- `src/worker.js` — randevu API'si, e-postalar, hatırlatma, ekip paneli
- `wrangler.jsonc` — Cloudflare ayarları
- `migrations/` — veritabanı tablosu (Worker ilk çalıştığında kendisi de oluşturur)

## Çalışma saatlerini değiştirmek

`src/worker.js` dosyasının en üstündeki **AYARLAR** bölümü:

- `WEEKDAY_SLOTS` — Pazartesi–Cuma randevu saatleri (Türkiye saati)
- `SATURDAY_SLOTS` — Cumartesi saatleri
- `CLOSED_DATES` — kapalı günler, ör. `['2026-12-31', '2027-01-01']`
- `MIN_LEAD_HOURS` — en az kaç saat önceden randevu alınabilir
- `DAYS_AHEAD` — en fazla kaç gün sonrasına randevu verilir

Almanya saati otomatik hesaplanır (yaz/kış saati dahil).

## Gizli ayarlar (Cloudflare → Worker → Settings → Variables and Secrets → "Secret")

| Ad | Ne işe yarar |
|---|---|
| `PANEL_PASSWORD` | `/panel` ekip paneli şifresi (Türkçe karakter kullanmayın) |
| `TURNSTILE_SECRET` | Spam koruması gizli anahtarı (site anahtarı `wrangler.jsonc` içinde `TURNSTILE_SITE_KEY`) |
| `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN` | Google Workspace hesabından e-posta gönderimi |

E-posta ayarları girilmeden de randevu sistemi çalışır; sadece e-posta gitmez (yeni randevular panelde görünür).

## Ekip paneli

`https://<site>/panel` — kullanıcı adı herhangi bir şey olabilir, şifre `PANEL_PASSWORD`.
Randevuları tarih sırasıyla gösterir; durum (Onaylandı / İptal / Gelmedi / Tamamlandı) değiştirilebilir.

## Yayına almadan önce (alan adı taşınmadan önce) yapılacaklar

1. **Yasal sayfalar**: Impressum, Datenschutzerklärung, KVKK Aydınlatma Metni — hukukçu tarafından doldurulacak. Şu an "hazırlanıyor" yazıyor.
2. **KVKK yurt dışı aktarım**: Randevu verileri AB'de tutulur; hukukçu onayı alınacak.
3. **WhatsApp numarası**: Sitede +90 551 867 52 05 kullanıldı (eski sitedeki WhatsApp butonu +90 850 309 36 63'e gidiyordu). Doğrusu teyit edilecek.
4. **Çalışma saatleri**: `src/worker.js` içindeki saatler örnek; gerçek saatler girilecek.
5. **Blog yazıları**: Ana sayfadaki 3 rehber yazısı eski sitedeki adreslere bağlı; yeni siteye taşınacak.
6. **Alan adı (DNS)**: Cloudflare'e taşınırken **Google Workspace kayıtları (MX, SPF, DKIM, DMARC, doğrulama TXT) aynen korunacak**; aksi halde e-posta durur.
7. **Spam koruması**: Cloudflare Turnstile'da site oluşturulup anahtarlar girilecek.
8. **E-posta**: Google Cloud'da Gmail API açılıp OAuth bilgileri secret olarak girilecek.

## Bilgisayarda deneme (geliştirici için)

```bash
npm install
echo "PANEL_PASSWORD=deneme123" > .dev.vars
npx wrangler dev
```

Sonra http://localhost:8787 adresini açın.
