// Profile photo (pterodactyl-theme) — upload/hapus di /account + avatar navbar.
(function () {
  'use strict';

  var AVATAR_URL = '/profile/avatar';
  var state = {
    root: null,
    user: null,
    busy: false,
    navEl: null,
    navBtn: null,
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
    var appDiv = document.getElementById('app');
    if (appDiv) {
      var uid = parseInt(appDiv.getAttribute('data-user-id') || '0', 10);
      if (uid > 0) state.user = { id: uid, username: '' };
    }
    return fetch('/profile/me', {
      headers: { Accept: 'application/json' },
      credentials: 'same-origin',
    })
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (data) {
        if (data && data.id) {
          state.user = {
            id: data.id,
            username: data.username || (state.user ? state.user.username : 'User'),
            avatar: data.avatar || null,
          };
        }
        return state.user;
      })
      .catch(function () { return state.user; });
  }

  function avatarUrlFor(id, t) {
    if (!id) return null;
    return AVATAR_URL + '/' + id + '?v=' + (t || Date.now());
  }

  /* ---------------- fast account container lookup ---------------- */

  // Walk up from the password input instead of scanning all divs
  function findAccountContainer() {
    var input = document.querySelector('#app input[type="password"]');
    if (!input) return null;
    var cur = input;
    for (var d = 0; d < 8; d++) {
      cur = cur.parentElement;
      if (!cur) break;
      var ms = cur.style.maxWidth || cur.style.max_width;
      if (ms === '1200px') return cur;
      var id = cur.id;
      if (id && id !== 'pf-card' && cur.className && /max-w-/.test(cur.className)) {
        // check computed as fallback
        if (window.getComputedStyle(cur).maxWidth === '1200px') return cur;
      }
    }
    // fallback: parent that contains password input and has reasonable width
    cur = input;
    for (var d2 = 0; d2 < 8; d2++) {
      cur = cur.parentElement;
      if (!cur) break;
      if (cur.querySelector('input[type="password"]') &&
          (cur.style.maxWidth === '1200px' ||
           window.getComputedStyle(cur).maxWidth === '1200px')) {
        return cur;
      }
    }
    return null;
  }

  function initials(name) {
    return String(name || '?').replace(/[^A-Za-z0-9]/g, '').slice(0, 2).toUpperCase() || '??';
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
              if (preview) preview.textContent = '';
              if (img.parentNode !== preview) preview.appendChild(img);
            }
            var del = card.querySelector('.pf-btn.danger');
            if (del) del.style.display = '';
          }
          toast(card, '✓ Foto profil diperbarui', true);
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

  /* ---------------- navbar avatar (lightweight) ---------------- */

  function findNavbar() {
    var logo = document.getElementById('logo');
    if (logo && logo.nextElementSibling && logo.nextElementSibling.querySelector) {
      return logo.nextElementSibling;
    }
    return null;
  }

  function findAccountBtn(nav) {
    if (!nav) return null;
    var links = nav.querySelectorAll('a[href="/account"]');
    return links.length ? links[links.length - 1] : null;
  }

  function refreshNavbar() {
    if (!state.user || !state.user.id) return;
    var nav = state.navEl || findNavbar();
    if (!nav) return;
    var btn = state.navBtn || findAccountBtn(nav);
    if (!btn) return;

    // remove old injected avatar
    var old = btn.querySelector('img.nav-avatar');
    if (old) old.remove();

    // hide default icon, show img on load
    var iconNodes = btn.querySelectorAll('span, svg');
    var img = el('img', 'nav-avatar');
    img.alt = 'Avatar';
    img.style.display = 'none';
    img.onload = function () {
      img.style.display = '';
      for (var i = 0; i < iconNodes.length; i++) iconNodes[i].style.display = 'none';
    };
    img.onerror = function () {
      if (img.parentNode) img.remove();
      for (var i = 0; i < iconNodes.length; i++) iconNodes[i].style.display = '';
    };
    img.src = avatarUrlFor(state.user.id);
    btn.appendChild(img);
  }

  // Debounced watch — only re-inject if nav was re-rendered by React
  var navTimer = null;
  function watchNavbar() {
    var nav = findNavbar();
    if (!nav) {
      // nav not ready yet, retry once after 500ms
      setTimeout(function () {
        nav = findNavbar();
        if (nav) watchNavbar();
      }, 500);
      return;
    }
    state.navEl = nav;
    state.navBtn = findAccountBtn(nav);
    var observer = new MutationObserver(function (mutations) {
      // only react if the account button was removed (React re-render)
      for (var i = 0; i < mutations.length; i++) {
        var removed = mutations[i].removedNodes;
        for (var j = 0; j < removed.length; j++) {
          var n = removed[j];
          if (n.nodeType === 1 && (n.querySelector && n.querySelector('a[href="/account"]') ||
              n.tagName === 'A' && n.getAttribute('href') === '/account')) {
            // account button was removed, debounce re-inject
            if (navTimer) clearTimeout(navTimer);
            navTimer = setTimeout(function () {
              state.navBtn = findAccountBtn(state.navEl);
              refreshNavbar();
            }, 100);
            return;
          }
        }
      }
    });
    observer.observe(nav, { childList: true });
  }

  /* ---------------- lifecycle ---------------- */

  function start() {
    if (!document.getElementById('app')) return;
    fetchMe().then(function () {
      refreshNavbar();
      watchNavbar();
      if (isAccount()) {
        renderCard();
        // watch only the container (not body) — cheap
        var container = findAccountContainer();
        if (container) {
          var mo = new MutationObserver(function () { renderCard(); });
          mo.observe(container, { childList: true });
        }
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
