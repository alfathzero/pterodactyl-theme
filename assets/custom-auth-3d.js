// Dotted 3D globe + tilt - vanilla canvas, no CDN
(function () {
  function init() {
    if (document.getElementById('bg3d')) document.getElementById('bg3d').remove();
    document.querySelectorAll('.orb').forEach(function (e) { e.remove(); });
    ['orb-1', 'orb-2', 'orb-3'].forEach(function (c) {
      var d = document.createElement('div');
      d.className = 'orb ' + c;
      document.body.appendChild(d);
    });

    var canvas = document.createElement('canvas');
    canvas.id = 'bg3d';
    document.body.prepend(canvas);
    var ctx = canvas.getContext('2d');
    var W, H, CX, CY, R;
    function resize() {
      W = canvas.width = window.innerWidth;
      H = canvas.height = window.innerHeight;
      CX = W * 0.5; CY = H * 0.52;
      R = Math.min(W, H) * 0.34;
    }
    resize();
    window.addEventListener('resize', resize);

    // fibonacci sphere dots
    var N = 850, pts = [];
    var golden = Math.PI * (3 - Math.sqrt(5));
    for (var i = 0; i < N; i++) {
      var y = 1 - (i / (N - 1)) * 2;
      var rad = Math.sqrt(1 - y * y);
      var th = golden * i;
      pts.push({ x: Math.cos(th) * rad, y: y, z: Math.sin(th) * rad, hue: 195 + Math.random() * 90 });
    }
    // faint background stars
    var stars = [];
    for (var s = 0; s < 140; s++) stars.push({ x: Math.random(), y: Math.random(), r: Math.random() * 1.4 + 0.3, tw: Math.random() * Math.PI * 2 });

    var lon = 0, lat = 0.42, vLon = 0.006, tLon = 0, tLat = 0;
    var satA = 0, satB = 2.4; // orbit satellites
    var mouse = { x: 0, y: 0 }, dragging = false, px = 0, py = 0;
    var ripples = []; // screen-space touch rings {x,y,start}
    var pulses = []; // globe shockwaves {x,y,start}
    document.addEventListener('mousemove', function (e) {
      mouse.x = (e.clientX / window.innerWidth - 0.5) * 2;
      mouse.y = (e.clientY / window.innerHeight - 0.5) * 2;
      if (dragging) {
        lon += (e.clientX - px) * 0.005; lat += (e.clientY - py) * 0.003;
        lat = Math.max(-1.1, Math.min(1.1, lat));
        px = e.clientX; py = e.clientY;
      }
      var card = document.querySelector('#app form > div');
      if (card) card.style.transform = 'rotateX(' + (-mouse.y * 10).toFixed(2) + 'deg) rotateY(' + (mouse.x * 14).toFixed(2) + 'deg)';
    });
    document.addEventListener('mousedown', function (e) { dragging = true; px = e.clientX; py = e.clientY; touchAt(e.clientX, e.clientY); });
    document.addEventListener('mouseup', function () { dragging = false; });
    function touchAt(x, y) {
      var now = performance.now();
      ripples.push({ x: x, y: y, start: now });
      pulses.push({ x: x, y: y, start: now });
      if (ripples.length > 12) ripples.shift();
      if (pulses.length > 6) pulses.shift();
      vLon += 0.004; // little spin kick
      mouse.x = (x / window.innerWidth - 0.5) * 2;
      mouse.y = (y / window.innerHeight - 0.5) * 2;
      var card = document.querySelector('#app form > div');
      if (card) card.style.transform = 'rotateX(' + (-mouse.y * 10).toFixed(2) + 'deg) rotateY(' + (mouse.x * 14).toFixed(2) + 'deg)';
    }
    document.addEventListener('touchstart', function (e) {
      var t = e.touches[0];
      if (t) touchAt(t.clientX, t.clientY);
    }, { passive: true });
    document.addEventListener('touchmove', function (e) {
      var t = e.touches[0];
      if (!t) return;
      mouse.x = (t.clientX / window.innerWidth - 0.5) * 2;
      mouse.y = (t.clientY / window.innerHeight - 0.5) * 2;
      lon += 0.008;
      var card = document.querySelector('#app form > div');
      if (card) card.style.transform = 'rotateX(' + (-mouse.y * 10).toFixed(2) + 'deg) rotateY(' + (mouse.x * 14).toFixed(2) + 'deg)';
    }, { passive: true });

    var t = 0;
    function draw() {
      t += 0.016;
      vLon += (0.006 - vLon) * 0.02;
      satA += 0.012; satB += 0.009;
      if (!dragging) lon += vLon + Math.abs(mouse.x) * 0.002;
      tLon += ((mouse.x * 0.35) - tLon) * 0.04;
      tLat += ((mouse.y * 0.22) - tLat) * 0.04;
      var rotY = lon + tLon, rotX = lat + tLat;
      var cosY = Math.cos(rotY), sinY = Math.sin(rotY), cosX = Math.cos(rotX), sinX = Math.sin(rotX);

      ctx.clearRect(0, 0, W, H);
      // stars
      stars.forEach(function (st) {
        var a = 0.25 + 0.55 * Math.abs(Math.sin(t * 1.4 + st.tw));
        ctx.beginPath();
        ctx.arc(st.x * W, st.y * H, st.r, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(180,210,255,' + a.toFixed(2) + ')';
        ctx.fill();
      });

      var gx = CX + mouse.x * -18, gy = CY + mouse.y * -14;
      // halo
      var halo = ctx.createRadialGradient(gx, gy, R * 0.6, gx, gy, R * 1.7);
      halo.addColorStop(0, 'rgba(80,120,255,0.10)');
      halo.addColorStop(0.6, 'rgba(150,80,255,0.10)');
      halo.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.beginPath(); ctx.arc(gx, gy, R * 1.7, 0, Math.PI * 2); ctx.fillStyle = halo; ctx.fill();
      // outer ring
      ctx.beginPath(); ctx.arc(gx, gy, R * 1.02, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(120,170,255,0.28)'; ctx.lineWidth = 1.2; ctx.stroke();

      // two orbit rings like reference (crossing)
      ctx.beginPath();
      ctx.ellipse(gx, gy, R * 1.35, R * 0.42, -0.35, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(120,200,255,0.35)'; ctx.lineWidth = 1.4; ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(gx, gy, R * 1.35, R * 0.42, 0.5, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(190,140,255,0.32)'; ctx.lineWidth = 1.4; ctx.stroke();
      // traveling satellites on each ring
      [['#7cc4ff', -0.35, satA], ['#d3a6ff', 0.5, satB]].forEach(function (o) {
        var ox = Math.cos(o[2]) * R * 1.35, oy = Math.sin(o[2]) * R * 0.42;
        var rx = ox * Math.cos(o[1]) - oy * Math.sin(o[1]), ry = ox * Math.sin(o[1]) + oy * Math.cos(o[1]);
        var sx = gx + rx, sy = gy + ry;
        ctx.beginPath(); ctx.arc(sx, sy, 4, 0, Math.PI * 2);
        ctx.fillStyle = o[0]; ctx.shadowBlur = 16; ctx.shadowColor = o[0]; ctx.fill(); ctx.shadowBlur = 0;
        ctx.beginPath(); ctx.arc(sx, sy, 8, 0, Math.PI * 2);
        ctx.strokeStyle = o[0]; ctx.globalAlpha = 0.5; ctx.stroke(); ctx.globalAlpha = 1;
      });

      var now = performance.now();
      // touch ripples (screen space rings)
      ripples = ripples.filter(function (r) { return now - r.start < 900; });
      ripples.forEach(function (r) {
        var age = (now - r.start) / 900;
        var rad = 10 + age * 130;
        ctx.beginPath(); ctx.arc(r.x, r.y, rad, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(140,200,255,' + (0.7 * (1 - age)).toFixed(2) + ')';
        ctx.lineWidth = 2.5 * (1 - age) + 0.5; ctx.stroke();
        ctx.beginPath(); ctx.arc(r.x, r.y, rad * 0.55, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(200,140,255,' + (0.5 * (1 - age)).toFixed(2) + ')';
        ctx.lineWidth = 1.5; ctx.stroke();
        ctx.beginPath(); ctx.arc(r.x, r.y, 6 * (1 - age) + 2, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,' + (0.9 * (1 - age)).toFixed(2) + ')';
        ctx.fill();
      });
      pulses = pulses.filter(function (p) { return now - p.start < 1100; });

      pts.forEach(function (p, idx) {
        // rotate Y then X
        var x1 = p.x * cosY - p.z * sinY, z1 = p.x * sinY + p.z * cosY;
        var y1 = p.y * cosX - z1 * sinX, z2 = p.y * sinX + z1 * cosX;
        var persp = 2.6 / (2.6 + z2 * 0.9);
        var sx = gx + x1 * R * persp, sy = gy + y1 * R * persp;
        var front = (z2 + 1) / 2; // 0 back .. 1 front
        var boost = 0, push = 0;
        for (var k = 0; k < pulses.length; k++) {
          var pu = pulses[k];
          var page = (now - pu.start) / 1100;
          var dx = sx - pu.x, dy = sy - pu.y;
          var dist = Math.sqrt(dx * dx + dy * dy);
          var wave = page * Math.max(W, H) * 0.7;
          var band = Math.abs(dist - wave);
          if (band < 110) {
            var f = 1 - band / 110;
            push += f * 26 * (1 - page);
            boost += f * (1 - page);
            if (dist > 1) { sx += (dx / dist) * f * 22 * (1 - page); sy += (dy / dist) * f * 22 * (1 - page); }
          }
        }
        var size = 0.5 + front * 2.1 * persp + boost * 2.2 + Math.sin(t * 3 + idx * 1.7) * 0.4;
        ctx.beginPath();
        ctx.arc(sx, sy, size, 0, Math.PI * 2);
        ctx.fillStyle = 'hsla(' + p.hue + ',95%,' + Math.min(88, 42 + front * 30 + boost * 22).toFixed(0) + '%,' + Math.min(1, 0.12 + front * 0.85 + boost * 0.5).toFixed(2) + ')';
        if (front > 0.72 || boost > 0.15) { ctx.shadowBlur = 10 + boost * 14; ctx.shadowColor = 'hsla(' + p.hue + ',95%,65%,0.9)'; } else ctx.shadowBlur = 0;
        ctx.fill();
        ctx.shadowBlur = 0;
      });
      requestAnimationFrame(draw);
    }
    draw();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
