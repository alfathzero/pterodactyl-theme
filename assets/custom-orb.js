// Spotify-style floating orb player (custom MP3 playlist, localStorage)
(function () {
  var LS_PL = 'spotPlaylist', LS_IDX = 'spotIndex';
  var ICON_LOGO = '<svg viewBox="0 0 24 24" fill="#07110b"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.6 0 12 0zm5.5 17.3c-.2.4-.7.5-1 .3-2.9-1.8-6.5-2.2-10.8-1.2-.4.1-.8-.1-.9-.5-.1-.4.1-.8.5-.9 4.6-1 8.6-.6 11.9 1.4.3.2.4.7.3 1zm1.5-3.9c-.3.5-.8.6-1.2.4-3.3-2-8.3-2.6-12.2-1.4-.5.1-1-.1-1.2-.6-.1-.5.1-1 .6-1.2 4.4-1.3 10-.7 13.8 1.6.4.2.6.8.2 1.2zm.1-4C15.7 9 8.2 8.8 4.2 10c-.6.2-1.3-.2-1.4-.8-.2-.6.2-1.3.8-1.4 4.6-1.4 13-1.1 17.5 1.6.5.4.7 1.1.3 1.6-.4.5-1.1.6-1.8.4z"/></svg>';
  var IC = {
    prev: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 5h2v14H6zm12 0v14l-9-7z"/></svg>',
    next: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M16 5h2v14h-2zM6 5l9 7-9 7z"/></svg>',
    play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5v15l13-7.5z"/></svg>',
    pause: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 5h4v14H6zm8 0h4v14h-4z"/></svg>',
    stop: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h12v12H6z"/></svg>'
  };
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fmt(t) { t = Math.max(0, Math.floor(t || 0)); return Math.floor(t / 60) + ':' + ('0' + (t % 60)).slice(-2); }
  function load(pl, ix) { try { return { pl: JSON.parse(localStorage.getItem(LS_PL)) || [], ix: parseInt(localStorage.getItem(LS_IDX) || '-1', 10) }; } catch (e) { return { pl: [], ix: -1 }; } }
  function save() { try { localStorage.setItem(LS_PL, JSON.stringify(S.pl)); localStorage.setItem(LS_IDX, String(S.ix)); } catch (e) {} }

  var S = { tracks: [], ix: -1, open: false };
  var d = load(); S.tracks = d.pl; S.ix = d.ix;
  var audio = new Audio(); audio.volume = 0.9;
  var orb, panel, titleEl, subEl, fillEl, knobEl, tCur, tTot, playBtn, listEl, urlIn, nameIn;

  function build() {
    if (document.getElementById('spot-orb')) return;
    orb = document.createElement('div'); orb.id = 'spot-orb'; orb.innerHTML = ICON_LOGO;
    panel = document.createElement('div'); panel.id = 'spot-panel';
    panel.innerHTML =
      '<div class="spot-title" id="spotTitle">Nggak ada lagu</div>' +
      '<div class="spot-sub" id="spotSub">tambahin lagu dulu di bawah 👇</div>' +
      '<div class="spot-bar" id="spotBar"><div class="rail"><div class="fill" id="spotFill"></div><div class="knob" id="spotKnob"></div></div></div>' +
      '<div class="spot-time"><span id="spotCur">0:00</span><span id="spotTot">0:00</span></div>' +
      '<div class="spot-ctrls">' +
      '<button class="spot-btn" id="spotPrev" title="Sebelumnya">' + IC.prev + '</button>' +
      '<button class="spot-btn" id="spotStop" title="Stop">' + IC.stop + '</button>' +
      '<button class="spot-btn big" id="spotPlay" title="Play/Pause">' + IC.play + '</button>' +
      '<button class="spot-btn" id="spotNext" title="Selanjutnya">' + IC.next + '</button>' +
      '</div>' +
      '<div class="spot-list" id="spotList"></div>' +
      '<div class="spot-add"><input class="u" id="spotUrl" placeholder="Link MP3…" inputmode="url"><input class="nm" id="spotNm" placeholder="Judul"><button id="spotAdd">＋</button></div>';
    document.body.appendChild(orb);
    document.body.appendChild(panel);
    titleEl = document.getElementById('spotTitle'); subEl = document.getElementById('spotSub');
    fillEl = document.getElementById('spotFill'); knobEl = document.getElementById('spotKnob');
    tCur = document.getElementById('spotCur'); tTot = document.getElementById('spotTot');
    playBtn = document.getElementById('spotPlay'); listEl = document.getElementById('spotList');
    urlIn = document.getElementById('spotUrl'); nameIn = document.getElementById('spotNm');

    orb.addEventListener('click', function () { S.open = !S.open; panel.classList.toggle('open', S.open); renderList(); });
    playBtn.addEventListener('click', toggle);
    document.getElementById('spotStop').addEventListener('click', stop);
    document.getElementById('spotNext').addEventListener('click', function () { jump(1); });
    document.getElementById('spotPrev').addEventListener('click', function () { jump(-1); });
    document.getElementById('spotAdd').addEventListener('click', addTrack);
    nameIn.addEventListener('keydown', function (e) { if (e.key === 'Enter') addTrack(); });
    urlIn.addEventListener('keydown', function (e) { if (e.key === 'Enter') nameIn.focus(); });

    var bar = document.getElementById('spotBar'), seekDown = false;
    function seekAt(cx) {
      var r = bar.getBoundingClientRect();
      var p = Math.max(0, Math.min(1, (cx - r.left) / r.width));
      if (audio.duration) { audio.currentTime = p * audio.duration; paint(); }
    }
    bar.addEventListener('pointerdown', function (e) { seekDown = true; seekAt(e.clientX); try { bar.setPointerCapture(e.pointerId); } catch (x) {} });
    bar.addEventListener('pointermove', function (e) { if (seekDown) seekAt(e.clientX); });
    bar.addEventListener('pointerup', function () { seekDown = false; });

    audio.addEventListener('timeupdate', paint);
    audio.addEventListener('ended', function () { jump(1); });
    audio.addEventListener('play', iconState);
    audio.addEventListener('pause', iconState);
    audio.addEventListener('error', function () { titleEl.textContent = '⚠️ Gagal muter lagu'; });

    paint(); renderList();
  }

  function cur() { return S.tracks[S.ix]; }
  function paint() {
    var t = cur();
    titleEl.textContent = t ? t.n : 'Nggak ada lagu';
    subEl.textContent = t ? t.u.replace(/^https?:\/\//, '').slice(0, 46) : (S.tracks.length ? 'pilih lagu dari playlist 👇' : 'tambahin lagu dulu di bawah 👇');
    var p = audio.duration ? (audio.currentTime / audio.duration) * 100 : 0;
    fillEl.style.width = p + '%'; knobEl.style.left = p + '%';
    tCur.textContent = fmt(audio.currentTime); tTot.textContent = fmt(audio.duration);
    iconState();
  }
  function iconState() {
    var playing = !audio.paused && !audio.ended && audio.src;
    playBtn.innerHTML = playing ? IC.pause : IC.play;
    if (orb) orb.classList.toggle('playing', !!playing);
  }
  function loadTrack(i, autoplay) {
    if (!S.tracks.length) return;
    S.ix = ((i % S.tracks.length) + S.tracks.length) % S.tracks.length;
    audio.src = S.tracks[S.ix].u;
    save(); paint(); renderList();
    if (autoplay !== false) audio.play().catch(function () {});
  }
  function toggle() {
    if (!S.tracks.length) return;
    if (!audio.src || audio.ended) { loadTrack(S.ix < 0 ? 0 : S.ix, true); return; }
    if (audio.paused) audio.play().catch(function () {}); else audio.pause();
  }
  function stop() { audio.pause(); try { audio.currentTime = 0; } catch (e) {} paint(); }
  function jump(dir) { if (!S.tracks.length) return; loadTrack((S.ix < 0 ? 0 : S.ix) + dir, true); }
  function addTrack() {
    var u = (urlIn.value || '').trim(), n = (nameIn.value || '').trim();
    if (!u) { urlIn.focus(); return; }
    if (!/^https?:\/\//i.test(u) && !/^data:audio\//i.test(u)) u = 'https://' + u;
    S.tracks.push({ u: u, n: n || decodeURIComponent(u.split('/').pop().split('?')[0]) || 'Lagu ' + (S.tracks.length + 1) });
    save(); urlIn.value = ''; nameIn.value = '';
    if (S.ix < 0) loadTrack(S.tracks.length - 1, false);
    renderList(); paint();
  }
  function delTrack(i, ev) {
    ev.stopPropagation();
    S.tracks.splice(i, 1);
    if (S.ix === i) { audio.pause(); audio.removeAttribute('src'); S.ix = -1; }
    else if (i < S.ix) S.ix--;
    save(); renderList(); paint();
  }
  function renderList() {
    if (!listEl) return;
    if (!S.tracks.length) { listEl.innerHTML = '<div class="spot-empty">Playlist kosong 🎧</div>'; return; }
    listEl.innerHTML = S.tracks.map(function (t, i) {
      return '<div class="spot-item' + (i === S.ix ? ' cur' : '') + '" data-i="' + i + '"><span class="n">' + (i === S.ix && !audio.paused ? '🎵 ' : '') + esc(t.n) + '</span><span class="del" data-d="' + i + '">✕</span></div>';
    }).join('');
    Array.prototype.forEach.call(listEl.querySelectorAll('.spot-item'), function (row) {
      row.addEventListener('click', function () { loadTrack(parseInt(row.dataset.i, 10), true); });
    });
    Array.prototype.forEach.call(listEl.querySelectorAll('.del'), function (b) {
      b.addEventListener('click', function (e) { delTrack(parseInt(b.dataset.d, 10), e); });
    });
  }
  // re-render tick biar indikator 🎵 akurat tanpa event
  setInterval(function () { if (document.getElementById('spot-orb') && panel && panel.classList.contains('open')) renderList(); }, 2000);

  function init() { build(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
