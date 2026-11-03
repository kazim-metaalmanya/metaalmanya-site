"""Basit sayfaları (iptal, 404, yasal sayfalar) ortak başlık ve altbilgiyle üretir.
Çalıştırma: python3 scripts/simple-pages.py
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent / "public"

HEADER = """<header style="background: #FFFFFF; border-bottom: 1px solid #E6E0D6;">
<div style="max-width: 1120px; margin: 0 auto; padding: 14px 24px; display: flex; flex-wrap: wrap; gap: 12px 24px; align-items: center; justify-content: space-between;">
<a href="/" aria-label="MetaAlmanya ana sayfa" style="display: inline-flex; align-items: center; gap: 10px; text-decoration: none; color: #2C2C2A;">
<span aria-hidden="true" style="display: inline-flex; flex-direction: column; width: 26px; height: 26px; border-radius: 7px; overflow: hidden;"><span style="flex: 1; background: #2C2C2A;"></span><span style="flex: 1; background: #D85A30;"></span><span style="flex: 1; background: #BA7517;"></span></span>
<span style="font-family: 'Bricolage Grotesque', sans-serif; font-weight: 800; font-size: 21px; letter-spacing: -0.02em;">Meta<span style="color: #C24A22;">Almanya</span></span>
</a>
<a href="/randevu/" style="display: inline-flex; align-items: center; min-height: 44px; padding: 0 20px; border-radius: 999px; background: #C24A22; color: #FFFFFF; font-weight: 700; text-decoration: none; font-size: 15px;">Randevu Al</a>
</div>
</header>"""

FOOTER = """<footer style="background: #2C2C2A; color: #B9B3A8; padding: 32px 0; font-size: 14px;">
<div style="max-width: 1120px; margin: 0 auto; padding: 0 24px; display: flex; flex-wrap: wrap; gap: 10px 24px; justify-content: space-between;">
<span>© 2026 MetaAlmanya · <a href="tel:+905518675205" style="color: #B9B3A8;">+90 551 867 52 05</a> · <a href="mailto:kazim@metaalmanya.com" style="color: #B9B3A8;">kazim@metaalmanya.com</a></span>
<span style="display: flex; flex-wrap: wrap; gap: 6px 20px;"><a href="/impressum/" lang="de" style="color: #B9B3A8;">Impressum</a><a href="/datenschutz/" lang="de" style="color: #B9B3A8;">Datenschutz</a><a href="/kvkk/" style="color: #B9B3A8;">KVKK Aydınlatma Metni</a><a href="/cerez-politikasi/" style="color: #B9B3A8;">Çerez Politikası</a></span>
</div>
</footer>"""


def page(path, title, body, lang="tr", noindex=False, script=None):
    robots = '<meta name="robots" content="noindex">\n' if noindex else ""
    js = f'<script src="{script}" defer></script>\n' if script else ""
    html = f"""<!doctype html>
<html lang="{lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title} | MetaAlmanya</title>
{robots}<meta name="theme-color" content="#2C2C2A">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/assets/site.css">
</head>
<body>
{HEADER}
<main id="icerik" style="max-width: 820px; margin: 0 auto; padding: 56px 24px 80px; min-height: 60vh;">
{body}
</main>
{FOOTER}
{js}</body>
</html>
"""
    out = ROOT / path
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(html, encoding="utf-8")
    print("yazıldı:", out.relative_to(ROOT.parent))


H1 = 'style="margin: 0 0 12px; font-size: clamp(32px, 4vw, 44px); letter-spacing: -0.02em; line-height: 1.1;"'
P = 'style="color: #5E5B55;"'

# Randevu iptal sayfası
page("randevu/iptal/index.html", "Randevu İptali", f"""<h1 {H1}>Randevu iptali</h1>
<div id="cancel-box" aria-live="polite"><div class="skeleton" style="height: 160px;"></div></div>""", noindex=True, script="/assets/iptal.js")

# 404
page("404.html", "Sayfa bulunamadı", f"""<h1 {H1}>Aradığınız sayfa bulunamadı</h1>
<p {P}>Sayfa taşınmış veya kaldırılmış olabilir. Ana sayfadan devam edebilir ya da doğrudan randevu alabilirsiniz.</p>
<p style="display: flex; flex-wrap: wrap; gap: 12px; margin-top: 24px;"><a class="rv-btn" style="display: inline-flex; align-items: center; text-decoration: none; color: #fff;" href="/">Ana sayfa</a><a class="rv-btn secondary" style="display: inline-flex; align-items: center; text-decoration: none;" href="/randevu/">Randevu al</a></p>""", noindex=True)

# Yasal sayfalar — YAYINDAN ÖNCE HUKUKÇU TARAFINDAN DOLDURULACAK
PENDING_TR = f"""<p class="rv-error" style="margin: 0 0 24px;">Bu sayfa hazırlanıyor.</p>
<p {P}>Sorularınız için: <a href="mailto:kazim@metaalmanya.com">kazim@metaalmanya.com</a> · <a href="tel:+905518675205">+90 551 867 52 05</a></p>"""
PENDING_DE = f"""<p class="rv-error" style="margin: 0 0 24px;">Diese Seite wird gerade erstellt.</p>
<p {P}>Kontakt: <a href="mailto:kazim@metaalmanya.com">kazim@metaalmanya.com</a> · MetaAlmanya, Kortumstr. 56, 44787 Bochum</p>"""

page("impressum/index.html", "Impressum", f"<h1 {H1}>Impressum</h1>\n{PENDING_DE}", lang="de", noindex=True)
page("datenschutz/index.html", "Datenschutzerklärung", f"<h1 {H1}>Datenschutzerklärung</h1>\n{PENDING_DE}", lang="de", noindex=True)
page("kvkk/index.html", "KVKK Aydınlatma Metni", f"<h1 {H1}>KVKK Aydınlatma Metni</h1>\n{PENDING_TR}", noindex=True)
page("cerez-politikasi/index.html", "Çerez Politikası", f"""<h1 {H1}>Çerez Politikası</h1>
<p {P}>Bu sitede reklam veya takip çerezi kullanılmaz. Randevu formunda spam koruması için Cloudflare Turnstile kullanılır.</p>
{PENDING_TR}""", noindex=True)
