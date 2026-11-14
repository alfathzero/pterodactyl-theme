// Chat Room — bubble orb chat (part of pterodactyl-theme)
// Identitas dari akun login; polling 2.5s(open)/10s(closed); reaksi, mention, mute, hapus.
(function () {
  if (window.PteroChat && window.PteroChat.__built) return;
  var API = '/chat', TICK = 2500, CLOSED_EVERY = 4;
  var REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🔥'];
  var st = {
    __built: true, open: false, my: null, lastId: 0, oldestId: null,
    loadingOld: false, ticks: 0, unread: 0, mention: false, newCount: 0, sending: false,
    readonly: false
  };
  var els = {};

  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function csrf() {
    var m = document.querySelector('meta[name="csrf-token"]') || document.querySelector('meta[name="_token"]');
    return m ? m.content : '';
  }
  function api(path, method, data) {
    var opt = { method: method || 'GET', credentials: 'same-origin', headers: { 'Accept': 'application/json', 'X-CSRF-TOKEN': csrf() } };
    if (data) { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(data); }
    return fetch(path, opt).then(function (r) {
      return r.text().then(function (txt) {
        var j;
        try { j = txt ? JSON.parse(txt) : {}; }
        catch (e) { j = { error: r.status === 419 ? 'Sesi kedaluwarsa — refresh halaman' : 'Server error (' + r.status + ')' }; }
        return { ok: r.ok, status: r.status, data: j };
      });
    }, function () {
      return { ok: false, status: 0, data: { error: 'Koneksi error' } };
    });
  }
  function wib(iso) {
    try { return new Date(iso).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' }); }
    catch (e) { return ''; }
  }
  function hue(str) { var h = 0; for (var i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) % 360; return h; }
  function avaStyle(name) { var h = hue(name); return 'background:linear-gradient(135deg,hsl(' + h + ',72%,55%),hsl(' + ((h + 45) % 360) + ',72%,42%))'; }
  function initials(name) { return name.replace(/[^A-Za-z0-9]/g, '').slice(0, 2).toUpperCase() || '??'; }
  var soundOn = localStorage.getItem('pcSound') !== '0';
  var ICON = '/favicons/android-chrome-192x192.png';
  var notifOn = function () { return 'Notification' in window && Notification.permission === 'granted' && localStorage.getItem('pcNotif') !== '0'; };
  var swReg = null;
  function regSW() {
    if ('serviceWorker' in window.navigator) {
      navigator.serviceWorker.register('/sw-notify.js').then(function (r) { swReg = r; }).catch(function () {});
      navigator.serviceWorker.addEventListener('message', function (e) {
        if (e.data && e.data.type === 'pterochat:open') open();
      });
    }
  }
  function notifyMsg(m) {
    if (!notifOn() || !st.my) return;
    var me = m.mentions && m.mentions.indexOf(st.my.id) >= 0;
    var title = me ? '✨ ' + m.user.username + ' nyebut lu' : '💬 ' + m.user.username;
    var body = m.deleted ? 'pesan dihapus' : String(m.body).replace(/\n/g, ' ').slice(0, 90);
    try {
      var opts = { body: body, icon: ICON, badge: ICON, tag: 'pterochat' + (me ? '-m' : '') };
      if (swReg && swReg.showNotification) swReg.showNotification(title, opts);
    } catch (e) {}
  }
  function nbtnState() {
    if (!els.nbtn) return;
    var on = notifOn();
    els.nbtn.textContent = on ? '🔔' : '🔕';
    els.nbtn.classList.toggle('off', !on);
  }
  function hidePerm() { if (els.perm) els.perm.classList.remove('show'); }
  function askNotif() {
    if (!('Notification' in window)) { toast('Browser ga dukung notifikasi'); return; }
    if (Notification.permission === 'denied') { toast('🚫 Browser udah ngeblock — aktifin di setelan situs'); return; }
    Notification.requestPermission().then(function (p) {
      if (p === 'granted') { localStorage.setItem('pcNotif', '1'); nbtnState(); toast('🔔 Notifikasi aktif!'); }
      else toast('Belum keaktif (' + p + ')');
      hidePerm();
    });
  }
  var actx = null;
  function beep(freqs) {
    if (!soundOn) return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext())();
      var t = actx.currentTime;
      freqs.forEach(function (f, i) {
        var o = actx.createOscillator(), g = actx.createGain();
        o.frequency.value = f; o.type = 'sine';
        g.gain.setValueAtTime(0.0001, t + i * 0.09);
        g.gain.exponentialRampToValueAtTime(0.07, t + i * 0.09 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.09 + 0.12);
        o.connect(g); g.connect(actx.destination);
        o.start(t + i * 0.09); o.stop(t + i * 0.09 + 0.14);
      });
    } catch (e) {}
  }
  function errMsg(j) {
    if (!j) return '';
    if (j.error) return j.error;
    // Pterodactyl API style: errors = [{ code, status, detail }]
    if (Array.isArray(j.errors) && j.errors.length) {
      return j.errors[0].detail || j.errors[0].message || '';
    }
    if (j.errors) {
      var k = Object.keys(j.errors)[0];
      if (k && j.errors[k] && j.errors[k][0]) return j.errors[k][0];
    }
    return j.message || '';
  }
  function toast(msg) {
    if (!els.toast) return;
    els.toast.textContent = msg;
    els.toast.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { els.toast.classList.remove('show'); }, 2600);
  }
  function badge() {
    if (window.PteroOrb) window.PteroOrb.setBadge(st.unread, st.mention);
  }

  // ============ build ============
  function build() {
    if (document.getElementById('chat-win')) { bindRefs(); return; }
    var win = document.createElement('div');
    win.id = 'chat-win';
    win.innerHTML =
      '<div class="cm-head"><span class="cm-dot"></span>Chat Room<span class="cm-online">…</span>' +
      '<span class="cm-tools"><button class="cm-tool" id="cmNotif" title="Notifikasi browser">🔕</button><button class="cm-tool" id="cmSound" title="Suara">🔊</button><button class="cm-tool" id="cmClose" title="Tutup">✕</button></span></div>' +
      '<div class="cm-perm" id="cmPerm">🔔 Nyalakan notifikasi chat biar ga ketinggalan pesan? <button id="cmPermYes">Nyalakan</button><button id="cmPermNo">Nanti</button></div>' +
      '<div class="cm-banner" id="cmBanner"></div>' +
      '<div class="cm-list" id="cmList"></div>' +
      '<button class="cm-newbtn" id="cmNew">↓ pesan baru</button>' +
      '<div class="cm-atlist" id="cmAt"></div>' +
      '<div class="cm-inputrow"><span class="cm-count" id="cmCount"></span>' +
      '<textarea id="cmInput" rows="1" maxlength="2000" placeholder="Ketik pesan… (@ buat mention)"></textarea>' +
      '<button class="cm-send" id="cmSend" title="Kirim"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M2 21l20-9L2 3v7l15 2-15 2z"/></svg></button></div>' +
      '<div class="cm-toast" id="cmToast"></div>';
    document.body.appendChild(win);
    bindRefs();

    els.close.addEventListener('click', close);
    els.sound.addEventListener('click', function () {
      soundOn = !soundOn; localStorage.setItem('pcSound', soundOn ? '1' : '0');
      els.sound.classList.toggle('off', !soundOn);
      els.sound.textContent = soundOn ? '🔊' : '🔇';
    });
    els.sound.classList.toggle('off', !soundOn);
    els.sound.textContent = soundOn ? '🔊' : '🔇';
    els.nbtn.addEventListener('click', askNotif);
    els.permYes.addEventListener('click', askNotif);
    els.permNo.addEventListener('click', function () { localStorage.setItem('pcNotifHint', '1'); hidePerm(); });
    nbtnState();

    els.send.addEventListener('click', send);
    els.input.addEventListener('keydown', function (e) {
      if (atList.open) {
        if (e.key === 'ArrowDown') { atList.move(1); e.preventDefault(); return; }
        if (e.key === 'ArrowUp') { atList.move(-1); e.preventDefault(); return; }
        if (e.key === 'Enter' && atList.sel >= 0) { atList.pick(atList.sel); e.preventDefault(); return; }
        if (e.key === 'Escape') { atList.close(); return; }
      }
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
    });
    els.input.addEventListener('input', function () {
      autosize(); counter(); atCheck();
    });
    els.list.addEventListener('scroll', function () {
      if (els.list.scrollTop < 45) loadOlder();
      if (nearBottom()) hideNew();
    });
    els.newbtn.addEventListener('click', function () { scrollTopopBottom(); });
    document.addEventListener('click', function (e) {
      if (!e.target.closest || !e.target.closest('.cm-mute-pop')) {
        Array.prototype.forEach.call(document.querySelectorAll('.cm-mute-pop.show, .cm-reactbar.show'), function (p) { p.classList.remove('show'); });
      }
      if (!e.target.closest('#cmAt') && !e.target.closest('#cmInput')) atList.close();
    });
  }
  function bindRefs() {
    els.win = document.getElementById('chat-win');
    els.online = els.win.querySelector('.cm-online');
    els.list = document.getElementById('cmList');
    els.input = document.getElementById('cmInput');
    els.send = document.getElementById('cmSend');
    els.banner = document.getElementById('cmBanner');
    els.count = document.getElementById('cmCount');
    els.at = document.getElementById('cmAt');
    els.newbtn = document.getElementById('cmNew');
    els.toast = document.getElementById('cmToast');
    els.close = document.getElementById('cmClose');
    els.sound = document.getElementById('cmSound');
    els.nbtn = document.getElementById('cmNotif');
    els.perm = document.getElementById('cmPerm');
    els.permYes = document.getElementById('cmPermYes');
    els.permNo = document.getElementById('cmPermNo');
    nbtnState();
  }
  function autosize() {
    els.input.style.height = 'auto';
    els.input.style.height = Math.min(els.input.scrollHeight, 100) + 'px';
  }
  function counter() {
    var n = els.input.value.length;
    els.count.textContent = n + '/2000';
    els.count.classList.toggle('show', n > 1900);
  }
  function nearBottom() {
    return els.list.scrollHeight - els.list.scrollTop - els.list.clientHeight < 70;
  }
  function scrollTopopBottom() {
    els.list.scrollTop = els.list.scrollHeight;
    hideNew();
  }
  function hideNew() { st.newCount = 0; els.newbtn.classList.remove('show'); }

  // ============ render ============
  function mentionize(body, myId) {
    return esc(body).replace(/@([A-Za-z0-9._\-]{2,24})/g, function (all, u) {
      return '<span class="mention' + (st.my && u === st.my.username ? ' me-mention' : '') + '">' + all + '</span>';
    });
  }
  function renderMsg(m, prepend) {
    var row = document.createElement('div');
    row.className = 'cm-row' + (st.my && m.user.id === st.my.id ? ' me' : '') +
      (st.my && m.mentions && m.mentions.indexOf(st.my.id) >= 0 ? ' at-me' : '');
    row.dataset.id = m.id;
    row.dataset.uid = m.user.id;
    var acts = '';
    if (!m.deleted) {
      acts += '<button class="cm-act rbtn" title="Reaksi">😊+</button>';
      if (m.can_mute) acts += '<button class="cm-act mbtn' + (m.user.muted ? ' muted' : '') + '" title="Mute user">' + (m.user.muted ? '🔇' : '🔇') + '</button>';
      if (m.can_delete) acts += '<button class="cm-act danger dbtn" title="Hapus">✕</button>';
    }
    row.innerHTML =
      '<div class="cm-ava" style="' + avaStyle(m.user.username) + '">' + esc(initials(m.user.username)) + '</div>' +
      '<div class="cm-msg">' +
      '<div class="cm-meta"><span class="cm-name">' + esc(m.user.username) + '</span>' +
      (m.user.admin ? '<span class="cm-admin">ADMIN</span>' : '') +
      (m.user.muted ? '<span class="cm-muted-ico" title="lagi di-mute">🔇</span>' : '') +
      '<span>' + wib(m.created_at) + '</span></div>' +
      '<div class="cm-bubble' + (m.deleted ? ' cm-deleted' : '') + '">' + (m.deleted ? '🗑 pesan dihapus' : mentionize(m.body)) + '</div>' +
      (acts ? '<div class="cm-acts">' + acts + '</div>' : '') +
      '<div class="cm-reactbar">' + REACTIONS.map(function (r) { return '<button data-e="' + r + '">' + r + '</button>'; }).join('') + '</div>' +
      '<div class="cm-reacts"></div>' +
      (m.can_mute && !m.deleted ? '<div class="cm-mute-pop"><button data-m="10">10m</button><button data-m="60">1j</button><button data-m="1440">24j</button>' + (m.user.muted ? '<button class="un" data-m="0">unmute</button>' : '') + '</div>' : '') +
      '</div>';
    renderReacts(row, m.reactions || {});
    if (prepend) els.list.insertBefore(row, els.list.firstChild);
    else els.list.appendChild(row);
    wireRow(row, m);
    return row;
  }
  function renderReacts(row, agg) {
    var box = row.querySelector('.cm-reacts');
    if (!box) return;
    box.innerHTML = Object.keys(agg).map(function (e) {
      return '<span class="rpill' + (agg[e].mine ? ' mine' : '') + '" data-e="' + e + '">' + e + ' ' + agg[e].c + '</span>';
    }).join('');
    Array.prototype.forEach.call(box.querySelectorAll('.rpill'), function (p) {
      p.addEventListener('click', function (e) { e.stopPropagation(); doReact(row.dataset.id, p.dataset.e); });
    });
  }
  function wireRow(row, m) {
    var rb = row.querySelector('.rbtn');
    if (rb) rb.addEventListener('click', function (e) {
      e.stopPropagation();
      var bar = row.querySelector('.cm-reactbar');
      var was = bar.classList.contains('show');
      Array.prototype.forEach.call(document.querySelectorAll('.cm-reactbar.show'), function (p) { p.classList.remove('show'); });
      if (!was) bar.classList.add('show');
    });
    Array.prototype.forEach.call(row.querySelectorAll('.cm-reactbar button'), function (b) {
      b.addEventListener('click', function (e) { e.stopPropagation(); barHide(row); doReact(row.dataset.id, b.dataset.e); });
    });
    var db = row.querySelector('.dbtn');
    if (db) db.addEventListener('click', function (e) {
      e.stopPropagation();
      if (!confirm('Hapus pesan ini?')) return;
      api(API + '/messages/' + row.dataset.id, 'DELETE').then(function (r) {
        if (r.ok) {
          var b = row.querySelector('.cm-bubble');
          b.classList.add('cm-deleted'); b.innerHTML = '🗑 pesan dihapus';
          Array.prototype.forEach.call(row.querySelectorAll('.cm-acts,.cm-reacts,.cm-reactbar'), function (x) { x.remove(); });
        } else toast(errMsg(r.data) || 'Gagal hapus');
      });
    });
    var mb = row.querySelector('.mbtn');
    if (mb) mb.addEventListener('click', function (e) {
      e.stopPropagation();
      var pop = row.querySelector('.cm-mute-pop');
      if (!pop) return;
      pop.classList.toggle('show');
    });
    Array.prototype.forEach.call(row.querySelectorAll('.cm-mute-pop button'), function (b) {
      b.addEventListener('click', function (e) {
        e.stopPropagation();
        var mins = parseInt(b.dataset.m, 10), uid = row.dataset.uid;
        if (mins === 0) {
          api(API + '/mute/' + uid, 'DELETE').then(function (r) {
            if (r.ok) { toast('✅ unmute #' + uid); refreshFlags(); }
          });
        } else {
          api(API + '/mute/' + uid, 'POST', { minutes: mins }).then(function (r) {
            if (r.ok) { toast('🔇 User di-mute ' + (mins >= 1440 ? '24 jam' : mins >= 60 ? (mins / 60) + ' jam' : mins + ' menit')); refreshFlags(); }
            else toast(errMsg(r.data) || 'Gagal mute');
          });
        }
        Array.prototype.forEach.call(document.querySelectorAll('.cm-mute-pop.show'), function (p) { p.classList.remove('show'); });
      });
    });
  }
  function barHide(row) { var b = row.querySelector('.cm-reactbar'); if (b) b.classList.remove('show'); }
  function doReact(id, emoji) {
    api(API + '/messages/' + id + '/react', 'POST', { emoji: emoji }).then(function (r) {
      if (!r.ok) return;
      var row = els.list.querySelector('.cm-row[data-id="' + id + '"]');
      if (row) renderReacts(row, r.data.reactions);
    });
  }
  function refreshFlags() {
    api(API + '/messages?after=0').then(function (r) {
      if (!r.ok) return;
      st.my = r.data.my;
      banner(r.data.my);
      r.data.messages.forEach(function (m) {
        var row = els.list.querySelector('.cm-row[data-id="' + m.id + '"]');
        if (!row) return;
        var meta = row.querySelector('.cm-meta');
        var has = meta.querySelector('.cm-muted-ico');
        if (m.user.muted && !has) {
          var s = document.createElement('span'); s.className = 'cm-muted-ico'; s.title = 'lagi di-mute'; s.textContent = '🔇';
          meta.insertBefore(s, meta.lastElementChild);
        } else if (!m.user.muted && has) has.remove();
        renderReacts(row, m.reactions || {});
      });
    });
  }

  // rekonsiliasi ringan tiap ~30 detik: nangkep pesan yang dihapus / reaksi
  // yang berubah dari user lain (polling `after` cuma ngirim pesan baru).
  function reconcile() {
    api(API + '/messages').then(function (r) {
      if (!r.ok) return;
      st.my = r.data.my; banner(st.my);
      els.online.textContent = (r.data.online || 0) + ' online';
      var atB = nearBottom();
      r.data.messages.forEach(function (m) {
        if (m.id > st.lastId) st.lastId = m.id;
        var row = els.list.querySelector('.cm-row[data-id="' + m.id + '"]');
        if (!row) { renderMsg(m); return; }
        var meta = row.querySelector('.cm-meta');
        var has = meta.querySelector('.cm-muted-ico');
        if (m.user.muted && !has) {
          var s = document.createElement('span'); s.className = 'cm-muted-ico'; s.title = 'lagi di-mute'; s.textContent = '🔇';
          meta.insertBefore(s, meta.lastElementChild);
        } else if (!m.user.muted && has) has.remove();
        var b = row.querySelector('.cm-bubble');
        if (m.deleted && b && !b.classList.contains('cm-deleted')) {
          b.classList.add('cm-deleted'); b.innerHTML = '🗑 pesan dihapus';
          Array.prototype.forEach.call(row.querySelectorAll('.cm-acts,.cm-reacts,.cm-reactbar'), function (x) { x.remove(); });
        }
        renderReacts(row, m.reactions || {});
      });
      if (st.open && atB) scrollTopopBottom();
    }).catch(function () {});
  }

  // ============ data ============
  function banner(my) {
    if (my.muted_until && new Date(my.muted_until) > new Date()) {
      st.readonly = true;
      els.banner.textContent = '🔇 Kamu di-mute oleh admin sampai ' + wib(my.muted_until) + ' WIB';
      els.banner.classList.add('show');
      els.input.disabled = true; els.send.disabled = true;
      els.input.placeholder = 'Kamu sedang di-mute';
    } else if (!my.admin) {
      st.readonly = true;
      els.banner.textContent = '👀 Mode baca — cuma admin panel yang bisa kirim pesan';
      els.banner.classList.add('show');
      els.input.disabled = true; els.send.disabled = true;
      els.input.placeholder = 'Mode baca (read-only)';
    } else {
      st.readonly = false;
      els.banner.classList.remove('show');
      els.input.disabled = false; els.send.disabled = false;
      els.input.placeholder = 'Ketik pesan... (@ buat mention)';
    }
  }
  function applyNew(msgs, firstLoad) {
    if (!msgs.length) return;
    var atB = nearBottom() || firstLoad;
    msgs.forEach(function (m) {
      if (m.id > st.lastId) st.lastId = m.id;
      var existing = els.list.querySelector('.cm-row[data-id="' + m.id + '"]');
      if (existing) { renderReacts(existing, m.reactions || {}); return; }
      if (!st.open) {
        if (m.user.id !== (st.my && st.my.id)) {
          st.unread++;
          if (m.mentions && st.my && m.mentions.indexOf(st.my.id) >= 0) st.mention = true;
          if (!document.hidden) beep(m.mentions && st.my && m.mentions.indexOf(st.my.id) >= 0 ? [660, 990] : [880]);
          if (document.hidden || !document.hasFocus()) notifyMsg(m);
          badge();
        }
        return;
      }
      renderMsg(m);
      if (m.user.id !== st.my.id && !document.hidden) beep(m.mentions && m.mentions.indexOf(st.my.id) >= 0 ? [660, 990] : [880]);
      if (m.user.id !== st.my.id && document.hidden) notifyMsg(m);
      if (firstLoad) return;
      if (!atB && m.user.id !== st.my.id) {
        st.newCount++;
        els.newbtn.textContent = '↓ ' + st.newCount + ' pesan baru';
        els.newbtn.classList.add('show');
      }
    });
    if (st.open && atB) scrollTopopBottom();
  }
  function openLatest() {
    api(API + '/messages').then(function (r) {
      if (!r.ok) return;
      st.my = r.data.my; banner(st.my);
      els.online.textContent = (r.data.online || 0) + ' online';
      els.list.innerHTML = '';
      st.lastId = 0;
      st.oldestId = null;
      if (!r.data.messages.length) {
        els.list.innerHTML = '<div class="cm-empty">Belum ada pesan. Ngobrol dong! 💬</div>';
      } else {
        r.data.messages.forEach(function (m) {
          if (m.id > st.lastId) st.lastId = m.id;
          renderMsg(m);
        });
        st.oldestId = r.data.messages[0].id;
        if (r.data.messages.length < 50) st.oldestId = null;
      }
      scrollTopopBottom();
    });
  }
  function poll() {
    st.ticks++;
    if (!st.open && st.ticks % CLOSED_EVERY !== 0) return;
    // tab di background TETAP polling (buat notif), cuma diperlambat kalau chat kebuka
    if (document.hidden && st.open && st.ticks % 2 !== 0) return;
    // tiap ~30 detik pas chat kebuka, sync ulang biar hapus/reaksi dari user lain ikut
    if (st.open && st.ticks % 12 === 0) reconcile();
    api(API + '/messages?after=' + st.lastId).then(function (r) {
      if (!r.ok) return;
      st.my = r.data.my; banner(st.my);
      els.online.textContent = (r.data.online || 0) + ' online';
      applyNew(r.data.messages, false);
    }).catch(function () {});
  }
  function loadOlder() {
    if (!st.oldestId || st.loadingOld || !st.open) return;
    st.loadingOld = true;
    var prevH = els.list.scrollHeight, prevT = els.list.scrollTop;
    api(API + '/messages?before=' + st.oldestId).then(function (r) {
      st.loadingOld = false;
      if (!r.ok || !r.data.messages.length) { st.oldestId = null; return; }
      var empty = els.list.querySelector('.cm-empty'); if (empty) empty.remove();
      r.data.messages.forEach(function (m) {
        if (st.oldestId === null || m.id < st.oldestId) st.oldestId = m.id;
      });
      // prepend harus dari yang paling baru ke paling lama, biar urutan akhir tetap naik
      r.data.messages.slice().reverse().forEach(function (m) { renderMsg(m, true); });
      if (r.data.messages.length < 50) st.oldestId = null;
      els.list.scrollTop = els.list.scrollHeight - prevH + prevT;
    }).catch(function () { st.loadingOld = false; });
  }
  function send() {
    var body = els.input.value.trim();
    if (!body || st.sending) return;
    if (body.length > 2000) { toast('⚠️ Maksimal 2000 karakter (pesan lu ' + body.length + ')'); return; }
    if (st.readonly && !(st.my && st.my.muted_until && new Date(st.my.muted_until) > new Date())) { toast('👀 Cuma admin yang bisa kirim pesan'); return; }
    if (st.my && st.my.muted_until && new Date(st.my.muted_until) > new Date()) { toast('🔇 Kamu lagi di-mute'); return; }
    st.sending = true;
    api(API + '/messages', 'POST', { body: body }).then(function (r) {
      st.sending = false;
      if (r.ok) {
        els.input.value = ''; autosize(); counter(); atList.close();
        var emptyBox = els.list.querySelector('.cm-empty'); if (emptyBox) emptyBox.remove();
        renderMsg(r.data.message);
        if (r.data.message.id > st.lastId) st.lastId = r.data.message.id;
        scrollTopopBottom();
      } else {
        var err = errMsg(r.data);
        if (!err && r.status === 429) err = 'Terlalu banyak kirim — tunggu sebentar ya';
        if (!err && r.status === 419) err = 'Sesi kedaluwarsa — refresh halaman dulu';
        toast('⚠️ ' + (err || 'Gagal kirim'));
      }
    }).catch(function () { st.sending = false; toast('⚠️ Koneksi error'); });
  }

  // ============ @mention autocomplete ============
  var atList = {
    open: false, sel: -1, items: [], tokenStart: -1,
    close: function () { this.open = false; this.sel = -1; clearTimeout(atCheck._t); els.at.classList.remove('show'); }
  };
  function atCheck() {
    if (!st.open) return;
    var v = els.input.value, pos = els.input.selectionStart || 0;
    var before = v.slice(0, pos);
    var m = before.match(/(^|\s)@([A-Za-z0-9._\-]{1,24})$/);
    if (!m) { atList.close(); return; }
    var q = m[2];
    // debounce: jangan nembak API tiap ketikan (throttle 30/menit gampang kena)
    clearTimeout(atCheck._t);
    atCheck._t = setTimeout(function () {
      api(API + '/users?q=' + encodeURIComponent(q)).then(function (r) {
        if (!r.ok || !r.data.users || !r.data.users.length) { atList.close(); return; }
        atList.items = r.data.users;
        atList.tokenStart = pos - 1 - q.length; // posisi '@'
        atList.sel = -1; atList.open = true;
        els.at.innerHTML = r.data.users.map(function (u, i) {
          return '<div data-i="' + i + '"><b>@' + esc(u.username) + '</b>' + (st.my && u.id === st.my.id ? ' (kamu)' : '') + '</div>';
        }).join('');
        Array.prototype.forEach.call(els.at.querySelectorAll('div'), function (d) {
          d.addEventListener('mousedown', function (e) { e.preventDefault(); atList.pick(parseInt(d.dataset.i, 10)); });
        });
        els.at.classList.add('show');
      });
    }, 180);
  }
  atList.move = function (dir) {
    this.sel = Math.max(-1, Math.min(this.items.length - 1, this.sel + dir));
    Array.prototype.forEach.call(els.at.querySelectorAll('div'), function (d, i) { d.classList.toggle('sel', i === atList.sel); });
  };
  atList.pick = function (i) {
    var u = this.items[i]; if (!u) return;
    var v = els.input.value, pos = els.input.selectionStart || 0;
    var before = v.slice(0, this.tokenStart), after = v.slice(pos);
    var insert = '@' + u.username + ' ';
    els.input.value = before + insert + after;
    var np = (before + insert).length;
    els.input.setSelectionRange(np, np);
    this.close();
    els.input.focus();
  };

  // ============ open/close ============
  function open() {
    build();
    if (window.PteroOrb) { window.PteroOrb.closeMusic(); window.PteroOrb.closeMenu(); }
    st.open = true;
    els.win.classList.add('open');
    st.unread = 0; st.mention = false; badge();
    openLatest();
    if ('Notification' in window && Notification.permission === 'default' && !localStorage.getItem('pcNotifHint') && els.perm) els.perm.classList.add('show');
    if (!('ontouchstart' in window)) setTimeout(function () { els.input.focus(); }, 250);
  }
  function close() {
    st.open = false;
    if (els.win) els.win.classList.remove('open');
    atList.open && atList.close();
  }
  function toggle() { st.open ? close() : open(); }

  window.PteroChat = {
    __built: true,
    toggle: toggle,
    open: open,
    close: function () { if (st.open) close(); }
  };

  // ============ start ============
  function init() {
    build();
    regSW();
    // klik notif pas tab belum ada → SW buka /?chat=1 → auto buka chat
    if (/[?&]chat=1/.test(location.search)) {
      try { history.replaceState(null, '', location.pathname); } catch (e) {}
      setTimeout(open, 400);
    }
    // ambil identitas + lastId awal (buat unread pas ketutup)
    api(API + '/messages?after=0').then(function (r) {
      if (!r.ok) return;
      st.my = r.data.my;
      banner(st.my);
      els.online.textContent = (r.data.online || 0) + ' online';
      r.data.messages.forEach(function (m) { if (m.id > st.lastId) st.lastId = m.id; });
    }).catch(function () {});
    setInterval(poll, TICK);
    window.addEventListener('focus', function () { if (st.open) reconcile(); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
