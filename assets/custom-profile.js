// Profile photo (pterodactyl-theme) — upload/hapus di /account + avatar navbar.
(function () {
  'use strict';

  var AVATAR_URL = '/profile/avatar';
  var state = {
    root: null,
    user: null,
    busy: false,
    navObserver: null,
  };

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = String(text);
    return node;
  }

  function isAccount() {
    return window.location.pathname.replace(/\/+$/, '') === '/account';
  }

  function csrfToken() {
    var meta = document.querySelector('meta[name="csrf-token"]');
    if (meta) return meta.getAttribute('content');
    meta = document.querySelector('meta[name="_token"]');
    return meta ? meta.getAttribute('content') : '';
  }

  /* ---------------- fetch current user + avatar ---------------- */

  function fetchMe() {
    return fetch('/api/client/account', {
      headers: { Accept: 'application/json' },
      credentials: 'same-origin',
    })
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (data) {
        if (data && data.attributes) {
          state.user = {
            id: data.attributes.id,
            username: data.attributes.username,
          };
        }
        return state.user;
      })
      .catch(function () { return null; });
  }

  function avatarUrlFor(id, t) {
    if (!id) return null;
    return AVATAR_URL + '/' + id + '?v=' + (t || Date.now());
  }

  /* ---------------- account page card ---------------- */

  function findAccountContainer() {
    var app = document.getElementById('app');
    if (!app) return null;
    var divs = app.querySelectorAll('div');
    for (var i = 0; i < divs.length; i++) {
      var div = divs[i];
      if (div.id === 'pf-card') continue;
      var style = window.getComputedStyle(div);
      if (style.maxWidth !== '1200px') continue;
      var parent = div.parentElement || div.parentNode;
      if (parent) {
        var ps = window.getComputedStyle(parent);
        if (ps.overflowX === 'auto' || ps.overflowX === 'scroll') continue;
      }
      if (div.querySelector && div.querySelector('input[type="password"]')) {
        return div;
      }
    }
    return null;
  }

  function initials(name) {
    return String(name || '?').replace(/[^A-Za-z0-9]/g, '').slice(0, 2).toUpperCase() || '??';
  }

  function hue(name) {
    var h = 0;
    for (var i = 0; i < (name || '').length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
    return h;
  }

  function renderCard() {
    if (!isAccount()) return;
    var container = findAccountContainer();
    if (!container) return;

    if (state.root && container.contains(state.root)) return;
    removeCard();

    var user = state.user || { id: null, username: 'User' };
    var card = el('div', 'pf-card');
    card.id = 'pf-card';

    var head = el('div', 'pf-head');
    head.appendChild(el('span', 'pf-head-icon', '🧑'));
    head.appendChild(el('span', 'pf-head-title', 'Foto Profil'));
    card.appendChild(head);

    var row = el('div', 'pf-row');

    var preview = el('div', 'pf-preview');
    preview.textContent = initials(user.username);
    var avaUrl = user.id ? avatarUrlFor(user.id) : null;
    var img = el('img');
    img.alt = 'Avatar';
    img.style.display = 'none';
    img.onload = function () {
      preview.textContent = '';
      img.style.display = 'block';
      var del = card.querySelector('.pf-btn.danger');
      if (del) del.style.display = '';
    };
    img.onerror = function () { img.style.display = 'none'; };
    if (avaUrl) img.src = avaUrl;
    preview.appendChild(img);
    row.appendChild(preview);

    var actions = el('div', 'pf-actions');
    actions.appendChild(el('p', 'pf-hint', 'Foto profil muncul di chat room dan navbar. Format jpg/png/webp/gif, maks 2 MB. Akan otomatis di-crop jadi kotak 256×256.'));

    var btns = el('div', 'pf-btns');
    var uploadBtn = el('button', 'pf-btn', '📤 Upload Foto');
    uploadBtn.type = 'button';
    var fileInput = el('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/jpeg,image/png,image/webp,image/gif';
    fileInput.style.display = 'none';
    uploadBtn.addEventListener('click', function () { fileInput.click(); });
    fileInput.addEventListener('change', function () {
      if (fileInput.files && fileInput.files[0]) doUpload(fileInput.files[0], card);
    });
    btns.appendChild(uploadBtn);

    var delBtn = el('button', 'pf-btn danger', '🗑 Hapus');
    delBtn.type = 'button';
    delBtn.style.display = avaUrl ? '' : 'none';
    delBtn.addEventListener('click', function () { doDelete(card); });
    btns.appendChild(delBtn);

    actions.appendChild(btns);
    actions.appendChild(fileInput);
    row.appendChild(actions);
    card.appendChild(row);

    container.insertBefore(card, container.firstChild);
    state.root = card;
  }

  function removeCard() {
    if (state.root && state.root.parentNode) {
      state.root.parentNode.removeChild(state.root);
    }
    state.root = null;
  }

  function toast(card, msg, ok) {
    var existing = card.querySelector('.pf-toast');
    if (existing) existing.remove();
    var t = el('div', 'pf-toast ' + (ok ? 'ok' : 'err'), msg);
    card.appendChild(t);
    if (ok) setTimeout(function () { if (t.parentNode) t.remove(); }, 4000);
  }

  function setBusy(card, busy) {
    state.busy = busy;
    var btns = card.querySelectorAll('.pf-btn');
    for (var i = 0; i < btns.length; i++) btns[i].disabled = busy;
  }

  function doUpload(file, card) {
    if (state.busy) return;
    if (file.size > 2 * 1024 * 1024) {
      toast(card, '⚠️ File kebesaran (maks 2 MB)', false);
      return;
    }
    var allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (allowed.indexOf(file.type) < 0) {
      toast(card, '⚠️ Format harus jpg/png/webp/gif', false);
      return;
    }

    setBusy(card, true);
    var uploadBtn = card.querySelector('.pf-btn:not(.danger)');
    var origText = uploadBtn.textContent;
    uploadBtn.innerHTML = '<span class="pf-spin"></span>Uploading...';

    var fd = new FormData();
    fd.append('avatar', file);

    fetch(AVATAR_URL, {
      method: 'POST',
      headers: { 'X-CSRF-Token': csrfToken(), Accept: 'application/json' },
      credentials: 'same-origin',
      body: fd,
    })
      .then(function (res) { return res.json().then(function (d) { return { ok: res.ok, data: d }; }); })
      .then(function (r) {
        uploadBtn.textContent = origText;
        setBusy(card, false);
        if (r.ok && r.data && r.data.ok) {
          var url = r.data.avatar_url || (state.user ? avatarUrlFor(state.user.id) : null);
          if (url) {
            var img = card.querySelector('.pf-preview img');
            if (img) {
              img.src = url + (url.indexOf('?') >= 0 ? '&' : '?') + 't=' + Date.now();
              img.style.display = 'block';
              var preview = card.querySelector('.pf-preview');
              if (preview && state.user) preview.textContent = '';
              preview.appendChild(img);
            }
            var del = card.querySelector('.pf-btn.danger');
            if (del) del.style.display = '';
          }
          toast(card, '✓ Foto profil diperbarui', true);
          // re-render navbar avatar with fresh cache-bust
          refreshNavbar();
        } else {
          toast(card, '⚠️ ' + ((r.data && r.data.error) || 'Gagal upload'), false);
        }
      })
      .catch(function () {
        uploadBtn.textContent = origText;
        setBusy(card, false);
        toast(card, '⚠️ Gagal upload — cek koneksi', false);
      });
  }

  function doDelete(card) {
    if (state.busy) return;
    setBusy(card, true);
    fetch(AVATAR_URL, {
      method: 'DELETE',
      headers: { 'X-CSRF-Token': csrfToken(), Accept: 'application/json' },
      credentials: 'same-origin',
    })
      .then(function (res) { return res.json().then(function (d) { return { ok: res.ok, data: d }; }); })
      .then(function (r) {
        setBusy(card, false);
        if (r.ok) {
          var img = card.querySelector('.pf-preview img');
          if (img) img.style.display = 'none';
          var preview = card.querySelector('.pf-preview');
          if (preview && state.user) preview.textContent = initials(state.user.username);
          var del = card.querySelector('.pf-btn.danger');
          if (del) del.style.display = 'none';
          toast(card, '✓ Foto profil dihapus', true);
          refreshNavbar();
        } else {
          toast(card, '⚠️ ' + ((r.data && r.data.error) || 'Gagal hapus'), false);
        }
      })
      .catch(function () {
        setBusy(card, false);
        toast(card, '⚠️ Gagal hapus — cek koneksi', false);
      });
  }

  /* ---------------- navbar avatar swap ---------------- */

  function refreshNavbar() {
    if (!state.user) return;
    var nav = findNavbar();
    if (!nav) return;
    var accountBtn = findAccountBtn(nav);
    if (!accountBtn) return;

    // Cek apakah user punya avatar dengan fetch HEAD
    var url = avatarUrlFor(state.user.id);
    var old = accountBtn.querySelector('img.nav-avatar');
    if (old) old.remove();

    // Sembunyikan ikon default (span/svg di dalam tombol) hanya kalau avatar berhasil load
    var iconNodes = accountBtn.querySelectorAll('span, svg');
    var img = el('img', 'nav-avatar');
    img.alt = 'Avatar';
    img.style.display = 'none';
    img.onload = function () {
      img.style.display = '';
      for (var i = 0; i < iconNodes.length; i++) {
        iconNodes[i].style.display = 'none';
      }
    };
    img.onerror = function () {
      if (img.parentNode) img.remove();
      for (var i = 0; i < iconNodes.length; i++) {
        iconNodes[i].style.display = '';
      }
    };
    img.src = url;
    accountBtn.appendChild(img);
  }

  function findNavbar() {
    var logo = document.getElementById('logo');
    if (!logo) return null;
    var nav = logo.nextElementSibling;
    if (nav && nav.querySelector) return nav;
    // fallback: cari container yang punya link ke /account
    var app = document.getElementById('app');
    if (!app) return null;
    var links = app.querySelectorAll('a[href="/account"]');
    for (var i = 0; i < links.length; i++) {
      var p = links[i].parentElement;
      if (p && p.querySelector && p.querySelectorAll('a, button').length > 2) return p;
    }
    return null;
  }

  function findAccountBtn(nav) {
    // tombol akun biasanya link ke /account
    var links = nav.querySelectorAll('a[href="/account"]');
    if (links.length) return links[links.length - 1];
    // fallback: cari elemen dengan aria-label user/account
    var cands = nav.querySelectorAll('[aria-label]');
    for (var i = 0; i < cands.length; i++) {
      var al = (cands[i].getAttribute('aria-label') || '').toLowerCase();
      if (al.indexOf('account') >= 0 || al.indexOf('user') >= 0 || al.indexOf('profil') >= 0) return cands[i];
    }
    return null;
  }

  function watchNavbar() {
    if (state.navObserver) return;
    state.navObserver = new MutationObserver(function () {
      if (!state.user) return;
      var nav = findNavbar();
      if (!nav) return;
      var btn = findAccountBtn(nav);
      if (!btn.querySelector('img.nav-avatar')) {
        refreshNavbar();
      }
    });
    var app = document.getElementById('app');
    if (app) state.navObserver.observe(app, { childList: true, subtree: true });
  }

  /* ---------------- lifecycle ---------------- */

  function start() {
    if (!document.getElementById('app')) return;
    fetchMe().then(function () {
      if (isAccount()) {
        renderCard();
        new MutationObserver(function () { renderCard(); }).observe(document.body, { childList: true, subtree: true });
        setInterval(function () { if (!state.root || !document.body.contains(state.root)) renderCard(); }, 1500);
      }
      refreshNavbar();
      watchNavbar();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
