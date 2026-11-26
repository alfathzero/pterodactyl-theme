// Widget dashboard (pterodactyl-theme) — status jaringan, server saya,
// kuota resource, traffic pengunjung + island pengumuman.
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
    announcement: null,
    swPromise: null,
    swReg: null,
    notifyModal: null,
    notifyModalMode: null,
    notifyToast: null,
    permissionBusy: false,
    island: null,
    islandId: null,
    islandExpanded: false,
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
      refreshAnnouncementViews();
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
        refreshAnnouncementViews();
      } else if (permission === 'denied') {
        if (isDashboard()) {
          showNotifyModal(a, 'denied');
        } else {
          removeNotifyToast();
          showNotifyToast(a, 'denied', true);
        }
        refreshAnnouncementViews();
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

    if (!isDashboard()) return;

    var id = announcementKey(a);
    if (state.prompted[id] || sessionGet('dw_notif_prompt_' + id) === '1') return;
    window.setTimeout(function () {
      if (!isDashboard()) return;
      showNotifyModal(a, permission === 'denied' ? 'denied' : 'default');
    }, 700);
  }

  function handleAnnouncement(a) {
    state.announcement = a || null;
    if (!a || (!a.title && !a.text)) {
      closeNotifyModal();
      removeNotifyToast();
      removeAnnouncementIsland();
      return;
    }

    renderAnnouncementIsland(a);

    if (!notifySupported()) return;
    registerNotifySW();
    if (isDashboard()) {
      maybePromptNotify(a);
    } else if (notifyPermission() === 'granted') {
      showAnnouncementNotification(a);
    }
  }

  function refreshWidgets() {
    if (state.root && state.data) {
      render(state.root, state.data);
    }
  }

  function refreshAnnouncementViews() {
    if (state.announcement) renderAnnouncementIsland(state.announcement, true);
    if (isDashboard()) refreshWidgets();
  }

  function removeAnnouncementIsland() {
    if (state.island && state.island.parentNode) {
      state.island.parentNode.removeChild(state.island);
    }
    state.island = null;
    state.islandId = null;
    var existing = document.getElementById('dw-announcement-island');
    if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
  }

  function announcementDismissed(a) {
    if (!a || !a.id) return false;
    return localGet('dw_dismiss_' + a.id) === '1';
  }

  function dismissAnnouncement(a) {
    if (a && a.id) localSet('dw_dismiss_' + a.id, '1');
    removeAnnouncementIsland();
    closeNotifyModal();
    removeNotifyToast();
  }

  function announcementType(a) {
    return a && (a.type === 'promo' || a.type === 'maintenance') ? a.type : 'info';
  }

  function announcementIcon(type) {
    return type === 'promo' ? '🎉' : type === 'maintenance' ? '🛠️' : '📢';
  }

  function announcementPreview(a) {
    var text = String((a && a.text) || '').replace(/\s+/g, ' ').trim();
    if (!text) return 'Klik buat lihat detail';
    return text.length > 90 ? text.slice(0, 87) + '...' : text;
  }

  function notifyControls(a) {
    if (!notifySupported()) return null;

    var permission = notifyPermission();
    var row = el('div', 'dw-ai-notify');

    if (permission === 'granted') {
      row.appendChild(el('span', 'dw-ai-notify-on', '🔔 Notifikasi aktif'));
      return row;
    }

    var btn = el('button', 'dw-notify-btn' + (permission === 'denied' ? ' denied' : ''),
      permission === 'denied' ? '🔕 Notif diblokir' : '🔔 Aktifkan notifikasi');
    btn.type = 'button';
    btn.addEventListener('click', function (ev) {
      if (ev && ev.stopPropagation) ev.stopPropagation();
      if (permission === 'denied') {
        if (isDashboard()) showNotifyModal(a, 'denied');
        else showNotifyToast(a, 'denied', true);
      } else {
        requestNotifyPermission(a);
      }
    });
    row.appendChild(btn);

    if (permission === 'denied') {
      row.appendChild(el('span', 'dw-ai-note', 'Aktifkan manual di setelan situs'));
    }
    return row;
  }

  function renderAnnouncementIsland(a, force) {
    if (!a || (!a.title && !a.text) || announcementDismissed(a)) {
      removeAnnouncementIsland();
      return;
    }

    var id = String(a.id || 'default');
    var existing = state.island;
    var same = existing && state.islandId === id && existing.parentNode;

    if (same && !force) {
      var untilNode = existing.querySelector ? existing.querySelector('.dw-ai-until') : null;
      if (untilNode) {
        var untilText = humanUntil(a.until);
        untilNode.textContent = untilText;
        untilNode.style.display = untilText ? '' : 'none';
      }
      return;
    }

    var expanded = same ? state.islandExpanded : false;
    removeAnnouncementIsland();

    var type = announcementType(a);
    var island = el('div', 'dw-ai dw-ai-' + type + (expanded ? ' dw-ai-expanded' : ''));
    island.id = 'dw-announcement-island';
    island.setAttribute('role', 'status');
    island.setAttribute('aria-live', 'polite');

    var head = el('div', 'dw-ai-head');
    head.setAttribute('role', 'button');
    head.setAttribute('tabindex', '0');
    head.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    head.setAttribute('aria-label', 'Buka detail pengumuman');

    head.appendChild(el('span', 'dw-ai-icon', announcementIcon(type)));

    var main = el('div', 'dw-ai-main');
    main.appendChild(el('span', 'dw-ai-title', a.title || 'Pengumuman baru'));
    main.appendChild(el('span', 'dw-ai-sub', announcementPreview(a)));
    head.appendChild(main);

    var untilText = humanUntil(a.until);
    var until = el('span', 'dw-ai-until', untilText);
    if (!untilText) until.style.display = 'none';
    head.appendChild(until);

    var chevron = el('span', 'dw-ai-chevron', expanded ? '⌃' : '⌄');
    head.appendChild(chevron);

    var close = el('button', 'dw-ai-close', '×');
    close.type = 'button';
    close.setAttribute('aria-label', 'Hapus pengumuman ini');
    close.addEventListener('click', function (ev) {
      if (ev && ev.stopPropagation) ev.stopPropagation();
      dismissAnnouncement(a);
    });
    head.appendChild(close);

    island.appendChild(head);

    var body = el('div', 'dw-ai-body');
    var inner = el('div', 'dw-ai-body-inner');
    if (a.text) inner.appendChild(el('div', 'dw-ai-text', a.text));

    var actions = el('div', 'dw-ai-actions');
    var controls = notifyControls(a);
    if (controls) actions.appendChild(controls);

    var dismiss = el('button', 'dw-ai-dismiss', 'Hapus pengumuman');
    dismiss.type = 'button';
    dismiss.addEventListener('click', function (ev) {
      if (ev && ev.stopPropagation) ev.stopPropagation();
      dismissAnnouncement(a);
    });
    actions.appendChild(dismiss);

    inner.appendChild(actions);
    body.appendChild(inner);
    island.appendChild(body);

    function toggle() {
      state.islandExpanded = !state.islandExpanded;
      if (state.islandExpanded) island.classList.add('dw-ai-expanded');
      else island.classList.remove('dw-ai-expanded');
      head.setAttribute('aria-expanded', state.islandExpanded ? 'true' : 'false');
      chevron.textContent = state.islandExpanded ? '⌃' : '⌄';
    }

    head.addEventListener('click', function (ev) {
      if (ev && ev.target && ev.target.closest && ev.target.closest('.dw-ai-close')) return;
      toggle();
    });
    head.addEventListener('keydown', function (ev) {
      if (ev.target && ev.target.closest && ev.target.closest('.dw-ai-close')) return;
      if (ev.key === 'Enter' || ev.key === ' ' || ev.key === 'Spacebar') {
        ev.preventDefault();
        toggle();
      }
    });

    document.body.appendChild(island);
    state.island = island;
    state.islandId = id;
    state.islandExpanded = expanded;
  }

  function focusAnnouncement() {
    var a = state.announcement || (state.data && state.data.announcement);
    if (!a) {
      if (isDashboard()) load(true);
      else pollAnnouncement();
      return;
    }
    if (a.id) {
      try { window.localStorage.removeItem('dw_dismiss_' + a.id); } catch (e) { /* ignore */ }
    }
    state.islandExpanded = true;
    renderAnnouncementIsland(a, true);
    if (state.island) {
      state.island.classList.add('dw-ai-expanded');
      state.island.classList.add('dw-ai-flash');
      var head = state.island.querySelector ? state.island.querySelector('.dw-ai-head') : null;
      if (head) head.setAttribute('aria-expanded', 'true');
      var chevron = state.island.querySelector ? state.island.querySelector('.dw-ai-chevron') : null;
      if (chevron) chevron.textContent = '⌃';
      window.setTimeout(function () {
        if (state.island) state.island.classList.remove('dw-ai-flash');
      }, 2200);
    }
    if (isDashboard()) refreshWidgets();
    else pollAnnouncement();
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
      if (div.id === 'dw-announcement-island') continue;

      var style = window.getComputedStyle(div);
      if (style.maxWidth !== '1200px') continue;

      // skip navbar / subnav yang parent-nya bisa di-scroll horizontal
      var parent = div.parentElement || div.parentNode;
      if (parent) {
        var parentStyle = window.getComputedStyle(parent);
        if (parentStyle.overflowX === 'auto' || parentStyle.overflowX === 'scroll') continue;
      }
      if (div.querySelector && div.querySelector('#logo')) continue;

      // skip footer (pendek, isinya copyright Pterodactyl)
      if (div.offsetHeight < 100) continue;
      if (div.textContent && div.textContent.length < 400 && /Pterodactyl/.test(div.textContent)) continue;

      candidates.push({
        el: div,
        marginTop: parseFloat(style.marginTop) || 0,
        height: div.offsetHeight,
      });
    }
    if (!candidates.length) return null;

    // container konten utama biasanya punya margin atas (my-4 / sm:my-10)
    var withMargin = candidates.filter(function (c) { return c.marginTop > 0; });
    var pool = withMargin.length ? withMargin : candidates;

    for (var j = 0; j < pool.length; j++) {
      if (pool[j].el.querySelector('a[href^="/server/"], a[href*="page="], input[type="checkbox"]')) {
        return pool[j].el;
      }
    }

    // fallback: container paling tinggi (konten utama, bukan footer)
    return pool.sort(function (a, b) {
      return b.height - a.height;
    })[0].el;
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
    var btn = el('button', 'dw-icon-btn', '↻');
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

    if (data.user) root.appendChild(heroCard(data.user, data));

    var grid = el('div', 'dw-grid');
    grid.appendChild(myServersCard(data.my_servers || [], Number(data.my_servers_total) || (data.my_servers || []).length));
    grid.appendChild(quotaCard(data.quota || {}));
    grid.appendChild(trafficCard(data.traffic || {}));
    if (data.vps) grid.appendChild(vpsCard(data.vps));
    root.appendChild(grid);
  }

  /* ---------------- hero profil (glass) ---------------- */
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

  function joinedLabel(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return 'Gabung ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear();
  }

  function initEl(initials) {
    return el('div', 'gl-avatar', initials);
  }

  function hstat(value, label) {
    var node = el('div', 'gl-hstat');
    node.appendChild(el('b', null, String(value)));
    node.appendChild(el('span', null, label));
    return node;
  }

  function heroCard(u, data) {
    var net = data.network || {};
    var hero = el('div', 'gl-hero');
    hero.appendChild(el('div', 'gl-cover'));

    var body = el('div', 'gl-hero-body');
    var top = el('div', 'gl-hero-top');

    var wrap = el('div', 'gl-avatar-wrap');
    var initials = String(u.username || '?').slice(0, 2).toUpperCase();
    if (u.avatar) {
      var img = el('img', 'gl-avatar');
      img.src = u.avatar;
      img.alt = u.username || 'avatar';
      img.addEventListener('error', function () {
        if (img.parentNode) img.parentNode.replaceChild(initEl(initials), img);
      });
      wrap.appendChild(img);
    } else {
      wrap.appendChild(initEl(initials));
    }
    wrap.appendChild(el('span', 'gl-dot'));
    top.appendChild(wrap);

    var actions = el('div', 'gl-actions');
    var acc = el('a', 'gl-btn', '⚙️ Akun');
    acc.href = '/account';
    var edit = el('a', 'gl-btn gl-btn-primary', '✏️ Edit Profil');
    edit.href = '/account';
    actions.appendChild(acc);
    actions.appendChild(edit);
    top.appendChild(actions);
    body.appendChild(top);

    var identity = el('div', 'gl-identity');
    var left = el('div');

    var name = el('h1', 'gl-name');
    name.appendChild(document.createTextNode(u.username || 'User'));
    if (u.root_admin) name.appendChild(el('span', 'gl-badge-admin', 'Root Admin'));
    left.appendChild(name);

    left.appendChild(el('div', 'gl-handle',
      '@' + (u.username || 'user') + ' · ' + (u.root_admin ? 'Administrator' : 'Member')));
    left.appendChild(el('p', 'gl-bio',
      'Selamat datang di dashboard. Status server, kuota resource, dan aktivitas panel tampil real-time di sini.'));

    var chips = el('div', 'gl-chips');
    var live = el('span', 'gl-chip gl-chip-live');
    live.appendChild(el('span', 'gl-pulse'));
    live.appendChild(document.createTextNode('Online'));
    chips.appendChild(live);
    chips.appendChild(el('span', 'gl-chip', '🛰️ ' + (Number(net.nodes) || 0) + ' node'));
    chips.appendChild(el('span', 'gl-chip', '🖥️ ' + (Number(net.online) || 0) + ' server online'));
    var j = joinedLabel(u.joined);
    if (j) chips.appendChild(el('span', 'gl-chip', '📅 ' + j));
    left.appendChild(chips);
    identity.appendChild(left);

    var stats = el('div', 'gl-stats');
    stats.appendChild(hstat(Number(data.my_servers_total) || 0, 'Server Saya'));
    stats.appendChild(hstat(Number(net.online) || 0, 'Online'));
    stats.appendChild(hstat(Number(net.total) || 0, 'Total Server'));
    stats.appendChild(hstat((Number(net.uptime_pct) || 0) + '%', 'Uptime'));
    identity.appendChild(stats);
    body.appendChild(identity);

    hero.appendChild(body);
    return hero;
  }

  /* ---------------- chip ---------------- */
  function chip(label, value) {
    var node = el('span', 'dw-chip');
    node.appendChild(document.createTextNode(label + ' '));
    node.appendChild(el('b', null, String(value == null ? '-' : value)));
    return node;
  }

  /* ---------------- VPS real-time ---------------- */

  function vpsCard(v) {
    var hasCpu = v.cpu_pct !== null && v.cpu_pct !== undefined;
    var cpu = hasCpu ? Number(v.cpu_pct) : 0;

    var cardNode = card('🖥️', 'VPS Real-Time', hasCpu ? Math.round(cpu) + '%' : '…',
      hasCpu && cpu >= 85 ? 'warn' : '');

    var big = el('div', 'dw-big');
    var num = el('span', 'dw-big-num', hasCpu ? String(Math.round(cpu)) : '—');
    big.appendChild(num);
    big.appendChild(el('span', 'dw-big-sub', v.cores ? '% CPU · ' + v.cores + ' core' : '% CPU (live)'));
    cardNode.appendChild(big);

    var meta = el('div', 'dw-meta');
    meta.appendChild(chip('RAM',
      (v.ram_used_gb != null && v.ram_total_gb != null) ? v.ram_used_gb + ' / ' + v.ram_total_gb + ' GB' : '-'));
    meta.appendChild(chip('Disk',
      (v.disk_used_gb != null && v.disk_total_gb != null) ? v.disk_used_gb + ' / ' + v.disk_total_gb + ' GB' : '-'));
    meta.appendChild(chip('Load', v.load != null ? v.load : '-'));
    if (v.uptime) meta.appendChild(chip('Uptime', v.uptime));
    cardNode.appendChild(meta);

    var l1 = el('div', 'dw-muted'); l1.textContent = 'CPU % (30 mnt)';
    var l2 = el('div', 'dw-muted'); l2.textContent = 'RAM % (30 mnt)';
    cardNode.appendChild(l1);
    cardNode.appendChild(sparkline(v.history_cpu || [], 'Nunggu data VPS...'));
    cardNode.appendChild(l2);
    cardNode.appendChild(sparkline(v.history_ram || [], 'Nunggu data VPS...'));

    return cardNode;
  }

  function sparkline(history, emptyText) {
    var wrap = el('div', 'dw-spark');
    if (!history || history.length < 2) {
      wrap.appendChild(el('span', 'dw-muted', emptyText || 'Nunggu history collector...'));
      return wrap;
    }

    var total = history.reduce(function (sum, value) { return sum + (Number(value) || 0); }, 0);
    if (total <= 0) {
      wrap.appendChild(el('span', 'dw-muted', emptyText || 'Nunggu history collector...'));
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

  /* ---------------- traffic pengunjung ---------------- */

  function fmtNum(value) {
    value = Number(value) || 0;
    if (value >= 1000000) {
      return (value / 1000000).toFixed(value >= 10000000 ? 0 : 1).replace(/\.0$/, '') + 'M';
    }
    if (value >= 1000) {
      return (value / 1000).toFixed(value >= 10000 ? 0 : 1).replace(/\.0$/, '') + 'K';
    }
    return String(value);
  }

  function trafficCard(t) {
    var online = Number(t.online) || 0;
    var cardNode = card('👥', 'Traffic Pengunjung', online > 0 ? online + ' online' : 'LIVE');
    cardNode.classList.add('dw-traffic');

    var big = el('div', 'dw-big');
    big.appendChild(el('span', 'dw-big-num', fmtNum(online)));
    big.appendChild(el('span', 'dw-big-sub', ' pengunjung online'));
    cardNode.appendChild(big);

    var meta = el('div', 'dw-meta');
    meta.appendChild(chip('Hari ini', fmtNum(t.today_visitors)));
    meta.appendChild(chip('Kunjungan', fmtNum(t.today_views)));
    meta.appendChild(chip('7 hari', fmtNum(t.week_visitors)));
    cardNode.appendChild(meta);

    cardNode.appendChild(sparkline(t.history || [], 'Belum ada kunjungan hari ini'));
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
        renderAnnouncementIsland(state.announcement);
        return;
      }
      removeNotifyToast();
      renderAnnouncementIsland(state.announcement);
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
      if (isDashboard()) {
        if (!state.root || !document.body.contains(state.root)) scheduleMount();
      } else if (state.announcement && (!state.island || !document.body.contains(state.island))) {
        scheduleMount();
      }
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
