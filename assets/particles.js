/* ══════════════════════════════════════════════════════════════════
   DALA particle stage — three.js
   ~13k triangle sprites morph brain → cloud → lightbulb → globe →
   code mark → dust → brand mark. All morphing happens in the vertex shader:
   attributes hold shape A and shape B, a uniform mixes between them
   with a per-particle stagger and a scattered mid-path.
   ══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (typeof THREE === 'undefined') { window.DalaParticles = null; return; }

  var N = 16000;
  var TAU = Math.PI * 2;

  /* ── deterministic random ─────────────────────────────── */
  var seed = 1337;
  function rnd() { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }
  function rr(a, b) { return a + (b - a) * rnd(); }
  function pick(arr) { return arr[Math.floor(rnd() * arr.length)]; }

  /* value-noise for continents / gyri */
  function hash3(x, y, z) { var s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return s - Math.floor(s); }
  function noise3(x, y, z) {
    var xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    var xf = x - xi, yf = y - yi, zf = z - zi;
    var u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
    function l(a, b, t) { return a + (b - a) * t; }
    var c000 = hash3(xi, yi, zi), c100 = hash3(xi + 1, yi, zi), c010 = hash3(xi, yi + 1, zi), c110 = hash3(xi + 1, yi + 1, zi);
    var c001 = hash3(xi, yi, zi + 1), c101 = hash3(xi + 1, yi, zi + 1), c011 = hash3(xi, yi + 1, zi + 1), c111 = hash3(xi + 1, yi + 1, zi + 1);
    return l(l(l(c000, c100, u), l(c010, c110, u), v), l(l(c001, c101, u), l(c011, c111, u), v), w);
  }
  function fbm(x, y, z) { return 0.55 * noise3(x, y, z) + 0.28 * noise3(x * 2.1, y * 2.1, z * 2.1) + 0.17 * noise3(x * 4.3, y * 4.3, z * 4.3); }

  /* palette (linear-ish, brightened for additive blend) */
  var C = {
    white: [0.16, 0.10, 0.30], grey: [0.31, 0.24, 0.10], dim: [0.42, 0.33, 0.12],
    yellow: [0.54, 0.39, 0.02], violet: [0.38, 0.24, 0.80], lilac: [0.50, 0.34, 0.76],
    teal: [0.04, 0.40, 0.29], pink: [0.68, 0.16, 0.40], orange: [0.74, 0.34, 0.02]
  };

  function Shape() {
    this.pos = new Float32Array(N * 3);
    this.col = new Float32Array(N * 4);
    this.size = new Float32Array(N);
  }
  Shape.prototype.set = function (i, x, y, z, c, a, s) {
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.col[i * 4] = c[0]; this.col[i * 4 + 1] = c[1]; this.col[i * 4 + 2] = c[2]; this.col[i * 4 + 3] = a;
    this.size[i] = s;
  };

  function sphereDir() {
    var u = rnd() * 2 - 1, t = rnd() * TAU, r = Math.sqrt(1 - u * u);
    return [r * Math.cos(t), u, r * Math.sin(t)];
  }

  /* ── BRAIN ─────────────────────────────────────────────── */
  function makeBrain() {
    var S = new Shape();
    for (var i = 0; i < N; i++) {
      var k = rnd();
      var x, y, z, c, a, sz;
      if (k < 0.07) {
        /* brain stem — hangs out of the bottom, slightly back */
        var ang = rnd() * TAU, rad = 0.17 * Math.sqrt(rnd() * 0.5 + 0.5);
        y = -0.5 - rnd() * 0.65;
        x = Math.cos(ang) * rad * (1 - (y + 0.55) * 0.15);
        z = -0.25 + Math.sin(ang) * rad;
        c = rnd() < 0.7 ? C.grey : C.white; a = 0.75; sz = 0.9;
      } else if (k < 0.15) {
        /* cerebellum — a small ellipsoid tucked under the back */
        var d = sphereDir();
        x = d[0] * 0.55; y = -0.62 + d[1] * 0.3; z = -0.72 + d[2] * 0.42;
        c = rnd() < 0.5 ? C.yellow : C.grey; a = 0.8; sz = 0.9;
      } else {
        var d2 = sphereDir();
        var side = d2[0] < 0 ? -1 : 1;
        /* base ellipsoid, hemispheres pushed apart to make the fissure */
        var ux = d2[0], uy = d2[1], uz = d2[2];
        var g = fbm(ux * 3.2 + 7, uy * 3.2, uz * 3.2 + 3);
        var gyri = (g - 0.5) * 0.22;
        var fiss = 1 - 0.2 * Math.exp(-(ux * ux) / 0.008);
        var flat = uy < -0.35 ? 1 - (-0.35 - uy) * 0.55 : 1;
        var r = (1 + gyri) * fiss;
        x = ux * 1.0 * r + side * 0.04;
        y = uy * 0.86 * r * flat + 0.05;
        z = uz * 1.24 * r;
        if (rnd() < 0.08) { /* a little interior fill for depth */
          var f = 0.5 + rnd() * 0.45; x *= f; y *= f; z *= f;
        }
        var cc = rnd();
        if (uy < -0.05 && Math.abs(ux) > 0.55 && cc < 0.7) { c = C.yellow; }
        else if (uy > 0.35 && g > 0.56 && cc < 0.65) { c = rnd() < 0.5 ? C.violet : C.lilac; }
        else if (cc < 0.02) { c = C.teal; }
        else if (cc < 0.045) { c = C.pink; }
        else if (cc < 0.55) { c = C.white; }
        else { c = C.grey; }
        a = 0.85 + rnd() * 0.15; sz = 0.75 + rnd() * 0.6;
      }
      S.set(i, x, y, z, c, a, sz);
    }
    return S;
  }

  /* ── OPEN HAND: a hollow 3D particle outline for Home ── */
  function makeHand() {
    var S = new Shape();
    function tone() {
      var r = rnd();
      return r < 0.62 ? C.white : (r < 0.94 ? C.grey : C.teal);
    }
    function palmShell() {
      var d = sphereDir(), shell = 0.94 + rnd() * 0.12;
      return [d[0] * 0.53 * shell, -0.20 + d[1] * 0.66 * shell, d[2] * 0.24 * shell];
    }
    function tube(a, b, radius) {
      var t = rnd(), dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
      var len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
      var ax = dx / len, ay = dy / len, az = dz / len;
      var hx = Math.abs(ay) < 0.9 ? 0 : 1, hy = Math.abs(ay) < 0.9 ? 1 : 0;
      var nx = ay * 0 - az * hy, ny = az * hx - ax * 0, nz = ax * hy - ay * hx;
      var nl = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
      nx /= nl; ny /= nl; nz /= nl;
      var bx = ay * nz - az * ny, by = az * nx - ax * nz, bz = ax * ny - ay * nx;
      var ang = rnd() * TAU, r = radius * (0.92 + rnd() * 0.08);
      return [a[0] + dx * t + (nx * Math.cos(ang) + bx * Math.sin(ang)) * r,
        a[1] + dy * t + (ny * Math.cos(ang) + by * Math.sin(ang)) * r,
        a[2] + dz * t + (nz * Math.cos(ang) + bz * Math.sin(ang)) * r];
    }
    function pathSet(paths) {
      return paths.map(function (points) {
        var lengths = [], total = 0;
        for (var j = 0; j < points.length - 1; j++) {
          var dx = points[j + 1][0] - points[j][0], dy = points[j + 1][1] - points[j][1], dz = points[j + 1][2] - points[j][2];
          total += Math.sqrt(dx * dx + dy * dy + dz * dz);
          lengths.push(total);
        }
        return { points: points, lengths: lengths, total: total };
      });
    }
    function samplePath(set, radius) {
      var total = 0;
      for (var j = 0; j < set.length; j++) total += set[j].total;
      var pickAt = rnd() * total, chosen = set[set.length - 1];
      for (var k = 0; k < set.length; k++) {
        if (pickAt <= set[k].total) { chosen = set[k]; break; }
        pickAt -= set[k].total;
      }
      var along = rnd() * chosen.total, seg = 0;
      while (seg < chosen.lengths.length - 1 && along > chosen.lengths[seg]) seg++;
      var before = seg ? chosen.lengths[seg - 1] : 0;
      var span = chosen.lengths[seg] - before;
      var from = chosen.points[seg], to = chosen.points[seg + 1];
      var t = span ? (along - before) / span : 0;
      var center = [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t, from[2] + (to[2] - from[2]) * t];
      var point = tube(center, [center[0], center[1], center[2] + 0.001], radius);
      point[2] = center[2] + (rnd() < 0.5 ? -1 : 1) * radius * (0.9 + rnd() * 0.1);
      return point;
    }

    var palmFront = [
      [-0.47, 0.30, 0.20], [-0.39, 0.44, 0.20], [-0.24, 0.42, 0.20], [-0.12, 0.34, 0.20],
      [0.02, 0.36, 0.20], [0.17, 0.36, 0.20], [0.31, 0.30, 0.20], [0.46, 0.20, 0.20],
      [0.52, 0.03, 0.20], [0.49, -0.41, 0.20], [0.37, -0.64, 0.20], [0.31, -0.96, 0.20],
      [-0.31, -0.96, 0.20], [-0.37, -0.66, 0.20], [-0.52, -0.42, 0.20], [-0.55, -0.10, 0.20],
      [-0.49, 0.14, 0.20], [-0.47, 0.30, 0.20]
    ];
    var palmBack = palmFront.map(function (p) { return [p[0], p[1], -0.20]; });
    var palmRibs = [
      [[-0.30, 0.25, 0.21], [-0.27, -0.06, 0.23], [-0.22, -0.40, 0.22], [-0.18, -0.76, 0.20]],
      [[-0.06, 0.32, 0.21], [-0.04, -0.02, 0.24], [0.00, -0.38, 0.23], [0.04, -0.78, 0.20]],
      [[0.19, 0.29, 0.21], [0.18, -0.04, 0.24], [0.17, -0.38, 0.23], [0.18, -0.77, 0.20]],
      [[-0.36, -0.20, 0.22], [-0.12, -0.24, 0.24], [0.16, -0.21, 0.24], [0.40, -0.16, 0.21]],
      [[-0.30, -0.53, 0.22], [-0.05, -0.58, 0.24], [0.20, -0.54, 0.22]],
      [[-0.06, 0.28, -0.21], [-0.04, -0.06, -0.23], [0.00, -0.42, -0.23], [0.04, -0.78, -0.20]],
      [[-0.30, -0.20, -0.22], [-0.12, -0.24, -0.24], [0.16, -0.21, -0.24], [0.40, -0.16, -0.21]]
    ];
    var palmEdges = [palmFront, palmBack];
    [1, 4, 7, 9, 11, 13, 15].forEach(function (index) {
      palmEdges.push([palmFront[index], palmBack[index]]);
    });
    var fingers = [
      [[-0.34, 0.34, 0.02], [-0.38, 0.91, 0.06], [-0.37, 1.47, 0.08]],
      [[-0.12, 0.40, 0.02], [-0.13, 1.04, 0.08], [-0.11, 1.72, 0.10]],
      [[0.13, 0.39, 0.01], [0.15, 1.00, 0.08], [0.18, 1.58, 0.10]],
      [[0.37, 0.30, -0.02], [0.43, 0.83, 0.05], [0.48, 1.38, 0.08]]
    ];
    var thumb = [[-0.46, 0.10, 0.02], [-0.68, 0.27, 0.07], [-0.88, 0.50, 0.13], [-1.02, 0.66, 0.16]];
    var knuckles = [
      [[-0.38, 0.35, 0.21], [-0.34, 0.42, 0.22], [-0.27, 0.43, 0.21]],
      [[-0.16, 0.39, 0.21], [-0.11, 0.46, 0.22], [-0.04, 0.40, 0.21]],
      [[0.09, 0.39, 0.21], [0.15, 0.45, 0.22], [0.22, 0.38, 0.21]],
      [[0.31, 0.31, 0.20], [0.38, 0.36, 0.21], [0.44, 0.23, 0.20]]
    ];
    var outlineSet = pathSet(palmEdges);
    var ribSet = pathSet(palmRibs);
    var fingerSets = fingers.map(function (path) { return pathSet([path]); });
    var thumbSet = pathSet([thumb]);
    var knuckleSet = pathSet(knuckles);

    for (var i = 0; i < N; i++) {
      if (rnd() > 0.44) {
        S.set(i, 0, 0, 0, C.grey, 0, 0);
        continue;
      }
      var k = rnd(), p, c = tone(), a = 0.94 + rnd() * 0.06, sz = 0.52 + rnd() * 0.48;
      if (k < 0.53) p = palmShell();
      else if (k < 0.76) p = samplePath(fingerSets[Math.floor(rnd() * fingerSets.length)], 0.060);
      else if (k < 0.87) p = samplePath(thumbSet, 0.075);
      else if (k < 0.96) p = samplePath(outlineSet, 0.022);
      else if (k < 0.99) p = samplePath(ribSet, 0.014);
      else p = samplePath(knuckleSet, 0.019);
      S.set(i, p[0], p[1], p[2], c, a, sz);
    }
    return S;
  }

  /* ── INTRO TEXT: large particle lettering for the Home hero ── */
  function makeIntroText() {
    var S = new Shape();
    var canvas = document.createElement('canvas');
    canvas.width = 1920; canvas.height = 680;
    var ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = '#fff';
    ctx.font = '500 150px "Instrument Sans", Arial, sans-serif';
    ctx.fillText('Hey, I am', 960, 250);
    ctx.font = '600 230px "Instrument Sans", Arial, sans-serif';
    ctx.fillText('Hisham Alpha', 960, 545);

    var pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    var samples = [];
    for (var y = 0; y < canvas.height; y += 2) {
      for (var x = 0; x < canvas.width; x += 2) {
        if (pixels[(y * canvas.width + x) * 4 + 3] > 96) samples.push([x, y]);
      }
    }
    for (var i = 0; i < N; i++) {
      var sample = samples[Math.floor(rnd() * samples.length)];
      var tonePick = rnd(), c = tonePick < 0.64 ? C.white : (tonePick < 0.94 ? C.grey : C.teal);
      var px = sample[0], py = sample[1];
      S.set(i, (px - 960) * 0.0075, (340 - py) * 0.007, rr(-0.22, 0.22), c,
        0.9 + rnd() * 0.1, 0.76 + rnd() * 0.48);
    }
    return S;
  }

  /* ── CLOUD (scattered starfield) ───────────────────────── */
  function makeCloud(spread, depthMin, depthMax, dimness, particleScale) {
    var S = new Shape();
    for (var i = 0; i < N; i++) {
      var x = rr(-spread, spread), y = rr(-spread * 0.7, spread * 0.7), z = rr(depthMin, depthMax);
      var cc = rnd(), c;
      if (cc < 0.16) c = C.yellow; else if (cc < 0.24) c = C.violet; else if (cc < 0.28) c = C.teal; else if (cc < 0.30) c = C.pink; else if (cc < 0.55) c = C.white; else c = C.grey;
      var a = (0.35 + rnd() * 0.65) * dimness;
      var sz = (0.6 + rnd() * rnd() * 1.6) * (particleScale || 1);
      S.set(i, x, y, z, c, a, sz);
    }
    return S;
  }

  /* ── LIGHTBULB ─────────────────────────────────────────── */
  function makeBulb() {
    var S = new Shape();
    for (var i = 0; i < N; i++) {
      var k = rnd(), x, y, z, c, a, sz;
      if (k < 0.60) {
        /* glass sphere */
        var d = sphereDir();
        if (d[1] < -0.72) { d = sphereDir(); d[1] = Math.abs(d[1]); }
        x = d[0]; y = 0.55 + d[1]; z = d[2];
        var t = (y - 0.55 + 1) / 2;
        c = t > 0.9 ? (rnd() < 0.6 ? C.yellow : C.white) : (rnd() < 0.66 ? C.white : (rnd() < 0.7 ? C.grey : C.yellow));
        a = 0.7 + rnd() * 0.3; sz = 0.7 + rnd() * 0.5;
      } else if (k < 0.70) {
        /* filament glow — dense white cluster inside */
        var d3 = sphereDir(); var rad = Math.pow(rnd(), 0.6) * 0.32;
        x = d3[0] * rad; y = 0.35 + d3[1] * rad * 1.3; z = d3[2] * rad;
        c = rnd() < 0.8 ? C.white : C.yellow; a = 0.9; sz = 0.6 + rnd() * 0.5;
      } else if (k < 0.85) {
        /* neck: sphere narrows into a waist */
        var yy = rr(-0.95, -0.12);
        var tt = (yy + 0.95) / 0.83;                 /* 0 bottom → 1 top */
        var rad2 = 0.42 + 0.27 * Math.pow(tt, 1.7);
        var ang = rnd() * TAU;
        x = Math.cos(ang) * rad2; y = yy; z = Math.sin(ang) * rad2;
        var cc = rnd();
        c = tt > 0.6 ? (cc < 0.5 ? C.lilac : C.white) : (cc < 0.7 ? C.violet : C.lilac);
        a = 0.85; sz = 0.8;
      } else {
        /* screw base with ridges + bottom contact */
        var y2 = rr(-1.75, -0.95);
        var ridge = 0.40 + 0.045 * Math.sin((y2 + 0.95) * 34);
        if (y2 < -1.62) ridge = 0.22;
        var ang2 = rnd() * TAU;
        x = Math.cos(ang2) * ridge; y = y2; z = Math.sin(ang2) * ridge;
        var u = (y2 + 1.75) / 0.8;               /* 0 bottom → 1 top */
        c = u > 0.66 ? C.violet : (u > 0.3 ? C.teal : C.yellow);
        a = 0.9; sz = 0.8;
      }
      S.set(i, x, y, z, c, a, sz);
    }
    return S;
  }

  /* ── GLOBE ─────────────────────────────────────────────── */
  function makeGlobe() {
    var S = new Shape();
    function land(d) {
      var lat = Math.asin(d[1]);
      var n = fbm(d[0] * 2.4 + 11.3, d[1] * 2.4 + 4.7, d[2] * 2.4 + 2.2);
      /* oceans where noise is low; poles mostly empty */
      var bias = 0.5 + Math.abs(lat) * 0.07;
      return n > bias;
    }
    for (var i = 0; i < N; i++) {
      var d, x, y, z, c, a, sz;
      if (i < N * 0.86) {
        var tries = 0;
        do { d = sphereDir(); tries++; } while (!land(d) && tries < 40);
        var cc = rnd();
        if (cc < 0.42) c = C.white; else if (cc < 0.72) c = C.yellow; else if (cc < 0.9) c = C.violet; else if (cc < 0.96) c = C.teal; else c = C.grey;
        a = 0.85 + rnd() * 0.15; sz = 0.75 + rnd() * 0.5;
      } else {
        d = sphereDir();
        c = rnd() < 0.7 ? C.dim : C.grey; a = 0.3; sz = 0.55;
      }
      var rad = 1 + (rnd() - 0.5) * 0.02;
      x = d[0] * rad; y = d[1] * rad; z = d[2] * rad;
      S.set(i, x, y, z, c, a, sz);
    }
    return S;
  }

  /* ── CODE MARK: particle strokes forming </> ──────────── */
  function makeCodeMark() {
    var S = new Shape();
    var segments = [
      { x1: -0.35, y1: 0.78, x2: -1.12, y2: 0 },
      { x1: -1.12, y1: 0, x2: -0.35, y2: -0.78 },
      { x1: -0.08, y1: -0.88, x2: 0.42, y2: 0.88 },
      { x1: 0.85, y1: 0.78, x2: 1.62, y2: 0 },
      { x1: 1.62, y1: 0, x2: 0.85, y2: -0.78 }
    ];
    var totalLength = 0;
    segments.forEach(function (seg) {
      seg.dx = seg.x2 - seg.x1; seg.dy = seg.y2 - seg.y1;
      seg.length = Math.sqrt(seg.dx * seg.dx + seg.dy * seg.dy);
      totalLength += seg.length;
    });

    for (var i = 0; i < N; i++) {
      var pickAt = rnd() * totalLength, seg = segments[segments.length - 1];
      for (var j = 0; j < segments.length; j++) {
        pickAt -= segments[j].length;
        if (pickAt <= 0) { seg = segments[j]; break; }
      }
      var t = rnd();
      var nx = -seg.dy / seg.length, ny = seg.dx / seg.length;
      var crisp = rnd() < 0.7;
      var stroke = (rnd() + rnd() - 1) * (crisp ? 0.12 : 0.35);
      var x = seg.x1 + seg.dx * t + nx * stroke;
      var y = seg.y1 + seg.dy * t + ny * stroke;
      var z = rr(crisp ? -0.18 : -0.35, crisp ? 0.18 : 0.35) + Math.sin(t * Math.PI) * rr(-0.08, 0.08);
      var tone = rnd(), c = tone < 0.62 ? C.white : (tone < 0.92 ? C.grey : C.teal);
      S.set(i, x, y, z, c, crisp ? 0.82 + rnd() * 0.18 : 0.12 + rnd() * 0.2, crisp ? 0.65 + rnd() * 0.45 : 0.4 + rnd() * 0.4);
    }
    return S;
  }

  /* ── BRAND MARK: three swept blades (teal / violet / orange) ─ */
  function makeLogo() {
    var S = new Shape();
    var blades = [
      { a0: 0.8, c: C.teal },      /* points up */
      { a0: 0.8 + TAU / 3, c: C.violet },
      { a0: 0.8 + 2 * TAU / 3, c: C.orange }
    ];
    var span = 1.75;               /* radians of sweep per blade */
    for (var i = 0; i < N; i++) {
      var b = blades[i % 3];
      var x, y, z, c, a, sz;
      /* rejection sample the blade: annular sector whose inner radius grows along the sweep */
      var ok = false, tries = 0;
      while (!ok && tries < 40) {
        tries++;
        var th = rnd() * span, r = Math.sqrt(rnd()) * 1.6;
        var rin = 0.15 + 0.95 * Math.pow(th / span, 1.5);
        var rout = 1.6 - 0.45 * Math.pow(th / span, 2.2);
        if (r > rin && r < rout) {
          var ang = b.a0 + th;
          x = Math.cos(ang) * r; y = Math.sin(ang) * r;
          z = (rnd() - 0.5) * 0.28 * (1 - r / 1.8);
          ok = true;
        }
      }
      if (!ok) { x = 0; y = 0; z = 0; }
      var edge = rnd() < 0.18;
      c = edge ? C.white : b.c;
      a = 0.75 + rnd() * 0.25; sz = 0.6 + rnd() * 0.6;
      S.set(i, x, y, z, c, a, sz);
    }
    return S;
  }

  /* ── sprite texture: small triangle outline with a soft core ── */
  function makeSprite() {
    var s = 64, cv = document.createElement('canvas'); cv.width = cv.height = s;
    var g = cv.getContext('2d');
    g.clearRect(0, 0, s, s);
    var grd = g.createRadialGradient(32, 34, 0, 32, 34, 30);
    grd.addColorStop(0, 'rgba(255,255,255,.55)'); grd.addColorStop(0.35, 'rgba(255,255,255,.12)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, s, s);
    g.strokeStyle = 'rgba(255,255,255,1)'; g.lineWidth = 5; g.lineJoin = 'round';
    g.shadowColor = 'rgba(255,255,255,.9)'; g.shadowBlur = 6;
    g.beginPath(); g.moveTo(32, 12); g.lineTo(52, 48); g.lineTo(12, 48); g.closePath(); g.stroke();
    g.lineWidth = 2.5; g.globalAlpha = .8;
    g.beginPath(); g.moveTo(32, 12); g.lineTo(32, 40); g.moveTo(12, 48); g.lineTo(32, 40); g.lineTo(52, 48); g.stroke();
    var tex = new THREE.CanvasTexture(cv);
    tex.minFilter = THREE.LinearMipmapLinearFilter; tex.generateMipmaps = true;
    return tex;
  }

  var VERT = [
    'attribute vec3 posA; attribute vec3 posB;',
    'attribute vec4 colA; attribute vec4 colB;',
    'attribute float sizeA; attribute float sizeB;',
    'attribute vec3 scatter; attribute float rnd;',
    'uniform mat4 mA; uniform mat4 mB;',
    'uniform float uMix; uniform float uAmp; uniform float uTime; uniform float uPx;',
    'uniform float uJitA; uniform float uJitB; uniform float uAlpha; uniform float uSizeMul; uniform float uDensity;',
    'uniform vec2 uMouse; uniform float uMouseField; uniform float uAspect; uniform vec3 uScatterScale;',
    'varying vec4 vCol; varying float vTw;',
    'void main(){',
    '  float e = clamp((uMix - rnd*0.35) / 0.65, 0.0, 1.0);',
    '  e = e*e*(3.0-2.0*e);',
    '  vec3 jitA = vec3(sin(uTime*1.7+rnd*97.0), cos(uTime*1.3+rnd*61.0), sin(uTime*2.1+rnd*43.0));',
    '  vec3 pa = (mA * vec4(posA + jitA*uJitA, 1.0)).xyz;',
    '  vec3 pb = (mB * vec4(posB + jitA*uJitB, 1.0)).xyz;',
    '  float bulge = sin(e*3.14159) ;',
    '  vec3 p = mix(pa, pb, e) + scatter * uScatterScale * bulge * uAmp;',
    '  vec4 mv = modelViewMatrix * vec4(p, 1.0);',
    '  float sz = mix(sizeA, sizeB, e) * uSizeMul;',
    '  gl_PointSize = sz * uPx * (72.0 / -mv.z);',
    '  vec4 clip = projectionMatrix * mv;',
    '  vec2 screenDelta = (clip.xy / max(clip.w, 0.0001) - uMouse) * vec2(uAspect, 1.0);',
    '  float pointerDistance = length(screenDelta);',
    '  float pointerAngle = atan(screenDelta.y, screenDelta.x);',
    '  float fieldNoiseA = sin(pointerAngle * 2.9 + 1.7 + uTime * 0.13);',
    '  float fieldNoiseB = sin(pointerAngle * 6.7 + 4.1 - uTime * 0.08);',
    '  float fieldNoiseC = sin(pointerAngle * 12.4 + 2.3 + uTime * 0.05);',
    '  float fieldNoiseD = sin(pointerAngle * 19.1 + 5.2 - uTime * 0.035);',
    '  float edgeWarp = fieldNoiseA * 0.014 + fieldNoiseB * 0.009 + fieldNoiseC * 0.0045 + fieldNoiseD * 0.002;',
    '  float fieldRadius = 0.075 + edgeWarp;',
    '  float fieldDistance = pointerDistance / max(fieldRadius, 0.045);',
    '  float waveEnvelope = (1.0 - smoothstep(0.02, 1.06, fieldDistance)) * uMouseField;',
    '  float phaseWarp = (fieldNoiseA * 0.9 + fieldNoiseB * 0.7 + fieldNoiseC * 0.4)',
    '    + (fieldNoiseC * 0.35 + fieldNoiseD * 0.25);',
    '  float ripple = sin(fieldDistance * 11.5 - uTime * 4.2 + phaseWarp) * waveEnvelope;',
    '  vec2 radialDirection = screenDelta / max(pointerDistance, 0.0001);',
    '  vec2 tangentDirection = vec2(-radialDirection.y, radialDirection.x);',
    '  float tangentWarp = (fieldNoiseB * 0.55 + fieldNoiseD * 0.25);',
    '  vec2 rawDirection = radialDirection + tangentDirection * tangentWarp;',
    '  vec2 warpedDirection = rawDirection / max(length(rawDirection), 0.0001);',
    '  vec2 screenOffset = vec2(warpedDirection.x / uAspect, warpedDirection.y) * ripple * 0.024;',
    '  clip.xy += screenOffset * clip.w;',
    '  gl_Position = clip;',
    '  vec4 c = mix(colA, colB, e);',
    '  vTw = 0.78 + 0.22*sin(uTime*2.6 + rnd*140.0);',
    '  float depthFade = clamp(1.55 - (-mv.z - 6.0) / 7.5, 0.22, 1.0);',
    '  float keepParticle = 1.0 - step(uDensity, rnd);',
    '  vCol = vec4(c.rgb, c.a * uAlpha * depthFade * (1.0 - bulge*0.35) * keepParticle);',
    '}'
  ].join('\n');

  var FRAG = [
    'uniform sampler2D uTex;',
    'uniform vec3 uToneDark; uniform vec3 uToneMid; uniform vec3 uToneLight; uniform float uToneAmount;',
    'varying vec4 vCol; varying float vTw;',
    'void main(){',
    '  vec4 t = texture2D(uTex, gl_PointCoord);',
    '  float a = t.a * vCol.a * vTw;',
    '  if (a < 0.01) discard;',
    '  float luminance = dot(vCol.rgb, vec3(0.299, 0.587, 0.114));',
    '  float tone = smoothstep(0.10, 0.48, luminance);',
    '  vec3 lowerTone = mix(uToneDark, uToneMid, smoothstep(0.0, 0.5, tone));',
    '  vec3 recolored = mix(lowerTone, uToneLight, smoothstep(0.5, 1.0, tone));',
    '  gl_FragColor = vec4(mix(vCol.rgb, recolored, uToneAmount), a);',
    '}'
  ].join('\n');

  /* ── keyframe timeline: t is "section index + fraction" ─── */
  /* x,y,z world units (visible height at z=0 ≈ 8.3), ry/rz radians, s scale */
  var KEYS = [
    { t: 0.00, shape: 'intro', x: 0.0, y: 1.45, z: 0.0, ry: 0.0, rz: 0.0, s: 1.0 },
    { t: 0.14, shape: 'intro', x: 0.0, y: 1.45, z: 0.0, ry: 0.0, rz: 0.0, s: 1.0 },
    { t: 0.52, shape: 'brain', x: -3.3, y: 0.1, z: 0.3, ry: 0.85, rz: 0.08, s: 3.0 },
    { t: 1.00, shape: 'brain', x: -3.3, y: 0.1, z: 0.3, ry: 0.85, rz: 0.08, s: 3.0 },
    { t: 1.45, shape: 'brain', x: -2.0, y: 2.4, z: 0.3, ry: 1.25, rz: 0.12, s: 3.0 },
    { t: 2.10, shape: 'cloud', x: 0.0, y: 0.0, z: 0.0, ry: 0.0, rz: 0.0, s: 1.0 },
    { t: 2.82, shape: 'cloud', x: 0.0, y: 0.6, z: 0.0, ry: 0.35, rz: 0.0, s: 1.05 },
    { t: 3.05, shape: 'bulb', x: -2.7, y: -0.2, z: 0.2, ry: 0.0, rz: 0.48, s: 2.4 },
    { t: 3.55, shape: 'bulb', x: -2.7, y: -0.5, z: 0.2, ry: 0.9, rz: 0.42, s: 2.4 },
    { t: 4.10, shape: 'code', x: 2.3, y: 0.4, z: -0.6, ry: 0.0, rz: 0.0, s: 2.1 },
    { t: 5.08, shape: 'code', x: 2.3, y: 0.4, z: -0.6, ry: 0.0, rz: 0.0, s: 2.1 },
    { t: 5.18, shape: 'codeBreak', x: -0.6, y: 0.2, z: -0.4, ry: 0.0, rz: 0.0, s: 0.8 },
    { t: 5.20, shape: 'codeBreak', x: -0.6, y: 0.2, z: -0.4, ry: 0.0, rz: 0.0, s: 0.8 },
    { t: 5.30, shape: 'code', x: -3.0, y: 0.4, z: -0.6, ry: 0.0, rz: 0.0, s: 2.1 },
    { t: 5.90, shape: 'code', x: -3.0, y: 0.4, z: -0.6, ry: 0.0, rz: 0.0, s: 2.1 },
    { t: 5.96, shape: 'dust', x: 0.0, y: 0.0, z: 0.0, ry: 0.0, rz: 0.0, s: 1.0 },
    { t: 6.00, shape: 'logo', x: 0.0, y: 0.05, z: 0.0, ry: 0.35, rz: 0.0, s: 1.35 }
  ];
  var SHAPE_META = {
    brain: { spin: 0.10, axis: 'y', jit: 0.012, alpha: 1.0, amp: 3.2, size: 1.0 },
    intro: { spin: 0.0, axis: 'y', jit: 0.008, alpha: 1.0, amp: 2.5, size: 1.0 },
    cloud: { spin: 0.012, axis: 'y', jit: 0.06, alpha: 0.9, amp: 2.4, size: 1.15 },
    bulb:  { spin: 0.14, axis: 'y', jit: 0.010, alpha: 1.0, amp: 3.0, size: 1.0 },
    code:  { spin: 0.0, axis: 'y', jit: 0.008, alpha: 1.0, amp: 3.1, size: 0.95 },
    codeBreak: { spin: 0.0, axis: 'y', jit: 0.07, alpha: 1.0, amp: 3.6, size: 1.25 },
    dust:  { spin: 0.008, axis: 'y', jit: 0.05, alpha: 0.7, amp: 3.0, size: 0.9 },
    logo:  { spin: 0.05, axis: 'z', jit: 0.010, alpha: 0.78, amp: 3.4, size: 0.9 }
  };

  function smooth(t) { return t * t * (3 - 2 * t); }
  function lerp(a, b, t) { return a + (b - a) * t; }

  /* ── mount ─────────────────────────────────────────────── */
  function mount(canvas, opts) {
    opts = opts || {};
    var reduced = !!opts.reduced;
    var renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: false, alpha: true, powerPreference: 'high-performance' });
    } catch (e) { return null; }
    var DPR = Math.min(window.devicePixelRatio || 1, 1.75);
    renderer.setPixelRatio(DPR);
    renderer.setClearColor(0x000000, 0);

    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(45, 1, 0.1, 60);
    camera.position.set(0, 0, 10);

    var shapes = {
      brain: makeBrain(), cloud: makeCloud(7.5, -6, 3, 1.0), bulb: makeBulb(),
      code: makeCodeMark(), dust: makeCloud(9, -9, -1, 0.55), codeBreak: makeCloud(12.5, -9, 2, 1.0, 1.5), logo: makeLogo()
    };
    var shapeSeed = seed;
    shapes.intro = makeIntroText();
    seed = shapeSeed;

    /* geometry */
    var geo = new THREE.BufferGeometry();
    var posA = new THREE.BufferAttribute(new Float32Array(N * 3), 3), posB = new THREE.BufferAttribute(new Float32Array(N * 3), 3);
    var colA = new THREE.BufferAttribute(new Float32Array(N * 4), 4), colB = new THREE.BufferAttribute(new Float32Array(N * 4), 4);
    var sizeA = new THREE.BufferAttribute(new Float32Array(N), 1), sizeB = new THREE.BufferAttribute(new Float32Array(N), 1);
    var scatter = new Float32Array(N * 3), rnda = new Float32Array(N);
    for (var i = 0; i < N; i++) {
      var d = sphereDir(); var m = 0.4 + Math.pow(rnd(), 1.5) * 1.6;
      scatter[i * 3] = d[0] * m; scatter[i * 3 + 1] = d[1] * m + 0.35; scatter[i * 3 + 2] = d[2] * m;
      rnda[i] = rnd();
    }
    geo.setAttribute('position', posA);      /* keeps three's bounds happy */
    geo.setAttribute('posA', posA); geo.setAttribute('posB', posB);
    geo.setAttribute('colA', colA); geo.setAttribute('colB', colB);
    geo.setAttribute('sizeA', sizeA); geo.setAttribute('sizeB', sizeB);
    geo.setAttribute('scatter', new THREE.BufferAttribute(scatter, 3));
    geo.setAttribute('rnd', new THREE.BufferAttribute(rnda, 1));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 40);

    var uniforms = {
      mA: { value: new THREE.Matrix4() }, mB: { value: new THREE.Matrix4() },
      uMix: { value: 0 }, uAmp: { value: 2 }, uTime: { value: 0 }, uPx: { value: DPR },
      uJitA: { value: 0.01 }, uJitB: { value: 0.01 }, uAlpha: { value: 1 }, uSizeMul: { value: 1 }, uDensity: { value: 1 },
      uMouse: { value: new THREE.Vector2(0, 0) }, uMouseField: { value: 0 }, uAspect: { value: 1 },
      uScatterScale: { value: new THREE.Vector3(1, 1, 1) },
      uToneDark: { value: new THREE.Vector3(0.47, 0.58, 0.73) },
      uToneMid: { value: new THREE.Vector3(0.45, 0.78, 0.91) },
      uToneLight: { value: new THREE.Vector3(0.93, 0.97, 1.0) }, uToneAmount: { value: 1 },
      uTex: { value: makeSprite() }
    };
    var mat = new THREE.ShaderMaterial({
      uniforms: uniforms, vertexShader: VERT, fragmentShader: FRAG,
      transparent: true, depthWrite: false, depthTest: false, blending: THREE.NormalBlending
    });
    var points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    scene.add(points);

    var curA = null, curB = null;
    function loadShape(attrP, attrC, attrS, S) {
      attrP.array.set(S.pos); attrC.array.set(S.col); attrS.array.set(S.size);
      attrP.needsUpdate = true; attrC.needsUpdate = true; attrS.needsUpdate = true;
    }
    function setPair(a, b) {
      if (a !== curA) { loadShape(posA, colA, sizeA, shapes[a]); curA = a; }
      if (b !== curB) { loadShape(posB, colB, sizeB, shapes[b]); curB = b; }
    }

    /* ── big wireframe tetrahedra ───────────────────────────── */
    var TET_COLS = [0x7895bb, 0x74c8e8, 0xeef7ff, 0x91add0, 0x74c8e8, 0xeef7ff, 0x7895bb, 0x91add0, 0x74c8e8, 0xeef7ff];
    var tets = [];
    var tetGroup = new THREE.Group(); scene.add(tetGroup);
    var edges = new THREE.EdgesGeometry(new THREE.TetrahedronGeometry(1, 0));
    for (var k = 0; k < 18; k++) {
      var col = TET_COLS[k % TET_COLS.length];
      var depth = rnd();                        /* 0 far … 1 near */
      var z = lerp(-7, 3.5, depth);
      var size = lerp(0.12, 0.42, depth) * (0.7 + rnd() * 0.6);
      var bright = k < 5 ? 0.95 : 0.3 + rnd() * 0.3;
      var m1 = new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: bright, depthWrite: false, blending: THREE.NormalBlending });
      var m2 = new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: bright * 0.28, depthWrite: false, blending: THREE.NormalBlending });
      var g1 = new THREE.LineSegments(edges, m1);
      var g2 = new THREE.LineSegments(edges, m2); g2.scale.setScalar(1.06);
      var g3 = new THREE.LineSegments(edges, m2.clone()); g3.material.opacity = bright * 0.12; g3.scale.setScalar(1.14);
      var grp = new THREE.Group(); grp.add(g1); grp.add(g2); grp.add(g3);
      grp.scale.setScalar(size);
      var t = { grp: grp, x: rr(-8, 8), y0: rr(-5, 5), z: z, depth: depth,
        rx: rr(0, TAU), ry: rr(0, TAU), rz: rr(0, TAU), sx: rr(-0.4, 0.4), sy: rr(-0.4, 0.4), sz: rr(-0.3, 0.3),
        wob: rr(0, TAU) };
      grp.position.set(t.x, t.y0, z);
      tetGroup.add(grp); tets.push(t);
    }

    /* small far dust always present, so the void is never empty */
    var dustGeo = new THREE.BufferGeometry();
    var dn = 700, dp = new Float32Array(dn * 3), dc = new Float32Array(dn * 4), ds = new Float32Array(dn);
    for (var q = 0; q < dn; q++) {
      dp[q * 3] = rr(-12, 12); dp[q * 3 + 1] = rr(-9, 9); dp[q * 3 + 2] = rr(-12, -3);
      var cq = rnd() < 0.15 ? C.yellow : C.grey;
      dc[q * 4] = cq[0]; dc[q * 4 + 1] = cq[1]; dc[q * 4 + 2] = cq[2]; dc[q * 4 + 3] = 0.25 + rnd() * 0.3; ds[q] = 0.5 + rnd() * 0.5;
    }
    dustGeo.setAttribute('position', new THREE.BufferAttribute(dp, 3));
    dustGeo.setAttribute('posA', new THREE.BufferAttribute(dp, 3)); dustGeo.setAttribute('posB', new THREE.BufferAttribute(dp, 3));
    dustGeo.setAttribute('colA', new THREE.BufferAttribute(dc, 4)); dustGeo.setAttribute('colB', new THREE.BufferAttribute(dc, 4));
    dustGeo.setAttribute('sizeA', new THREE.BufferAttribute(ds, 1)); dustGeo.setAttribute('sizeB', new THREE.BufferAttribute(ds, 1));
    var dsc = new Float32Array(dn * 3), drn = new Float32Array(dn); for (var q2 = 0; q2 < dn; q2++) drn[q2] = rnd();
    dustGeo.setAttribute('scatter', new THREE.BufferAttribute(dsc, 3)); dustGeo.setAttribute('rnd', new THREE.BufferAttribute(drn, 1));
    dustGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 40);
    var dustUniforms = THREE.UniformsUtils.clone(uniforms); dustUniforms.uTex.value = uniforms.uTex.value;
    dustUniforms.uJitA.value = 0.03; dustUniforms.uJitB.value = 0.03; dustUniforms.uMix.value = 0;
    var dustMat = new THREE.ShaderMaterial({ uniforms: dustUniforms, vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, depthTest: false, blending: THREE.NormalBlending });
    var dust = new THREE.Points(dustGeo, dustMat); dust.frustumCulled = false; scene.add(dust);

    /* ── state ─────────────────────────────────────────────── */
    var W = 1, H = 1, visH = 8.28;
    var T = 0, Tsm = 0;               /* timeline value, smoothed */
    var scrollWorld = 0;
    var mx = 0, my = 0, pointerActive = 0, fieldStrength = 0;
    var spinAcc = {};                 /* per-shape accumulated spin */
    for (var s in SHAPE_META) spinAcc[s] = 0;
    var dummy = new THREE.Object3D();
    var clock = new THREE.Clock();
    var running = true;

    function resize() {
      W = canvas.clientWidth || window.innerWidth; H = canvas.clientHeight || window.innerHeight;
      renderer.setSize(W, H, false);
      uniforms.uAspect.value = dustUniforms.uAspect.value = W / Math.max(1, H);
      uniforms.uDensity.value = dustUniforms.uDensity.value = W < H ? 0.44 : 1.0;
      uniforms.uScatterScale.value.set(W < H ? 0.72 : 1, W < H ? 1.9 : 1, 1);
      camera.aspect = W / H;
      /* keep the vertical extent constant across aspects, widen the fov on portrait */
      var baseFov = 45;
      camera.fov = W < H ? Math.min(75, baseFov * (H / W) * 0.9) : baseFov;
      camera.updateProjectionMatrix();
      visH = 2 * 10 * Math.tan(camera.fov * Math.PI / 360);
    }

    function keyAt(t) {
      var i = 0;
      while (i < KEYS.length - 2 && t >= KEYS[i + 1].t) i++;
      return i;
    }

    function shapeMatrix(key, shape, spinExtra) {
      var meta = SHAPE_META[shape];
      /* narrow viewports: pull shapes toward centre and shrink */
      var narrow = W < H;
      var now = clock.elapsedTime;
      var baseX = narrow ? key.x * 0.25 : key.x;
      var portraitCloud = narrow && (shape === 'cloud' || shape === 'dust' || shape === 'codeBreak');
      var baseY = narrow ? (shape === 'intro' ? 0.62 : (portraitCloud ? key.y : key.y + 0.9)) : key.y;
      if (shape === 'intro') {
        dummy.position.set(baseX + Math.sin(now * 0.34) * 0.035, baseY + Math.sin(now * 0.56) * 0.055, key.z + Math.cos(now * 0.4) * 0.025);
      } else dummy.position.set(baseX, baseY, key.z);
      var sp = shape === 'code' ? Math.sin(clock.elapsedTime * 0.8) * 0.12 : spinAcc[shape] + (spinExtra || 0);
      dummy.rotation.order = 'ZYX';
      if (shape === 'intro') dummy.rotation.set(0.008 * Math.sin(now * 0.42), key.ry + 0.015 * Math.sin(now * 0.32), key.rz + 0.006 * Math.cos(now * 0.37));
      else if (shape === 'code') dummy.rotation.set(0, key.ry + sp, key.rz);
      else if (meta.axis === 'z') dummy.rotation.set(0.1, key.ry, key.rz + sp);
      else dummy.rotation.set(0.12, key.ry + sp, key.rz);
      if (portraitCloud) {
        /* Reframe the wide starfields as tall fills on portrait screens. */
        var cloudX = shape === 'dust' ? 0.38 : 0.47;
        var cloudY = shape === 'dust' ? 1.15 : 1.4;
        dummy.scale.set(key.s * cloudX, key.s * cloudY, key.s * 0.72);
      } else {
        var narrowScale = shape === 'intro' ? 0.46 : 0.72;
        dummy.scale.setScalar(key.s * (narrow ? narrowScale : 1));
      }
      dummy.updateMatrix();
      return dummy.matrix.clone();
    }

    var lerpKey = { x: 0, y: 0, z: 0, ry: 0, rz: 0, s: 1 };
    function interpKey(a, b, f) {
      lerpKey.x = lerp(a.x, b.x, f); lerpKey.y = lerp(a.y, b.y, f); lerpKey.z = lerp(a.z, b.z, f);
      lerpKey.ry = lerp(a.ry, b.ry, f); lerpKey.rz = lerp(a.rz, b.rz, f); lerpKey.s = lerp(a.s, b.s, f);
      return lerpKey;
    }

    function update(dt, time) {
      Tsm += (T - Tsm) * Math.min(1, dt * 4.5);
      if (Math.abs(T - Tsm) < 0.0005) Tsm = T;
      var t = Tsm;
      var i = keyAt(t), a = KEYS[i], b = KEYS[i + 1];
      var f = Math.max(0, Math.min(1, (t - a.t) / (b.t - a.t)));

      for (var s in SHAPE_META) spinAcc[s] += SHAPE_META[s].spin * dt;

      if (a.shape === b.shape) {
        var k = interpKey(a, b, smooth(f));
        setPair(a.shape, a.shape);
        uniforms.mA.value.copy(shapeMatrix(k, a.shape));
        uniforms.mB.value.copy(uniforms.mA.value);
        uniforms.uMix.value = 0;
        uniforms.uAlpha.value = SHAPE_META[a.shape].alpha;
        uniforms.uJitA.value = SHAPE_META[a.shape].jit; uniforms.uJitB.value = SHAPE_META[a.shape].jit;
        uniforms.uSizeMul.value = SHAPE_META[a.shape].size;
      } else {
        setPair(a.shape, b.shape);
        /* A keeps drifting from where it was, B waits at its key pose */
        uniforms.mA.value.copy(shapeMatrix(a, a.shape));
        uniforms.mB.value.copy(shapeMatrix(b, b.shape));
        uniforms.uMix.value = f;
        var e = smooth(f);
        uniforms.uAlpha.value = lerp(SHAPE_META[a.shape].alpha, SHAPE_META[b.shape].alpha, e);
        uniforms.uJitA.value = SHAPE_META[a.shape].jit; uniforms.uJitB.value = SHAPE_META[b.shape].jit;
        uniforms.uSizeMul.value = lerp(SHAPE_META[a.shape].size, SHAPE_META[b.shape].size, e);
        uniforms.uAmp.value = Math.max(SHAPE_META[a.shape].amp, SHAPE_META[b.shape].amp);
      }
      uniforms.uTime.value = time;
      dustUniforms.uTime.value = time * 0.6;

      /* tetrahedra: parallax by scroll depth, slow tumble, wrap vertically */
      var range = 14;
      for (var j = 0; j < tets.length; j++) {
        var tt = tets[j];
        var par = 0.25 + tt.depth * 0.9;
        var yy = tt.y0 + scrollWorld * par * 0.55 + Math.sin(time * 0.4 + tt.wob) * 0.25;
        yy = ((yy + range / 2) % range + range) % range - range / 2;
        tt.grp.position.y = yy;
        tt.grp.position.x = tt.x + Math.cos(time * 0.3 + tt.wob) * 0.2;
        tt.grp.rotation.set(tt.rx + time * tt.sx, tt.ry + time * tt.sy, tt.rz + time * tt.sz);
      }

      /* whole far dust drifts up slowly with scroll */
      dust.position.y = scrollWorld * 0.12;

      /* mouse parallax on the camera */
      camera.position.x = mx * 0.35; camera.position.y = -my * 0.25;
      camera.lookAt(0, 0, 0);
      fieldStrength = pointerActive;
      uniforms.uMouse.value.set(mx, -my);
      uniforms.uMouseField.value = fieldStrength;
      dustUniforms.uMouse.value.set(mx, -my);
      dustUniforms.uMouseField.value = fieldStrength;
    }

    function frame() {
      if (!running) return;
      var dt = Math.min(0.05, clock.getDelta());
      var time = clock.elapsedTime;
      update(dt, time);
      renderer.render(scene, camera);
      requestAnimationFrame(frame);
    }

    resize();
    window.addEventListener('resize', resize);
    document.addEventListener('visibilitychange', function () { if (document.hidden) clock.stop(); else clock.start(); });

    /* first pose */
    setPair('brain', 'brain');
    update(0.016, 0);
    renderer.render(scene, camera);
    if (!reduced) requestAnimationFrame(frame);

    return {
      setT: function (t) { T = t; if (reduced) { Tsm = t; update(0.016, clock.elapsedTime); renderer.render(scene, camera); } },
      setScroll: function (px, vh) { scrollWorld = (px / vh) * visH; },
      setMouse: function (x, y) { mx = x; my = y; pointerActive = 1; },
      clearMouse: function () { mx = 0; my = 0; pointerActive = 0; },
      setPalette: function (dark, mid, light, wire) {
        uniforms.uToneDark.value.set(dark[0], dark[1], dark[2]);
        uniforms.uToneMid.value.set(mid[0], mid[1], mid[2]);
        uniforms.uToneLight.value.set(light[0], light[1], light[2]);
        uniforms.uToneAmount.value = 1;
        dustUniforms.uToneDark.value.set(dark[0], dark[1], dark[2]);
        dustUniforms.uToneMid.value.set(mid[0], mid[1], mid[2]);
        dustUniforms.uToneLight.value.set(light[0], light[1], light[2]);
        dustUniforms.uToneAmount.value = 1;
        tetGroup.traverse(function (item) {
          if (item.material && item.material.color) item.material.color.setRGB(wire[0], wire[1], wire[2]);
        });
      },
      resize: resize,
      renderOnce: function () { update(0.016, clock.elapsedTime); renderer.render(scene, camera); },
      dispose: function () { running = false; renderer.dispose(); }
    };
  }

  window.DalaParticles = { mount: mount, KEYS: KEYS };
})();
