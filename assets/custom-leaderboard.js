// Leaderboard resource server live (pterodactyl-theme)
// Ikon trophy di navbar -> modal top 10/20, tab CPU/RAM/Disk.
(function () {
  var TROPHY = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 3h12v2h3v3a5 5 0 0 1-5 5h-.4A5 5 0 0 1 13 15.9V19h3v2H8v-2h3v-3.1A5 5 0 0 1 8.4 13H8a5 5 0 0 1-5-5V5h3V3zm0 4H5v1a3 3 0 0 0 1 2.2V7zm12 0v3.2A3 3 0 0 0 19 8V7h-1z"/></svg>';

  var METRICS = [
    { id: 'cpu', label: 'CPU' },
    { id: 'ram', label: 'RAM' },
    { id: 'disk', label: 'Disk' }
  ];

  var state = { open: false, metric: 'cpu', limit: 20, q: '', data: null, loading: false, seq: 0 };
  var root = null, listEl = null, subEl = null, refreshBtn = null, searchEl = null, tabsEl = null;
  var timer = null;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function fmtBytes(b) {
    b = Number(b) || 0;
    if (b <= 0) return '0 B';
    var u = ['B', 'KB', 'MB', 'GB', 'TB'];
    var i = Math.min(u.length - 1, Math.floor(Math.log(b) / Math.log(1024)));
    return (b / Math.pow(1024, i)).toFixed(i >= 3 ? 2 : 1) + ' ' + u[i];
  }

  function fmtUptime(sec) {
    sec = Number(sec) || 0;
    if (sec <= 0) return '-';
    var d = Math.floor(sec / 86400);
    var h = Math.floor((sec % 86400) / 3600);
    var m = Math.floor((sec % 3600) / 60);
    if (d > 0) return d + 'd ' + h + 'h ' + m + 'm';
    if (h > 0) return h + 'h ' + m + 'm';
    return m + 'm';
  }

  function fmtTime(ts) {
    if (!ts) return '-';
    try {
      return new Date(ts * 1000).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch (e) {
      return '-';
    }
  }

  function rawValue(s) {
    if (state.metric === 'ram') return Number(s.memory) || 0;
    if (state.metric === 'disk') return Number(s.disk) || 0;
    return Number(s.cpu) || 0;
  }

  function barPct(s, max) {
    if (state.metric === 'cpu') return Math.max(0, Math.min(100, Number(s.cpu) || 0));
    var pct = state.metric === 'ram' ? s.memory_pct : s.disk_pct;
    if (pct != null && !isNaN(pct)) return Math.max(0, Math.min(100, Number(pct)));
    return max > 0 ? Math.max(0, Math.min(100, (rawValue(s) / max) * 100)) : 0;
  }

  function valueHtml(s) {
    if (state.metric === 'cpu') {
      return (Number(s.cpu) || 0).toFixed(1) + '%';
    }
    var pct = state.metric === 'ram' ? s.memory_pct : s.disk_pct;
    var bytes = state.metric === 'ram' ? s.memory : s.disk;
    return fmtBytes(bytes) + (pct != null ? '<small>' + pct + '% limit</small>' : '<small>unlimited</small>');
  }

  function rowHtml(s, i, max) {
    var medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : (i + 1);
    var meta = esc(s.node || 'node') + ' • uptime ' + esc(fmtUptime(s.uptime));
    return '<div class="lb-row' + (s.owned ? ' owned' : '') + '" data-id="' + esc(s.id) + '"' +
      (s.owned ? ' role="button" tabindex="0" title="Buka server ini"' : '') + '>' +
      '<div class="lb-rank">' + medal + '</div>' +
      '<div><div class="lb-name">' + esc(s.name) + '</div><div class="lb-meta">' + meta + '</div></div>' +
      '<div class="lb-val">' + valueHtml(s) + '</div>' +
      '<div class="lb-bar"><i style="width:' + barPct(s, max).toFixed(1) + '%"></i></div>' +
      '</div>';
  }

  function render() {
    if (!listEl) return;
    if (!state.data) {
      listEl.innerHTML = '<div class="lb-empty">Memuat data leaderboard…</div>';
      return;
    }

    var servers = Array.isArray(state.data.servers) ? state.data.servers.slice() : [];
    var q = state.q.trim().toLowerCase();
    if (q) {
      servers = servers.filter(function (s) {
        return String(s.name || '').toLowerCase().indexOf(q) !== -1 ||
          String(s.node || '').toLowerCase().indexOf(q) !== -1;
      });
    }

    var max = 1;
    servers.forEach(function (s) { max = Math.max(max, rawValue(s)); });

    listEl.innerHTML = servers.length
      ? servers.map(function (s, i) { return rowHtml(s, i, max); }).join('')
      : '<div class="lb-empty">Nggak ada server online yang cocok.</div>';

    Array.prototype.forEach.call(listEl.querySelectorAll('.lb-row.owned'), function (row) {
      function go() { window.location.href = '/server/' + encodeURIComponent(row.dataset.id); }
      row.addEventListener('click', go);
      row.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); }
      });
    });

    if (subEl) {
      var online = Number(state.data.total_online) || 0;
      var age = state.data.generated_at ? (Date.now() / 1000 - state.data.generated_at) : 9999;
      var warn = age > 180 ? ' <span class="lb-warn">• data lama, collector belum jalan</span>' : '';
      subEl.innerHTML = 'Top <b>' + state.limit + '</b> server • <b>' + online + '</b> online • update <b>' +
        esc(fmtTime(state.data.generated_at)) + '</b>' + warn;
    }
  }

  function setLoading(on) {
    state.loading = on;
    if (refreshBtn) refreshBtn.classList.toggle('spin', on);
  }

  function load() {
    var seq = ++state.seq;
    setLoading(true);
    if (!state.data) render();

    fetch('/leaderboard/servers?metric=' + encodeURIComponent(state.metric) + '&limit=' + state.limit, {
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
      cache: 'no-store'
    }).then(function (r) {
      if (r.status === 401) throw new Error('Sesi habis, refresh halaman');
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function (j) {
      if (seq !== state.seq) return;
      state.data = j;
      render();
    }).catch(function (e) {
      if (seq !== state.seq) return;
      listEl.innerHTML = '<div class="lb-empty lb-err">Gagal memuat: ' + esc(e.message || 'error') + '</div>';
    }).then(function () {
      if (seq === state.seq) setLoading(false);
    });
  }

  function schedule() {
    clearInterval(timer);
    timer = setInterval(function () {
      if (state.open && !document.hidden) load();
    }, 10000);
  }

  function setMetric(id) {
    if (state.metric === id) return;
    state.metric = id;
    Array.prototype.forEach.call(tabsEl.querySelectorAll('.lb-tab'), function (b) {
      b.classList.toggle('on', b.dataset.metric === id);
    });
    state.data = null;
    render();
    load();
  }

  function setLimit(n) {
    if (state.limit === n) return;
    state.limit = n;
    Array.prototype.forEach.call(root.querySelectorAll('.lb-seg button'), function (b) {
      b.classList.toggle('on', Number(b.dataset.limit) === n);
    });
    load();
  }

  function open() {
    build();
    state.open = true;
    root.classList.add('open');
    document.body.style.overflow = 'hidden';
    load();
    schedule();
  }

  function close() {
    state.open = false;
    if (root) root.classList.remove('open');
    document.body.style.overflow = '';
    clearInterval(timer);
  }

  function build() {
    if (root) return;

    root = document.createElement('div');
    root.id = 'lb-overlay';
    root.innerHTML =
      '<div class="lb-modal" role="dialog" aria-modal="true" aria-label="Leaderboard server">' +
        '<div class="lb-head">' +
          '<div><h3>' + TROPHY + ' Leaderboard Server</h3><p class="lb-sub" id="lb-sub">Memuat…</p></div>' +
          '<button class="lb-close" type="button" aria-label="Tutup">✕</button>' +
        '</div>' +
        '<div class="lb-tabs" id="lb-tabs">' +
          METRICS.map(function (m) {
            return '<button type="button" class="lb-tab' + (m.id === state.metric ? ' on' : '') + '" data-metric="' + m.id + '">' + m.label + '</button>';
          }).join('') +
        '</div>' +
        '<div class="lb-tools">' +
          '<input class="lb-search" id="lb-search" type="search" placeholder="Cari server / node…" autocomplete="off">' +
          '<div class="lb-seg">' +
            '<button type="button" data-limit="10">Top 10</button>' +
            '<button type="button" class="on" data-limit="20">Top 20</button>' +
          '</div>' +
          '<button class="lb-refresh" id="lb-refresh" type="button" title="Refresh sekarang" aria-label="Refresh">⟳</button>' +
        '</div>' +
        '<div class="lb-list" id="lb-list"><div class="lb-empty">Memuat data leaderboard…</div></div>' +
      '</div>';

    document.body.appendChild(root);

    listEl = root.querySelector('#lb-list');
    subEl = root.querySelector('#lb-sub');
    refreshBtn = root.querySelector('#lb-refresh');
    searchEl = root.querySelector('#lb-search');
    tabsEl = root.querySelector('#lb-tabs');

    root.querySelector('.lb-close').addEventListener('click', close);
    root.addEventListener('click', function (e) { if (e.target === root) close(); });
    tabsEl.addEventListener('click', function (e) {
      var b = e.target.closest('.lb-tab');
      if (b) setMetric(b.dataset.metric);
    });
    root.querySelector('.lb-seg').addEventListener('click', function (e) {
      var b = e.target.closest('button[data-limit]');
      if (b) setLimit(Number(b.dataset.limit));
    });
    refreshBtn.addEventListener('click', load);
    searchEl.addEventListener('input', function () {
      state.q = searchEl.value || '';
      render();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && state.open) close();
    });
    document.addEventListener('visibilitychange', function () {
      if (state.open && !document.hidden) load();
    });
  }

  function injectBtn() {
    var logo = document.getElementById('logo');
    var nav = logo && logo.nextElementSibling;
    if (!nav || !nav.appendChild) return;
    if (document.getElementById('lb-btn')) return;

    var b = document.createElement('button');
    b.type = 'button';
    b.id = 'lb-btn';
    b.title = 'Leaderboard server';
    b.setAttribute('aria-label', 'Leaderboard server');
    b.innerHTML = TROPHY;
    b.addEventListener('click', open);

    // taruh sebelum tombol sign out (child terakhir) biar rapi
    var last = nav.lastElementChild;
    if (last && last !== nav.firstElementChild) nav.insertBefore(b, last);
    else nav.appendChild(b);
  }

  function init() {
    injectBtn();
    try {
      new MutationObserver(function () { injectBtn(); }).observe(document.body, { childList: true, subtree: true });
    } catch (e) {}
    setInterval(injectBtn, 1500);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
