// Ana sayfadaki "En yakın uygun saatler" kutusunu canlı verilerle doldurur.
(function () {
  var box = document.getElementById('next-slots');
  if (!box) return;

  function dayLabel(iso) {
    var d = new Date(iso + 'T12:00:00Z');
    var wd = new Intl.DateTimeFormat('tr-TR', { weekday: 'short', timeZone: 'UTC' }).format(d);
    var dm = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(d);
    return wd + ', ' + dm;
  }
  function el(tag, attrs, text) {
    var e = document.createElement(tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (text) e.textContent = text;
    return e;
  }
  function fallback() {
    box.textContent = '';
    box.appendChild(el('p', { style: 'margin: 0; padding: 14px 16px; border-radius: 12px; background: #F7F4EF; color: #5E5B55; font-size: 15px;' }, 'Uygun saatleri görmek için takvimi açın.'));
  }

  fetch('/api/next?limit=3')
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function (data) {
      if (!data.slots || !data.slots.length) return fallback();
      box.textContent = '';
      data.slots.forEach(function (s, i) {
        var a = el('a', {
          href: '/randevu/?tarih=' + encodeURIComponent(s.date) + '&saat=' + encodeURIComponent(s.time),
          style: 'display: flex; justify-content: space-between; align-items: center; gap: 12px; min-height: 50px; padding: 0 16px; border-radius: 12px; color: #2C2C2A; text-decoration: none; ' +
            (i === 0 ? 'border: 1.5px solid #C24A22; background: #FBEDE6;' : 'border: 1px solid #E6E0D6;')
        });
        a.appendChild(el('span', { style: 'font-weight: 700;' }, dayLabel(s.date)));
        a.appendChild(el('span', { style: 'font-size: 14px;' }, s.time + ' TR · ' + s.de + ' DE'));
        box.appendChild(a);
      });
    })
    .catch(fallback);
})();
