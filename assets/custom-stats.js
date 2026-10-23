// Glowing glass stats + live progress bars (CPU/Memory/Disk) on server console
(function () {
  function onServer() { return /^\/server\/[a-zA-Z0-9]+/.test(window.location.pathname); }
  function uuid() {
    var m = window.location.pathname.match(/^\/server\/([a-zA-Z0-9]+)/);
    return m ? m[1] : null;
  }
  var TITLES = ['Address', 'Uptime', 'CPU Load', 'Memory', 'Disk', 'Network (Inbound)', 'Network (Outbound)'];
  function tagBoxes() {
    if (!onServer()) return;
    // stat blocks: div dalam grid yang punya <p> berisi judul known
    document.querySelectorAll('#app [class*="grid-cols"] > div').forEach(function (el) {
      var p = el.querySelector('p');
      if (!p) return;
      var title = p.textContent.trim();
      if (TITLES.indexOf(title) === -1) return;
      if (!el.classList.contains('dyn-glass')) {
        el.classList.add('dyn-glass');
        var bar = document.createElement('div');
        bar.className = 'dynbar';
        bar.innerHTML = '<i style="width:0%"></i>';
        bar.dataset.for = title;
        el.appendChild(bar);
      }
    });
    // graph blocks (contain canvas, not inside a stat block) -> glass
    document.querySelectorAll('#app canvas').forEach(function (c) {
      var b = c.parentElement, hops = 0;
      while (b && hops < 5 && !(b.offsetWidth > 260 && b.offsetHeight > 130)) { b = b.parentElement; hops++; }
      if (b && hops < 5) b.classList.add('dyn-glass');
    });
  }
  function fmt(b) {
    if (b == null || isNaN(b)) return '';
    var u = ['B', 'KB', 'MB', 'GB', 'TB'], i = Math.max(0, Math.floor(Math.log(Math.max(b, 1)) / Math.log(1024)));
    return (b / Math.pow(1024, i)).toFixed(i > 1 ? 2 : 0) + ' ' + u[i];
  }
  function setBar(root, key, cur, max, label) {
    if (!root) return;
    var bar = root.querySelector('.dynbar[data-for="' + key + '"]');
    if (!bar) return;
    var pct = 0;
    if (max && max > 0) pct = Math.max(0, Math.min(100, (cur / max) * 100));
    var lvl = pct > 90 ? ' high' : pct > 75 ? ' mid' : '';
    bar.className = 'dynbar' + lvl;
    bar.firstChild.style.width = pct.toFixed(1) + '%';
    var b2 = bar.querySelector('b');
    if (!b2) { b2 = document.createElement('b'); bar.appendChild(b2); }
    b2.textContent = label != null ? label : pct.toFixed(0) + '%';
  }
  var lastServer = '';
  function tick() {
    tagBoxes();
    if (!onServer()) return;
    var id = uuid();
    if (!id) return;
    fetch('/api/client/servers/' + id + '/resources', { credentials: 'same-origin', headers: { Accept: 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        if (!j || !onServer()) return;
        var res = j.attributes.resources || {}, lim = j.attributes.server && j.attributes.server.limits;
        // limits may not be in resources payload; fetch server once per uuid
        fetchLimits(id);
        var L = limitsCache[id] || {};
        setBar(document.getElementById('app'), 'CPU Load', Number(res.cpu_absolute) || 0, 100, (Number(res.cpu_absolute) || 0).toFixed(1) + '%');
        setBar(document.getElementById('app'), 'Memory', res.memory_bytes || 0, L.memory ? L.memory * 1048576 : 0,
          L.memory ? fmt(res.memory_bytes || 0) + ' / ' + fmt(L.memory * 1048576) : fmt(res.memory_bytes || 0));
        setBar(document.getElementById('app'), 'Disk', res.disk_bytes || 0, L.disk ? L.disk * 1048576 : 0,
          L.disk ? fmt(res.disk_bytes || 0) + ' / ' + fmt(L.disk * 1048576) : fmt(res.disk_bytes || 0));
      })
      .catch(function () {});
  }
  var limitsCache = {};
  function fetchLimits(id) {
    if (limitsCache[id] || lastServer === id + '_ok') return;
    fetch('/api/client/servers/' + id, { credentials: 'same-origin', headers: { Accept: 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        if (j && j.attributes && j.attributes.limits) limitsCache[id] = j.attributes.limits;
      })
      .catch(function () {});
  }
  function init() {
    setInterval(tick, 3000);
    tick();
    // re-tag on SPA re-render
    setInterval(function () {
      if (!onServer()) return;
      var any = document.querySelector('#app [class*="grid-cols"] > div p');
      if (any && !document.querySelector('.dynbar')) tagBoxes();
    }, 1500);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
