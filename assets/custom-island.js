// Dynamic Island: live clock + weather (Asia/Jakarta - Bekasi Selatan)
(function () {
  var TZ = 'Asia/Jakarta';
  var WX_URL = 'https://api.open-meteo.com/v1/forecast?latitude=-6.27&longitude=106.99&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m&timezone=Asia%2FJakarta';
  function wmo(code) {
    if (code === 0) return ['☀️', 'Cerah'];
    if (code === 1) return ['🌤️', 'Cerah berawan'];
    if (code === 2) return ['⛅', 'Berawan'];
    if (code === 3) return ['☁️', 'Mendung'];
    if (code === 45 || code === 48) return ['🌫️', 'Berkabut'];
    if (code >= 51 && code <= 57) return ['🌦️', 'Gerimis'];
    if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return ['🌧️', 'Hujan'];
    if ((code >= 71 && code <= 77) || code === 85 || code === 86) return ['❄️', 'Salju'];
    if (code >= 95) return ['⛈️', 'Badai petir'];
    return ['🌡️', '–'];
  }
  function build() {
    if (document.getElementById('dyn-island')) return;
    var el = document.createElement('div');
    el.id = 'dyn-island';
    el.innerHTML =
      '<div class="dyn-collapsed"><span>🕐</span>' +
      '<span class="dyn-time" id="dynTime">--:--:--</span>' +
      '<span class="dyn-state" id="dynWxMini">…</span></div>' +
      '<div class="dyn-detail"><div class="dyn-grid">' +
      '<div><div class="k">Hari</div><div class="v" id="dynDay">–</div></div>' +
      '<div><div class="k">Tanggal</div><div class="v" id="dynDate">–</div></div>' +
      '<div><div class="k">Cuaca</div><div class="v" id="dynWx">–</div></div>' +
      '<div><div class="k">Suhu</div><div class="v" id="dynTemp">–</div></div>' +
      '<div><div class="k">Terasa</div><div class="v" id="dynFeel">–</div></div>' +
      '<div><div class="k">Angin / Lembap</div><div class="v" id="dynWind">–</div></div>' +
      '</div><div class="dyn-hint">usap ↑ sembunyikan • tap perbesar</div></div>';
    document.body.appendChild(el);
    // mini handle to call the island back
    var handle = document.createElement('div');
    handle.id = 'dyn-handle';
    handle.textContent = '⌄';
    document.body.appendChild(handle);
    var hidden = false;
    try { hidden = localStorage.getItem('dynIslandHidden') === '1'; } catch (e) {}
    function store() { try { localStorage.setItem('dynIslandHidden', hidden ? '1' : '0'); } catch (e) {} }
    function applyT() {
      var t = 'translateX(calc(-50% + ' + dx + 'px))';
      el.style.transform = t + (hidden ? ' translateY(-180%)' : '');
      handle.style.transform = t; // handle ngikut posisi island
    }
    function show() {
      hidden = false; store();
      el.classList.remove('expanded');
      handle.classList.remove('show');
      applyT();
    }
    function hide() {
      hidden = true; store();
      el.classList.remove('expanded');
      handle.classList.add('show');
      applyT();
    }
    handle.addEventListener('click', show);
    // tap toggles expand (skipped after a drag/swipe)
    var dragged = false;
    el.addEventListener('click', function () {
      if (dragged) { dragged = false; return; }
      el.classList.toggle('expanded');
    });
    // horizontal drag with clamp + remember position; swipe up hides
    var dx = 0;
    try { dx = parseFloat(localStorage.getItem('dynIslandX') || '0') || 0; } catch (e) {}
    function clampX(v) {
      var max = Math.max(0, window.innerWidth / 2 - el.offsetWidth / 2 - 10);
      return Math.max(-max, Math.min(max, v));
    }
    dx = clampX(dx);
    if (hidden) handle.classList.add('show');
    applyT();
    window.addEventListener('resize', function () { dx = clampX(dx); applyT(); });
    var startX = 0, startY = 0, baseDx = 0, active = false, pid = null, swipedUp = false;
    el.addEventListener('pointerdown', function (e) {
      active = true; pid = e.pointerId; startX = e.clientX; startY = e.clientY; baseDx = dx;
      swipedUp = false;
      el.classList.add('dragging');
      try { el.setPointerCapture(pid); } catch (err) {}
    });
    el.addEventListener('pointermove', function (e) {
      if (!active || e.pointerId !== pid) return;
      var movedX = e.clientX - startX, movedY = e.clientY - startY;
      if (Math.abs(movedX) > 8 || Math.abs(movedY) > 8) dragged = true;
      if (movedY < -50 && Math.abs(movedY) > Math.abs(movedX) * 1.5) swipedUp = true;
      dx = clampX(baseDx + movedX);
      applyT();
    });
    function endDrag(e) {
      if (!active || (e && e.pointerId !== pid)) return;
      active = false; pid = null;
      el.classList.remove('dragging');
      try { localStorage.setItem('dynIslandX', String(Math.round(dx))); } catch (err) {}
      if (swipedUp && !hidden) hide();
      else applyT();
      setTimeout(function () { dragged = false; }, 50);
    }
    el.addEventListener('pointerup', endDrag);
    el.addEventListener('pointercancel', endDrag);
    // swipe up on the island hides it (touch; pointer events may be preempted by scroll)
    var hStartY = null, hStartX = null;
    el.addEventListener('touchstart', function (e) {
      var t = e.touches[0];
      if (t) { hStartY = t.clientY; hStartX = t.clientX; }
    }, { passive: true });
    el.addEventListener('touchmove', function (e) {
      if (hStartY === null || hidden) return;
      var t = e.touches[0];
      if (t && hStartY - t.clientY > 60 && Math.abs(t.clientX - hStartX) < 60) {
        hStartY = null;
        dragged = true;
        hide();
      }
    }, { passive: true });
    el.addEventListener('touchend', function () { hStartY = null; }, { passive: true });
    el.addEventListener('dblclick', function () { if (!hidden) hide(); });
    // swipe down from top edge anywhere reveals the island
    var gStartY = null, gStartX = null;
    document.addEventListener('touchstart', function (e) {
      if (!hidden) return;
      var t = e.touches[0];
      if (t && t.clientY < 80) { gStartY = t.clientY; gStartX = t.clientX; }
      else { gStartY = null; gStartX = null; }
    }, { passive: true });
    document.addEventListener('touchmove', function (e) {
      if (!hidden || gStartY === null) return;
      var t = e.touches[0];
      if (t && t.clientY - gStartY > 50 && Math.abs(t.clientX - gStartX) < 60) {
        gStartY = null;
        show();
      }
    }, { passive: true });
    tick();
    fetchWx();
  }
  function tick() {
    if (!document.getElementById('dyn-island')) return;
    try {
      var now = new Date();
      document.getElementById('dynTime').textContent =
        new Intl.DateTimeFormat('id-ID', { timeZone: TZ, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(now);
      document.getElementById('dynDay').textContent =
        new Intl.DateTimeFormat('id-ID', { timeZone: TZ, weekday: 'long' }).format(now);
      document.getElementById('dynDate').textContent =
        new Intl.DateTimeFormat('id-ID', { timeZone: TZ, day: 'numeric', month: 'long', year: 'numeric' }).format(now);
    } catch (e) {}
  }
  function fetchWx() {
    if (!document.getElementById('dyn-island')) return;
    fetch(WX_URL)
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        if (!j || !j.current || !document.getElementById('dyn-island')) return;
        var c = j.current, w = wmo(c.weather_code);
        var temp = Math.round(c.temperature_2m) + '°C';
        document.getElementById('dynWxMini').textContent = w[0] + ' ' + temp;
        document.getElementById('dynWx').textContent = w[0] + ' ' + w[1];
        document.getElementById('dynTemp').textContent = temp;
        document.getElementById('dynFeel').textContent = Math.round(c.apparent_temperature) + '°C';
        document.getElementById('dynWind').textContent = Math.round(c.wind_speed_10m) + ' km/h • ' + c.relative_humidity_2m + '%';
      })
      .catch(function () {});
  }
  var wxTimer = 0;
  function init() {
    build();
    setInterval(function () {
      if (!document.getElementById('dyn-island')) build();
      else tick();
    }, 1000);
    wxTimer = setInterval(fetchWx, 600000); // refresh cuaca tiap 10 menit
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
