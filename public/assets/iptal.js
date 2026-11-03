// Randevu iptal sayfası: e-postadaki bağlantıyla açılır (?id=...&t=...).
(function () {
  var box = document.getElementById('cancel-box');
  var p = new URLSearchParams(location.search);
  var id = p.get('id') || '';
  var t = p.get('t') || '';

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function msg(text, isError) {
    box.innerHTML = '<p class="' + (isError ? 'rv-error' : 'rv-note') + '" role="status">' + text + '</p>' +
      '<p style="margin-top:20px"><a href="/randevu/">Yeni randevu al</a> · <a href="https://wa.me/905518675205">WhatsApp\'tan yaz</a></p>';
  }

  if (!id || !t) return msg('Bağlantı eksik. Lütfen onay e-postanızdaki bağlantıyı kullanın.', true);

  fetch('/api/appointment?id=' + encodeURIComponent(id) + '&t=' + encodeURIComponent(t))
    .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, body: j }; }); })
    .then(function (res) {
      if (!res.ok) return msg(esc(res.body.error || 'Randevu bulunamadı.'), true);
      var a = res.body;
      var details = '<dl class="rv-summary" style="margin-top:0">' +
        [['Randevu no', a.id], ['Konu', a.topic], ['Tarih', a.date], ['Saat', a.time + ' Türkiye · ' + a.de + ' Almanya'], ['Görüşme', a.mode]]
          .map(function (x) { return '<div><dt>' + esc(x[0]) + '</dt><dd>' + esc(x[1]) + '</dd></div>'; }).join('') + '</dl>';
      if (a.status === 'iptal') return (box.innerHTML = details) && box.insertAdjacentHTML('beforeend', '<p class="rv-note" style="margin-top:16px">Bu randevu zaten iptal edilmiş.</p><p style="margin-top:20px"><a href="/randevu/">Yeni randevu al</a></p>');
      if (a.past) return (box.innerHTML = details) && box.insertAdjacentHTML('beforeend', '<p class="rv-note" style="margin-top:16px">Bu randevunun tarihi geçmiş.</p>');
      box.innerHTML = details +
        '<p style="margin:20px 0 0">Bu randevuyu iptal etmek istediğinize emin misiniz? İptal edilen saat başka adaylara açılır.</p>' +
        '<div style="display:flex;flex-wrap:wrap;gap:12px;margin-top:20px">' +
        '<button type="button" class="rv-btn" id="do-cancel">Randevuyu iptal et</button>' +
        '<a class="rv-btn secondary" style="display:inline-flex;align-items:center;text-decoration:none" href="/">Vazgeç</a></div>';
      document.getElementById('do-cancel').addEventListener('click', function () {
        this.disabled = true;
        this.textContent = 'İptal ediliyor…';
        fetch('/api/cancel', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: id, t: t }) })
          .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, body: j }; }); })
          .then(function (res) {
            if (res.ok) msg('Randevunuz iptal edildi. Dilerseniz yeni bir randevu alabilirsiniz.');
            else msg(esc(res.body.error || 'İptal edilemedi.'), true);
          })
          .catch(function () { msg('Bağlantı hatası. Lütfen tekrar deneyin.', true); });
      });
    })
    .catch(function () { msg('Randevu bilgisi yüklenemedi. Lütfen tekrar deneyin.', true); });
})();
