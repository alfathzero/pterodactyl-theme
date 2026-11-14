// Widget dashboard (pterodactyl-theme) — status jaringan, server saya,
// kuota resource, node health + banner pengumuman.
(function () {
  'use strict';

  var ENDPOINT = '/widgets/data';
  var ANNOUNCEMENT_ENDPOINT = '/widgets/announcement';
  var POLL_MS = 60000;
  var ANNOUNCEMENT_POLL_MS = 60000;
  var ICON = '/favicons/android-chrome-192x192.png';

  var state = {
    data: null,
    root: null,
    loading: false,
    lastFetch: 0,
    observer: null,
    pending: null,
    lastOnline: null,
    announcement: null,
    swPromise: null,
    swReg: null,
    notifyModal: null,
    notifyModalMode: null,
    notifyToast: null,
    permissionBusy: false,
    seen: {},
    prompted: {},
    toastShown: {},
  };

  /* ---------------- util ---------------- */

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = String(text);
    return node;
  }

  function isDashboard() {
    var path = window.location.pathname.replace(/\/+$/, '');
    return path === '';
  }

  function fmtBytes(bytes) {
    bytes = Number(bytes) || 0;
    if (bytes <= 0) return '0 B';
    var units = ['B', 'KB', 'MB', 'GB', 'TB'];
    var i = Math.floor(Math.log(bytes) / Math.log(1024));
    i = Math.max(0, Math.min(units.length - 1, i));
    var value = bytes / Math.pow(1024, i);
    return (value >= 100 ? value.toFixed(0) : value.toFixed(1)) + ' ' + units[i];
  }

  function pct(used, alloc) {
    if (!alloc || alloc <= 0) return 0;
    return Math.max(0, Math.min(100, Math.round((used / alloc) * 100)));
  }

  function humanUntil(until) {
    if (!until) return '';
    var ts = Date.parse(until);
    if (isNaN(ts)) return '';
    var diff = ts - Date.now();
    if (diff <= 0) return 'Berakhir';
    var hours = Math.floor(diff / 3600000);
    var days = Math.floor(hours / 24);
    if (days >= 1) return 'Sisa ' + days + ' hari';
    if (hours >= 1) return 'Sisa ' + hours + ' jam';
    return 'Sisa < 1 jam';
  }

  /* ---------------- notifikasi pengumuman ---------------- */

  function notifySupported() {
    return typeof window !== 'undefined' && 'Notification' in window;
  }

  function notifyPermission() {
    if (!notifySupported()) return 'unsupported';
    return Notification.permission || 'default';
  }

  function registerNotifySW() {
    if (state.swPromise) return state.swPromise;
    if (!('serviceWorker' in navigator)) {
      state.swPromise = Promise.resolve(null);
      return state.swPromise;
    }
    state.swPromise = navigator.serviceWorker.register('/sw-notify.js')
      .then(function (reg) {
        state.swReg = reg;
        // tunggu worker aktif biar showNotification nggak gagal di percobaan pertama
        if (navigator.serviceWorker.ready) return navigator.serviceWorker.ready;
        return reg;
      })
      .catch(function () { return null; });
    return state.swPromise;
  }

  function sessionGet(key) {
    try { return window.sessionStorage.getItem(key); } catch (e) { return null; }
  }

  function sessionSet(key, value) {
    try { window.sessionStorage.setItem(key, value); } catch (e) { /* ignore */ }
  }

  function localGet(key) {
    try { return window.localStorage.getItem(key); } catch (e) { return null; }
  }

  function localSet(key, value) {
    try { window.localStorage.setItem(key, value); } catch (e) { /* ignore */ }
  }

  function announcementKey(a) {
    return a && a.id ? String(a.id) : 'default';
  }

  function showAnnouncementNotification(a, force) {
    if (!a || (!a.title && !a.text)) return;
    if (notifyPermission() !== 'granted') return;

    var id = announcementKey(a);
    var seenKey = 'dw_notif_seen_' + id;
    if (!force && (state.seen[id] || localGet(seenKey) === '1')) return;

    var prefix = a.type === 'promo' ? '🎉 ' : a.type === 'maintenance' ? '🛠️ ' : '📢 ';
    var title = prefix + (a.title || 'Pengumuman Baru');
    var body = String(a.text || '').replace(/\s+/g, ' ').trim();
    if (body.length > 160) body = body.slice(0, 157) + '...';
    if (!body) body = 'Buka panel buat lihat detail pengumuman.';
    var until = humanUntil(a.until);
    if (until) body += ' · ' + until;

    var options = {
      body: body,
      icon: ICON,
      badge: ICON,
      tag: 'dw-ann-' + id,
      renotify: true,
      data: { type: 'announcement', url: '/' },
    };

    function markSeen() {
      state.seen[id] = true;
      localSet(seenKey, '1');
    }

    function fallback() {
      try {
        var n = new Notification(title, options);
        n.onclick = function () {
          try { window.focus(); } catch (e) { /* ignore */ }
          n.close();
        };
        markSeen();
      } catch (e) { /* browser blokir */ }
    }

    registerNotifySW().then(function (reg) {
      if (reg && reg.showNotification) {
        try {
          var p = reg.showNotification(title, options);
          if (p && typeof p.then === 'function') {
            p.then(markSeen).catch(fallback);
          } else {
            markSeen();
          }
          return;
        } catch (e) { /* fallback */ }
      }
      fallback();
    });
  }

  function requestNotifyPermission(a) {
    if (!notifySupported()) {
      showNotifyModal(a, 'unsupported');
      return;
    }
    if (Notification.permission === 'granted') {
      registerNotifySW().then(function () { showAnnouncementNotification(a, true); });
      closeNotifyModal();
      removeNotifyToast();
      refreshWidgets();
      return;
    }
    if (Notification.permission === 'denied') {
      if (isDashboard()) {
        showNotifyModal(a, 'denied');
      } else {
        removeNotifyToast();
        showNotifyToast(a, 'denied', true);
      }
      return;
    }
    if (state.permissionBusy) return;
    state.permissionBusy = true;

    var settled = false;
    function done(permission) {
      if (settled) return;
      settled = true;
      state.permissionBusy = false;
      if (permission === 'granted') {
        closeNotifyModal();
        removeNotifyToast();
        registerNotifySW().then(function () { showAnnouncementNotification(a, true); });
        refreshWidgets();
      } else if (permission === 'denied') {
        if (isDashboard()) {
          showNotifyModal(a, 'denied');
        } else {
          removeNotifyToast();
          showNotifyToast(a, 'denied', true);
        }
        refreshWidgets();
      } else {
        closeNotifyModal();
        removeNotifyToast();
      }
    }

    try {
      var result = Notification.requestPermission(done);
      if (result && typeof result.then === 'function') result.then(done);
    } catch (e) {
      done('denied');
    }
  }

  function showNotifyModal(a, mode) {
    if (!isDashboard()) return;
    if (state.notifyModal) {
      if (state.notifyModalMode === mode) return;
      closeNotifyModal();
    }

    var promptId = announcementKey(a);
    state.prompted[promptId] = true;
    sessionSet('dw_notif_prompt_' + promptId, '1');

    var overlay = el('div', 'dw-notif-overlay');
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');

    var card = el('div', 'dw-notif-card');
    card.appendChild(el('div', 'dw-notif-bell', mode === 'denied' ? '🔕' : mode === 'unsupported' ? '🚫' : '🔔'));

    var title = mode === 'denied' ? 'Notifikasi diblokir'
      : mode === 'unsupported' ? 'Browser belum dukung notifikasi'
      : 'Jangan ketinggalan info penting';
    card.appendChild(el('div', 'dw-notif-title', title));

    var text = mode === 'denied'
      ? 'Lu pernah nolak izin notifikasi. Biar pengumuman penting tetap masuk, aktifin manual di setelan browser.'
      : mode === 'unsupported'
        ? 'Browser ini belum bisa nampilin notifikasi. Coba pakai Chrome / Edge terbaru, atau tambahin panel ke Home Screen dulu (iPhone).'
        : 'Aktifkan notifikasi browser biar pengumuman baru langsung masuk ke HP lu, walaupun lu lagi buka halaman lain.';
    card.appendChild(el('div', 'dw-notif-text', text));

    if (a && (a.title || a.text)) {
      var preview = el('div', 'dw-notif-preview');
      preview.appendChild(el('b', null, a.title || 'Pengumuman baru'));
      if (a.text) preview.appendChild(el('span', null, String(a.text).slice(0, 140)));
      card.appendChild(preview);
    }

    var actions = el('div', 'dw-notif-actions');
    if (mode === 'default') {
      var enable = el('button', 'dw-notif-btn primary', '🔔 Aktifkan Notifikasi');
      enable.addEventListener('click', function () { requestNotifyPermission(a); });
      actions.appendChild(enable);

      var later = el('button', 'dw-notif-btn ghost', 'Nanti');
      later.addEventListener('click', function () { closeNotifyModal(); });
      actions.appendChild(later);
    } else {
      var ok = el('button', 'dw-notif-btn primary', 'Mengerti');
      ok.addEventListener('click', function () { closeNotifyModal(); });
      actions.appendChild(ok);
    }
    card.appendChild(actions);

    var hint = el('div', 'dw-notif-hint');
    if (mode === 'denied') {
      hint.appendChild(document.createTextNode('Klik ikon '));
      hint.appendChild(el('code', null, '🔒 / ⓘ'));
      hint.appendChild(document.createTextNode(' di address bar → Notifikasi → Izinkan → refresh panel.'));
    } else if (mode === 'default') {
      hint.appendChild(document.createTextNode('Browser bakal nanya izin sekali. Pilih '));
      hint.appendChild(el('code', null, 'Izinkan'));
      hint.appendChild(document.createTextNode('.'));
    } else {
      hint.appendChild(document.createTextNode('Di iPhone: Share → Add to Home Screen, lalu buka dari ikon itu.'));
    }
    card.appendChild(hint);

    overlay.appendChild(card);
    document.body.appendChild(overlay);
    state.notifyModal = overlay;
    state.notifyModalMode = mode;

    var focusTarget = actions.firstChild;
    if (focusTarget && focusTarget.focus) {
      try { focusTarget.focus(); } catch (e) { /* ignore */ }
    }
  }

  function closeNotifyModal() {
    if (state.notifyModal && state.notifyModal.parentNode) {
      state.notifyModal.parentNode.removeChild(state.notifyModal);
    }
    state.notifyModal = null;
    state.notifyModalMode = null;
  }

  function showNotifyToast(a, mode, force) {
    if (isDashboard()) return;
    if (state.notifyToast) {
      if (!force) return;
      removeNotifyToast();
    }
    var id = announcementKey(a);
    var key = 'dw_notif_toast_' + id;
    if (!force && (state.toastShown[id] || sessionGet(key) === '1')) return;
    state.toastShown[id] = true;
    sessionSet(key, '1');

    var toast = el('div', 'dw-notif-toast');
    toast.appendChild(el('span', 'dw-notif-toast-icon', mode === 'denied' ? '🔕' : '🔔'));

    var body = el('div', 'dw-notif-toast-body');
    body.appendChild(el('div', 'dw-notif-toast-title', mode === 'denied' ? 'Notifikasi diblokir' : 'Aktifkan notifikasi'));
    body.appendChild(el('div', 'dw-notif-toast-text', mode === 'denied'
      ? 'Aktifin manual di setelan situs biar nggak ketinggalan pengumuman penting.'
      : 'Biar pengumuman baru langsung masuk ke HP lu.'));

    if (mode !== 'denied') {
      var btn = el('button', 'dw-notif-toast-btn', 'Aktifkan');
      btn.addEventListener('click', function () { requestNotifyPermission(a); });
      body.appendChild(btn);
    }
    toast.appendChild(body);

    var close = el('button', 'dw-notif-toast-close', '×');
    close.setAttribute('aria-label', 'Tutup');
    close.addEventListener('click', function () { removeNotifyToast(); });
    toast.appendChild(close);

    document.body.appendChild(toast);
    state.notifyToast = toast;
  }

  function removeNotifyToast() {
    if (state.notifyToast && state.notifyToast.parentNode) {
      state.notifyToast.parentNode.removeChild(state.notifyToast);
    }
    state.notifyToast = null;
  }

  function maybePromptNotify(a) {
    if (!a || (!a.title && !a.text)) return;
    if (!notifySupported()) return;
    var permission = notifyPermission();
    if (permission === 'granted') {
      showAnnouncementNotification(a);
      removeNotifyToast();
      return;
    }

    var id = announcementKey(a);
    if (isDashboard()) {
      if (state.prompted[id] || sessionGet('dw_notif_prompt_' + id) === '1') return;
      window.setTimeout(function () {
        if (!isDashboard()) return;
        showNotifyModal(a, permission === 'denied' ? 'denied' : 'default');
      }, 700);
    } else {
      if (state.toastShown[id] || sessionGet('dw_notif_toast_' + id) === '1') return;
      window.setTimeout(function () {
        if (isDashboard()) return;
        showNotifyToast(a, permission === 'denied' ? 'denied' : 'default');
      }, 1200);
    }
  }

  function handleAnnouncement(a) {
    state.announcement = a || null;
    if (!a || (!a.title && !a.text)) {
      closeNotifyModal();
      removeNotifyToast();
      return;
    }
    if (!notifySupported()) return;
    registerNotifySW();
    maybePromptNotify(a);
  }

  function refreshWidgets() {
    if (state.root && state.data) {
      render(state.root, state.data);
    }
  }

  function focusAnnouncement() {
    if (!isDashboard()) {
      window.location.href = '/';
      return;
    }
    var a = state.announcement || (state.data && state.data.announcement);
    if (a && a.id) {
      try { window.localStorage.removeItem('dw_dismiss_' + a.id); } catch (e) { /* ignore */ }
    }
    refreshWidgets();
    var banner = state.root && state.root.querySelector ? state.root.querySelector('.dw-banner') : null;
    if (banner) {
      if (banner.classList && banner.classList.add) banner.classList.add('dw-banner-flash');
      if (banner.scrollIntoView) {
        try { banner.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) { banner.scrollIntoView(); }
      }
    }
  }

  function pollAnnouncement() {
    if (isDashboard()) return;
    fetch(ANNOUNCEMENT_ENDPOINT, {
      headers: { Accept: 'application/json' },
      credentials: 'same-origin',
    })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (payload) {
        handleAnnouncement(payload && payload.announcement ? payload.announcement : null);
      })
      .catch(function () { /* diam aja */ });
  }

  /* ---------------- mount point ---------------- */

  function findContentContainer() {
    var app = document.getElementById('app');
    if (!app) return null;

    var candidates = [];
    var divs = app.querySelectorAll('div');
    for (var i = 0; i < divs.length; i++) {
      var div = divs[i];
      if (window.getComputedStyle(div).maxWidth !== '1200px') continue;
      candidates.push(div);
    }
    if (!candidates.length) return null;

    for (var j = 0; j < candidates.length; j++) {
      if (candidates[j].querySelector('a[href^="/server/"], a[href*="page="], input[type="checkbox"]')) {
        return candidates[j];
      }
    }

    // fallback: container paling tinggi (konten utama, bukan footer)
    return candidates.sort(function (a, b) {
      return b.offsetHeight - a.offsetHeight;
    })[0];
  }

  function removeRoot() {
    if (state.root && state.root.parentNode) {
      state.root.parentNode.removeChild(state.root);
    }
    state.root = null;
  }

  function ensureRoot() {
    if (!isDashboard()) {
      removeRoot();
      return null;
    }
    if (state.root && document.body.contains(state.root)) {
      return state.root;
    }
    var container = findContentContainer();
    if (!container) return null;

    var existing = document.getElementById('dash-widgets');
    if (existing && container.contains(existing)) {
      state.root = existing;
      return existing;
    }
    if (existing && existing.parentNode) {
      existing.parentNode.removeChild(existing);
    }

    var root = el('div', 'dw-root');
    root.id = 'dash-widgets';
    container.insertBefore(root, container.firstChild);
    state.root = root;
    return root;
  }

  /* ---------------- data ---------------- */

  function load(force) {
    if (!isDashboard()) return;
    var root = ensureRoot();
    if (!root) return;

    if (state.loading) return;
    if (!force && state.data) {
      render(root, state.data);
      handleAnnouncement(state.data.announcement);
      return;
    }

    state.loading = true;
    if (!state.data) renderSkeleton(root);

    fetch(ENDPOINT, {
      headers: { Accept: 'application/json' },
      credentials: 'same-origin',
    })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (data) {
        state.data = data;
        state.lastFetch = Date.now();
        state.loading = false;
        if (state.root) render(state.root, data);
        handleAnnouncement(data.announcement);
      })
      .catch(function () {
        state.loading = false;
        // kalau udah ada data lama, biarin aja (jangan ilangin widget)
        if (state.root && !state.data) renderError(state.root);
      });
  }

  /* ---------------- render ---------------- */

  function renderSkeleton(root) {
    root.textContent = '';
    var grid = el('div', 'dw-grid');
    for (var i = 0; i < 4; i++) {
      grid.appendChild(el('div', 'dw-skel'));
    }
    root.appendChild(grid);
  }

  function renderError(root) {
    root.textContent = '';
    var card = el('div', 'dw-card');
    card.appendChild(head('⚠️', 'Widget'));
    card.appendChild(el('div', 'dw-empty', 'Gagal memuat data widget.'));
    var btn = el('button', 'dw-banner-close', '↻');
    btn.style.position = 'absolute';
    btn.style.right = '14px';
    btn.style.top = '14px';
    btn.setAttribute('aria-label', 'Coba lagi');
    btn.addEventListener('click', function () { load(true); });
    card.appendChild(btn);
    root.appendChild(card);
  }

  function head(icon, title, badge, badgeClass) {
    var row = el('div', 'dw-head');
    row.appendChild(el('span', 'dw-head-icon', icon));
    row.appendChild(el('span', 'dw-head-title', title));
    if (badge) {
      row.appendChild(el('span', 'dw-head-badge' + (badgeClass ? ' ' + badgeClass : ''), badge));
    }
    return row;
  }

  function card(icon, title, badge, badgeClass) {
    var node = el('div', 'dw-card');
    node.appendChild(head(icon, title, badge, badgeClass));
    return node;
  }

  function render(root, data) {
    root.textContent = '';

    var banner = announcementBanner(data.announcement);
    if (banner) root.appendChild(banner);

    var grid = el('div', 'dw-grid');
    grid.appendChild(networkCard(data.network || {}));
    grid.appendChild(myServersCard(data.my_servers || [], Number(data.my_servers_total) || (data.my_servers || []).length));
    grid.appendChild(quotaCard(data.quota || {}));
    grid.appendChild(nodesCard(data.nodes || []));
    root.appendChild(grid);
  }

  /* ---------------- banner ---------------- */

  function announcementBanner(a) {
    if (!a || (!a.title && !a.text)) return null;

    var key = 'dw_dismiss_' + a.id;
    try {
      if (window.localStorage.getItem(key) === '1') return null;
    } catch (e) { /* localStorage bisa diblokir */ }

    var type = a.type === 'promo' || a.type === 'maintenance' ? a.type : 'info';
    var banner = el('div', 'dw-banner dw-' + type);

    var icon = type === 'promo' ? '🎉' : type === 'maintenance' ? '🛠️' : '📢';
    banner.appendChild(el('span', 'dw-banner-icon', icon));

    var body = el('div', 'dw-banner-body');
    if (a.title) body.appendChild(el('strong', 'dw-banner-title', a.title));
    if (a.text) body.appendChild(el('div', 'dw-banner-text', a.text));

    if (notifySupported()) {
      var permission = notifyPermission();
      var notifyRow = el('div', 'dw-banner-notify');
      if (permission === 'granted') {
        notifyRow.appendChild(el('span', 'dw-banner-notify-on', '🔔 Notifikasi aktif'));
      } else {
        var nbtn = el('button', 'dw-notify-btn' + (permission === 'denied' ? ' denied' : ''),
          permission === 'denied' ? '🔕 Notif diblokir' : '🔔 Aktifkan notifikasi');
        nbtn.addEventListener('click', function () {
          if (permission === 'denied') showNotifyModal(a, 'denied');
          else requestNotifyPermission(a);
        });
        notifyRow.appendChild(nbtn);
        if (permission === 'denied') {
          notifyRow.appendChild(el('span', 'dw-banner-note', 'Aktifkan manual di setelan situs'));
        }
      }
      body.appendChild(notifyRow);
    }
    banner.appendChild(body);

    var until = humanUntil(a.until);
    if (until) banner.appendChild(el('span', 'dw-banner-until', until));

    var close = el('button', 'dw-banner-close', '×');
    close.setAttribute('aria-label', 'Tutup pengumuman');
    close.addEventListener('click', function () {
      try { window.localStorage.setItem(key, '1'); } catch (e) { /* ignore */ }
      if (banner.parentNode) banner.parentNode.removeChild(banner);
    });
    banner.appendChild(close);

    return banner;
  }

  /* ---------------- status jaringan ---------------- */

  function networkCard(n) {
    var online = Number(n.online) || 0;
    var total = Number(n.total) || 0;
    var cardNode = card('🌐', 'Status Jaringan',
      (Number(n.uptime_pct) || 0) + '%', Number(n.uptime_pct) >= 60 ? '' : 'warn');

    var big = el('div', 'dw-big');
    var num = el('span', 'dw-big-num', String(online));
    big.appendChild(num);
    big.appendChild(el('span', 'dw-big-sub', ' / ' + total + ' server online'));
    cardNode.appendChild(big);

    var meta = el('div', 'dw-meta');
    meta.appendChild(chip('Offline', n.offline));
    meta.appendChild(chip('Node', n.nodes));
    meta.appendChild(chip('Uptime', (Number(n.uptime_pct) || 0) + '%'));
    cardNode.appendChild(meta);

    cardNode.appendChild(sparkline(n.history || []));
    if (state.lastOnline === online) {
      num.textContent = String(online);
    } else {
      countUp(num, online);
      state.lastOnline = online;
    }
    return cardNode;
  }

  function chip(label, value) {
    var node = el('span', 'dw-chip');
    node.appendChild(document.createTextNode(label + ' '));
    node.appendChild(el('b', null, String(value == null ? '-' : value)));
    return node;
  }

  function sparkline(history) {
    var wrap = el('div', 'dw-spark');
    if (!history || history.length < 2) {
      wrap.appendChild(el('span', 'dw-muted', 'Nunggu history collector...'));
      return wrap;
    }

    var w = 300;
    var h = 42;
    var pad = 3;
    var min = Math.min.apply(null, history);
    var max = Math.max.apply(null, history);
    if (max === min) max = min + 1;

    var points = history.map(function (value, i) {
      var x = pad + (i / (history.length - 1)) * (w - pad * 2);
      var y = h - pad - ((value - min) / (max - min)) * (h - pad * 2);
      return x.toFixed(1) + ',' + y.toFixed(1);
    }).join(' ');

    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.setAttribute('class', 'dw-spark-svg');

    var poly = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    poly.setAttribute('points', points);
    poly.setAttribute('fill', 'none');
    poly.setAttribute('stroke', 'currentColor');
    poly.setAttribute('stroke-width', '2');
    poly.setAttribute('stroke-linecap', 'round');
    poly.setAttribute('stroke-linejoin', 'round');
    svg.appendChild(poly);

    wrap.appendChild(svg);
    return wrap;
  }

  function countUp(node, target) {
    if (!window.requestAnimationFrame || target <= 0) return;
    var start = null;
    var duration = 550;
    function step(ts) {
      if (!start) start = ts;
      var progress = Math.min(1, (ts - start) / duration);
      var eased = 1 - Math.pow(1 - progress, 3);
      node.textContent = String(Math.round(target * eased));
      if (progress < 1 && node.isConnected !== false) {
        window.requestAnimationFrame(step);
      } else {
        node.textContent = String(target);
      }
    }
    window.requestAnimationFrame(step);
  }

  /* ---------------- server saya ---------------- */

  function myServersCard(servers, total) {
    total = total || servers.length;
    var cardNode = card('🖥️', 'Server Saya', total ? String(total) : null);

    if (!servers.length) {
      var empty = el('div', 'dw-empty');
      empty.appendChild(el('span', null, 'Belum punya server.'));
      var link = el('a', null, 'Order di Shop Bot →');
      link.href = 'https://t.me/Auto_Order_By_Alfa_bot';
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      empty.appendChild(link);
      cardNode.appendChild(empty);
      return cardNode;
    }

    var list = el('div', 'dw-list dw-scroll');
    servers.forEach(function (server) {
      list.appendChild(serverRow(server));
    });
    cardNode.appendChild(list);

    if (total > 5) {
      cardNode.appendChild(el('div', 'dw-more', 'Scroll buat lihat semua (' + total + ' server)'));
    }
    return cardNode;
  }

  function serverRow(server) {
    var row = el('a', 'dw-row');
    row.href = '/server/' + encodeURIComponent(server.uuid || '');
    row.title = server.name + ' — ' + (server.node || '');

    var dot = el('span', 'dw-dot' + (server.suspended ? ' sus' : server.online ? ' on' : ''));
    row.appendChild(dot);

    var main = el('div', 'dw-row-main');
    main.appendChild(el('div', 'dw-row-name', server.name || 'Server'));
    var sub = server.node || '';
    if (server.suspended) sub = 'Suspended' + (sub ? ' · ' + sub : '');
    else sub = (server.online ? 'Online' : 'Offline') + (sub ? ' · ' + sub : '');
    main.appendChild(el('div', 'dw-row-sub', sub));
    row.appendChild(main);

    if (server.suspended) {
      row.appendChild(el('span', 'dw-row-tag', 'Suspend'));
    }
    return row;
  }

  /* ---------------- kuota ---------------- */

  function quotaCard(q) {
    var cardNode = card('📊', 'Kuota Resource');
    var wrap = el('div', 'dw-quota');

    wrap.appendChild(quotaBar('RAM', q.memory_used, q.memory_alloc, false));
    wrap.appendChild(quotaBar('Disk', q.disk_used, q.disk_alloc, true));
    cardNode.appendChild(wrap);

    if (!q.memory_alloc && !q.disk_alloc) {
      cardNode.appendChild(el('div', 'dw-muted', 'Limit server lu unlimited — ini pemakaian live semua server.'));
    }
    return cardNode;
  }

  function quotaBar(label, used, alloc, isDisk) {
    used = Number(used) || 0;
    alloc = Number(alloc) || 0;
    var unlimited = alloc <= 0;
    var percent = pct(used, alloc);

    var group = el('div', 'dw-q');
    var head = el('div', 'dw-q-head');
    head.appendChild(el('span', null, label));

    var value = el('span', 'dw-q-val');
    value.appendChild(el('b', null, fmtBytes(used)));
    if (unlimited) {
      value.appendChild(el('i', 'dw-q-badge', 'Unlimited'));
    } else {
      value.appendChild(document.createTextNode(' / ' + fmtBytes(alloc) + ' (' + percent + '%)'));
    }
    head.appendChild(value);
    group.appendChild(head);

    // kalau unlimited, jangan gambar bar penuh (kesannya kayak 100% kepake)
    if (!unlimited) {
      var bar = el('div', 'dw-bar' + (isDisk ? ' disk' : '') + (percent >= 90 ? ' hot' : ''));
      var fill = el('i');
      fill.style.width = percent + '%';
      bar.appendChild(fill);
      group.appendChild(bar);
    }

    return group;
  }

  /* ---------------- node health ---------------- */

  function nodesCard(nodes) {
    var onlineNodes = nodes.filter(function (n) { return n.wings === 'online'; }).length;
    var cardNode = card('🛰️', 'Node Health',
      nodes.length ? onlineNodes + '/' + nodes.length : null,
      nodes.length && onlineNodes < nodes.length ? 'off' : '');

    if (!nodes.length) {
      cardNode.appendChild(el('div', 'dw-empty', 'Belum ada node terdaftar.'));
      return cardNode;
    }

    var wrap = el('div', 'dw-nodes');
    nodes.forEach(function (node) {
      var row = el('div', 'dw-node');

      var dotClass = node.maintenance ? ' sus' : node.wings === 'online' ? ' on' : '';
      row.appendChild(el('span', 'dw-dot' + dotClass));

      var main = el('div', 'dw-node-main');
      main.appendChild(el('div', 'dw-node-name', node.name || 'Node'));
      var sub = node.wings === 'online' ? 'Wings online' : node.wings === 'offline' ? 'Wings offline' : 'Status unknown';
      if (node.maintenance) sub = 'Maintenance · ' + sub;
      main.appendChild(el('div', 'dw-node-sub', sub));

      var alloc = [];
      if (Number(node.memory) > 0) alloc.push(fmtBytes(Number(node.memory) * 1048576) + ' RAM');
      if (Number(node.disk) > 0) alloc.push(fmtBytes(Number(node.disk) * 1048576) + ' disk');
      if (alloc.length) main.appendChild(el('div', 'dw-node-alloc', 'Alokasi ' + alloc.join(' · ')));

      row.appendChild(main);

      var right = el('div', 'dw-node-right');
      var on = el('div', 'dw-node-online');
      on.appendChild(el('b', null, String(node.online || 0)));
      on.appendChild(document.createTextNode(' / ' + (node.servers || 0)));
      right.appendChild(on);
      right.appendChild(el('div', 'dw-node-total', 'server online'));
      row.appendChild(right);

      wrap.appendChild(row);
    });
    cardNode.appendChild(wrap);
    return cardNode;
  }

  /* ---------------- lifecycle ---------------- */

  function scheduleMount() {
    if (state.pending) return;
    state.pending = window.setTimeout(function () {
      state.pending = null;
      if (!isDashboard()) {
        removeRoot();
        closeNotifyModal();
        return;
      }
      removeNotifyToast();
      var root = ensureRoot();
      if (!root) return;
      if (state.data) {
        render(root, state.data);
      } else {
        load(false);
      }
    }, 250);
  }

  function watch() {
    if (state.observer) return;
    var app = document.getElementById('app');
    if (!app) return;
    state.observer = new MutationObserver(function () {
      if (!state.root || !document.body.contains(state.root)) scheduleMount();
    });
    state.observer.observe(app, { childList: true, subtree: true });
  }

  function start() {
    if (!document.getElementById('app')) return;
    watch();
    scheduleMount();
    load(false);

    registerNotifySW();
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', function (event) {
        if (event.data && event.data.type === 'pterowidget:open') focusAnnouncement();
      });
    }
    pollAnnouncement();

    window.setInterval(function () {
      if (document.hidden || !isDashboard()) return;
      load(true);
    }, POLL_MS);

    window.setInterval(function () {
      if (document.hidden) return;
      pollAnnouncement();
    }, ANNOUNCEMENT_POLL_MS);

    document.addEventListener('visibilitychange', function () {
      if (document.hidden) return;
      if (isDashboard()) load(true);
      else pollAnnouncement();
    });

    window.addEventListener('popstate', scheduleMount);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
