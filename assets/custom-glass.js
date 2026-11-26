// Glassmorphism background layers (pterodactyl-theme)
// Dekoratif doang: blob gradient, grain, pointer glow. Ga nyentuh React.
(function () {
  'use strict';

  if (document.getElementById('gl-bg-layer')) return;

  var bg = document.createElement('div');
  bg.id = 'gl-bg-layer';
  bg.className = 'gl-bg';
  bg.setAttribute('aria-hidden', 'true');
  ['gl-b1', 'gl-b2', 'gl-b3'].forEach(function (c) {
    var b = document.createElement('span');
    b.className = 'gl-blob ' + c;
    bg.appendChild(b);
  });

  var spot = document.createElement('div');
  spot.className = 'gl-spot';
  spot.setAttribute('aria-hidden', 'true');

  function attach() {
    if (!document.body) return;
    document.body.appendChild(bg);
    document.body.appendChild(spot);
  }

  if (document.body) attach();
  else document.addEventListener('DOMContentLoaded', attach);

  var raf = 0;
  var mx = 50;
  var my = 30;
  document.addEventListener('mousemove', function (e) {
    mx = (e.clientX / window.innerWidth) * 100;
    my = (e.clientY / window.innerHeight) * 100;
    if (raf) return;
    raf = window.requestAnimationFrame(function () {
      raf = 0;
      spot.style.setProperty('--gl-mx', mx + '%');
      spot.style.setProperty('--gl-my', my + '%');
    });
  }, { passive: true });
})();
