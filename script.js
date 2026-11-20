/* ══════════════════════════════════════════════════════════════════
   HISHAM ALPHA — scroll drives a fixed particle stage; copy scrolls over it.
   Lenis → ScrollTrigger; a single "timeline value" T (section index +
   fraction) is fed to the particle engine every frame.
   ══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var $  = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  var clamp = function (v, a, b) { return v < a ? a : (v > b ? b : v); };

  var hasGSAP = typeof window.gsap !== 'undefined';
  var REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (hasGSAP) { gsap.registerPlugin(ScrollTrigger); gsap.config({ nullTargetWarn: false }); }
  var EASE = 'expo.out';

  document.body.classList.add('is-loading');

  /* ── 0 · PARTICLE STAGE ─────────────────────────────────── */
  var PART = null;
  var _t0 = performance.now();
  try { PART = window.DalaParticles && window.DalaParticles.mount($('#gl'), { reduced: REDUCED }); } catch (e) { PART = null; console.warn('particles failed', e); }
  if (PART && PART.setPalette) window.setPortfolioParticlePalette = function (dark, mid, light, wire) { PART.setPalette(dark, mid, light, wire); };
  window.__mountMs = Math.round(performance.now() - _t0);

  /* ── 1 · SMOOTH SCROLL ─────────────────────────────────── */
  var lenis = null;
  function initLenis() {
    if (typeof window.Lenis === 'undefined' || REDUCED) return;
    lenis = new Lenis({ duration: 1.15, easing: function (t) { return Math.min(1, 1.001 - Math.pow(2, -10 * t)); }, smoothWheel: true, lerp: 0.085, touchMultiplier: 1.4 });
    if (hasGSAP) {
      lenis.on('scroll', ScrollTrigger.update);
      gsap.ticker.add(function (t) { lenis.raf(t * 1000); });
      gsap.ticker.lagSmoothing(0);
    } else {
      var raf = function (t) { lenis.raf(t); requestAnimationFrame(raf); };
      requestAnimationFrame(raf);
    }
    /* anchor links */
    $$('a[href^="#"]').forEach(function (a) {
      a.addEventListener('click', function (e) {
        var id = a.getAttribute('href'); if (id.length < 2) return;
        var el = $(id); if (!el) return;
        e.preventDefault(); lenis.scrollTo(el, { offset: -(parseFloat(getComputedStyle(el).scrollMarginTop) || 0), duration: 1.4 });
      });
    });
  }

  /* ── 2 · LOW-POLY BUTTON SHATTER ────────────────────────── */
  function initShardButtons() {
    if (REDUCED) return;
    var buttons = $$('.pill');
    if (!buttons.length) return;
    var canvas = document.createElement('canvas');
    canvas.className = 'shard-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    document.body.appendChild(canvas);
    var ctx = canvas.getContext('2d', { alpha: true });
    var magnetCanvas = document.createElement('canvas');
    magnetCanvas.className = 'magnet-canvas';
    magnetCanvas.setAttribute('aria-hidden', 'true');
    document.body.appendChild(magnetCanvas);
    var magnetCtx = magnetCanvas.getContext('2d', { alpha: true });
    var magnetParticles = [], magnetFrame = 0, lastMagnetEmit = 0, magnetSource = null;
    var pointer = { x: 0, y: 0 };
    var dpr = 1, width = 0, height = 0, active = false;

    function resize() {
      magnetSource = null;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      magnetCanvas.width = Math.round(width * dpr);
      magnetCanvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      magnetCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    function spawnMagnetParticles(source, now) {
      if (!source || active || now - lastMagnetEmit < 82) return;
      lastMagnetEmit = now;
      var rect = source.rect;
      var sx = pointer.x, sy = pointer.y;
      if (pointer.x < rect.left) { sx = rect.left + 2; sy = clamp(pointer.y, rect.top + 5, rect.bottom - 5); }
      else if (pointer.x > rect.right) { sx = rect.right - 2; sy = clamp(pointer.y, rect.top + 5, rect.bottom - 5); }
      else if (pointer.y < rect.top) { sy = rect.top + 2; sx = clamp(pointer.x, rect.left + 9, rect.right - 9); }
      else { sy = rect.bottom - 2; sx = clamp(pointer.x, rect.left + 9, rect.right - 9); }
      var dxToPointer = pointer.x - sx, dyToPointer = pointer.y - sy;
      var length = Math.max(1, Math.sqrt(dxToPointer * dxToPointer + dyToPointer * dyToPointer));
      var amount = source.distance < 34 ? 2 : 1;
      for (var n = 0; n < amount; n++) {
        var speed = 18 + Math.random() * 34;
        magnetParticles.push({
          x: sx + (Math.random() - .5) * 5, y: sy + (Math.random() - .5) * 5,
          vx: dxToPointer / length * speed + (Math.random() - .5) * 17,
          vy: dyToPointer / length * speed + (Math.random() - .5) * 17,
          size: 1.25 + Math.random() * 2.25, rotation: Math.random() * Math.PI * 2,
          spin: (Math.random() - .5) * 5, age: 0, life: 480 + Math.random() * 260,
          color: ['#d6e6f4', '#91add0', '#74c8e8'][Math.floor(Math.random() * 3)],
          triangle: Math.random() > .22
        });
      }
      if (magnetParticles.length > 84) magnetParticles.splice(0, magnetParticles.length - 84);
    }
    function emitMagnetParticles(event) {
      if (active || event.pointerType !== 'mouse') { magnetSource = null; return; }
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      var closest = null;
      var closestDistance = 76;
      buttons.forEach(function (button) {
        var rect = button.getBoundingClientRect();
        var dx = Math.max(rect.left - pointer.x, 0, pointer.x - rect.right);
        var dy = Math.max(rect.top - pointer.y, 0, pointer.y - rect.bottom);
        var distance = Math.sqrt(dx * dx + dy * dy);
        var inside = pointer.x >= rect.left && pointer.x <= rect.right && pointer.y >= rect.top && pointer.y <= rect.bottom;
        if (!inside && distance < closestDistance) {
          closestDistance = distance;
          closest = { rect: rect, distance: distance };
        }
      });
      magnetSource = closest;
      if (!closest) return;
      spawnMagnetParticles(closest, performance.now());
      if (!magnetFrame) magnetFrame = requestAnimationFrame(drawMagnetParticles);
    }
    function drawMagnetParticles(now) {
      magnetFrame = 0;
      magnetCtx.clearRect(0, 0, width, height);
      if (magnetSource && !active) spawnMagnetParticles(magnetSource, now);
      var dt = Math.min(.032, Math.max(.001, (now - (drawMagnetParticles.lastTime || now - 16)) / 1000));
      drawMagnetParticles.lastTime = now;
      magnetParticles = magnetParticles.filter(function (particle) {
        particle.age += dt * 1000;
        if (particle.age >= particle.life) return false;
        var dx = pointer.x - particle.x, dy = pointer.y - particle.y;
        particle.vx += (dx * 4.2 - particle.vx * 3.1) * dt;
        particle.vy += (dy * 4.2 - particle.vy * 3.1) * dt;
        particle.vx = clamp(particle.vx, -190, 190);
        particle.vy = clamp(particle.vy, -190, 190);
        particle.x += particle.vx * dt;
        particle.y += particle.vy * dt;
        particle.rotation += particle.spin * dt;
        var fade = clamp((particle.life - particle.age) / 190, 0, 1);
        magnetCtx.save();
        magnetCtx.globalAlpha = fade * .9;
        magnetCtx.translate(particle.x, particle.y);
        magnetCtx.rotate(particle.rotation);
        magnetCtx.shadowColor = particle.color;
        magnetCtx.shadowBlur = 8 * fade;
        magnetCtx.fillStyle = particle.color;
        magnetCtx.beginPath();
        if (particle.triangle) {
          magnetCtx.moveTo(0, -particle.size);
          magnetCtx.lineTo(particle.size * .82, particle.size * .65);
          magnetCtx.lineTo(-particle.size * .82, particle.size * .65);
          magnetCtx.closePath();
        } else magnetCtx.arc(0, 0, particle.size * .62, 0, Math.PI * 2);
        magnetCtx.fill();
        magnetCtx.restore();
        return true;
      });
      if (magnetParticles.length || magnetSource) magnetFrame = requestAnimationFrame(drawMagnetParticles);
      else drawMagnetParticles.lastTime = 0;
    }
    function roundedPath(context, x, y, w, h, r) {
      r = Math.min(r, w / 2, h / 2);
      context.beginPath();
      context.moveTo(x + r, y);
      context.lineTo(x + w - r, y);
      context.quadraticCurveTo(x + w, y, x + w, y + r);
      context.lineTo(x + w, y + h - r);
      context.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      context.lineTo(x + r, y + h);
      context.quadraticCurveTo(x, y + h, x, y + h - r);
      context.lineTo(x, y + r);
      context.quadraticCurveTo(x, y, x + r, y);
      context.closePath();
    }
    function buttonBitmap(button, w, h) {
      var ratio = dpr;
      var bitmap = document.createElement('canvas');
      bitmap.width = Math.max(1, Math.ceil(w * ratio));
      bitmap.height = Math.max(1, Math.ceil(h * ratio));
      var b = bitmap.getContext('2d');
      b.scale(ratio, ratio);
      var radius = h / 2;
      roundedPath(b, .5, .5, w - 1, h - 1, radius);
      b.save();
      b.shadowColor = 'rgba(116, 200, 232, .68)';
      b.shadowBlur = 15;
      var fill = b.createLinearGradient(0, 0, w, h);
      fill.addColorStop(0, '#8bdcf0');
      fill.addColorStop(.52, '#7cb5db');
      fill.addColorStop(1, '#7895bb');
      b.fillStyle = fill;
      b.fill();
      b.restore();
      roundedPath(b, .5, .5, w - 1, h - 1, radius);
      b.save();
      b.clip();
      var facetColors = ['rgba(211,248,255,.25)', 'rgba(71,188,255,.20)', 'rgba(34,82,209,.28)', 'rgba(6,52,147,.20)'];
      var facets = [
        [[0, 0], [w * .33, 0], [w * .22, h], [0, h]],
        [[w * .33, 0], [w * .66, h * .08], [w * .51, h], [w * .22, h]],
        [[w * .66, h * .08], [w, 0], [w, h], [w * .51, h]],
        [[w * .06, h * .12], [w * .48, h * .04], [w * .32, h * .42]]
      ];
      facets.forEach(function (points, index) {
        b.beginPath();
        b.moveTo(points[0][0], points[0][1]);
        for (var i = 1; i < points.length; i++) b.lineTo(points[i][0], points[i][1]);
        b.closePath();
        b.fillStyle = facetColors[index];
        b.fill();
      });
      b.strokeStyle = 'rgba(222, 250, 255, .42)';
      b.lineWidth = .7;
      [[0, 0, w * .22, h], [w * .33, 0, w * .22, h], [w * .66, h * .08, w, h]].forEach(function (line) {
        b.beginPath(); b.moveTo(line[0], line[1]); b.lineTo(line[2], line[3]); b.stroke();
      });
      b.restore();
      roundedPath(b, .5, .5, w - 1, h - 1, radius);
      b.strokeStyle = 'rgba(218, 249, 255, .9)';
      b.lineWidth = 1;
      b.stroke();
      var style = window.getComputedStyle(button);
      var label = (button.innerText || button.textContent || '').replace(/\s+/g, ' ').trim();
      b.save();
      b.font = style.font;
      b.textAlign = 'center';
      b.textBaseline = 'middle';
      b.fillStyle = '#24394b';
      b.shadowColor = 'rgba(236, 251, 255, .55)';
      b.shadowBlur = 4;
      if ('letterSpacing' in b) b.letterSpacing = style.letterSpacing;
      b.fillText(label, w / 2, h / 2 + .5, w - 12);
      b.restore();
      return bitmap;
    }
    function makePieces(w, h) {
      var cols = clamp(Math.round(w / 22), 4, 9);
      var rows = clamp(Math.round(h / 14), 2, 4);
      var grid = [];
      for (var row = 0; row <= rows; row++) {
        grid[row] = [];
        for (var col = 0; col <= cols; col++) {
          var x = w * col / cols;
          var y = h * row / rows;
          if (col > 0 && col < cols) x += (Math.random() - .5) * (w / cols) * .34;
          if (row > 0 && row < rows) y += (Math.random() - .5) * (h / rows) * .38;
          grid[row][col] = { x: x, y: y };
        }
      }
      var pieces = [];
      function add(a, b, c) {
        var cx = (a.x + b.x + c.x) / 3;
        var cy = (a.y + b.y + c.y) / 3;
        var angle = Math.atan2(cy - h / 2, cx - w / 2) + (Math.random() - .5) * 1.2;
        var speed = 105 + Math.random() * 190;
        pieces.push({
          points: [a, b, c], cx: cx, cy: cy,
          vx: Math.cos(angle) * speed + (Math.random() - .5) * 70,
          vy: Math.sin(angle) * speed - 28 + (Math.random() - .5) * 75,
          ax: (Math.random() - .5) * 90, spin: (Math.random() - .5) * 8,
          delay: Math.random() * 65, life: 570 + Math.random() * 240
        });
      }
      for (var r = 0; r < rows; r++) {
        for (var c = 0; c < cols; c++) {
          var a = grid[r][c], b = grid[r][c + 1], d = grid[r + 1][c], e = grid[r + 1][c + 1];
          if (Math.random() < .5) { add(a, b, e); add(a, e, d); }
          else { add(a, b, d); add(b, e, d); }
        }
      }
      return pieces;
    }
    function run(button) {
      if (active) return;
      active = true;
      magnetSource = null;
      magnetParticles.length = 0;
      magnetCtx.clearRect(0, 0, width, height);
      var rect = button.getBoundingClientRect();
      var w = Math.max(1, rect.width), h = Math.max(1, rect.height);
      var bitmap = buttonBitmap(button, w, h);
      var pieces = makePieces(w, h);
      var started = performance.now();
      button.classList.remove('is-reforming');
      button.classList.add('is-shattering');
      function frame(now) {
        var elapsed = now - started;
        ctx.clearRect(0, 0, width, height);
        pieces.forEach(function (piece) {
          var age = Math.max(0, elapsed - piece.delay);
          var t = age / 1000;
          var fade = clamp(1 - age / piece.life, 0, 1);
          if (!fade) return;
          var dx = piece.vx * t + .5 * piece.ax * t * t;
          var dy = piece.vy * t + .5 * 175 * t * t;
          var turn = piece.spin * t;
          ctx.save();
          ctx.globalAlpha = fade;
          ctx.translate(rect.left + piece.cx + dx, rect.top + piece.cy + dy);
          ctx.rotate(turn);
          ctx.beginPath();
          ctx.moveTo(piece.points[0].x - piece.cx, piece.points[0].y - piece.cy);
          ctx.lineTo(piece.points[1].x - piece.cx, piece.points[1].y - piece.cy);
          ctx.lineTo(piece.points[2].x - piece.cx, piece.points[2].y - piece.cy);
          ctx.closePath();
          ctx.clip();
          ctx.shadowColor = 'rgba(116, 200, 232, .82)';
          ctx.shadowBlur = 11 * fade;
          ctx.drawImage(bitmap, 0, 0, bitmap.width, bitmap.height, -w / 2, -h / 2, w, h);
          ctx.shadowBlur = 0;
          ctx.strokeStyle = 'rgba(190, 247, 255, ' + (.5 * fade) + ')';
          ctx.lineWidth = .8;
          ctx.stroke();
          ctx.restore();
        });
        if (elapsed < 820) requestAnimationFrame(frame);
        else {
          ctx.clearRect(0, 0, width, height);
          button.classList.remove('is-shattering');
          button.classList.add('is-reforming');
          setTimeout(function () { button.classList.remove('is-reforming'); }, 520);
          active = false;
        }
      }
      requestAnimationFrame(frame);
    }
    function perform(button) {
      var href = button.getAttribute('href');
      if (!href) return;
      if (href.charAt(0) === '#') {
        var target = $(href);
        if (target && lenis) lenis.scrollTo(target, { offset: 0, duration: 1.4 });
        else if (target) window.location.hash = href;
      } else window.location.assign(href);
    }
    window.addEventListener('pointermove', emitMagnetParticles, { passive: true });
    document.addEventListener('pointerout', function (event) { if (!event.relatedTarget) magnetSource = null; }, { passive: true });
    window.addEventListener('scroll', function () { magnetSource = null; }, { passive: true });
    window.addEventListener('blur', function () { magnetSource = null; }, { passive: true });
    buttons.forEach(function (button) {
      function updateCrackZone(event) {
        if (active || event.pointerType === 'touch') return;
        var rect = button.getBoundingClientRect();
        var relativeX = (event.clientX - rect.left) / Math.max(1, rect.width);
        button.classList.remove('crack-left', 'crack-center', 'crack-right');
        button.classList.add(relativeX < .34 ? 'crack-left' : (relativeX > .66 ? 'crack-right' : 'crack-center'));
      }
      button.addEventListener('pointerenter', updateCrackZone, { passive: true });
      button.addEventListener('pointermove', updateCrackZone, { passive: true });
      button.addEventListener('pointerleave', function () {
        button.classList.remove('crack-left', 'crack-center', 'crack-right');
      }, { passive: true });
      button.addEventListener('click', function (event) {
        if (REDUCED) return;
        event.preventDefault();
        event.stopPropagation();
        if (active) return;
        run(button);
        window.setTimeout(function () { perform(button); }, 845);
      });
    });
    window.addEventListener('resize', resize, { passive: true });
    resize();
  }
  /* ── 2 · CURSOR ────────────────────────────────────────── */
  function initCursor() {
    var dot = $('#cur'), ring = $('#curRing'), label = $('#curLabel');
    if (!dot || !ring || REDUCED) return;
    if (window.matchMedia('(hover: none), (pointer: coarse)').matches) return;
    var shown = false;
    addEventListener('mousemove', function (e) {
      var x = e.clientX, y = e.clientY;
      if (!shown) { shown = true; dot.style.opacity = '1'; ring.style.opacity = '1'; }
      dot.style.transform = ring.style.transform = 'translate3d(' + x + 'px,' + y + 'px,0)';
      if (PART) PART.setMouse((x / innerWidth) * 2 - 1, (y / innerHeight) * 2 - 1);
    }, { passive: true });
    document.addEventListener('mouseleave', function () {
      dot.style.opacity = '0'; ring.style.opacity = '0'; shown = false;
      if (PART && PART.clearMouse) PART.clearMouse();
    });
    var TARGETS = 'a, button, [data-cursor]';
    document.addEventListener('mouseover', function (e) {
      var t = e.target.closest ? e.target.closest(TARGETS) : null; if (!t) return;
      ring.classList.add('is-active'); label.textContent = t.getAttribute('data-cursor') || '';
    });
    document.addEventListener('mouseout', function (e) {
      var t = e.target.closest ? e.target.closest(TARGETS) : null; if (!t) return;
      ring.classList.remove('is-active');
    });
  }

  /* ── 3 · TIMELINE VALUE (T) from scroll ────────────────── */
  var SECS = [], tops = [], vh = innerHeight;
  function measure() {
    vh = innerHeight;
    SECS = $$('.sec');
    tops = SECS.map(function (s) { return s.getBoundingClientRect().top + (window.scrollY || window.pageYOffset); });
    if (PART) PART.resize();
  }
  function computeT(y) {
    if (!tops.length) return 0;
    var i = 0;
    while (i < tops.length - 1 && y >= tops[i + 1]) i++;
    var a = tops[i], b = (i < tops.length - 1) ? tops[i + 1] : a + vh;
    var f = clamp((y - a) / Math.max(1, b - a), 0, 1);
    return i + f;
  }
  var lastY = -1;
  function tick() {
    var y = lenis ? lenis.scroll : (window.scrollY || window.pageYOffset);
    var timelineT = computeT(y);
    if (PART) {
      PART.setT(timelineT);
      PART.setScroll(y, vh);
    }
    if (y !== lastY) { lastY = y; updateNav(y); }
    requestAnimationFrame(tick);
  }

  /* Highlight the current portfolio section as it enters the viewport. */
  var navLinks = {};
  function updateNav(y) {
    var active = 'home';
    ['about', 'projects', 'contact'].forEach(function (id) {
      var section = $('#' + id);
      if (section && y + vh * 0.38 >= section.getBoundingClientRect().top + y) active = id;
    });
    Object.keys(navLinks).forEach(function (k) { navLinks[k].classList.toggle('is-active', k === active); });
  }

  /* ── 4 · REVEALS ───────────────────────────────────────── */
  function initHyperText() {
    var targets = $$('.hud__nav a[data-nav], .hero__copy .eyebrow, .hero__copy .hero__body, .hero__copy .pill, .side__copy h2, .side__copy .body, .side__copy .pill, .side__work-link, .cta__copy .eyebrow, .cta__h, .contact__note, .foot__c, .foot__nav a');
    if (REDUCED || !targets.length || !('IntersectionObserver' in window)) return;
    var randomSet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

    function prepareText(element) {
      if (element.dataset.hyperTextReady) return;
      element.dataset.hyperTextReady = 'true';
      var walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      var nodes = [];
      while (walker.nextNode()) {
        if (walker.currentNode.nodeValue.trim()) nodes.push(walker.currentNode);
      }
      var characters = [];
      nodes.forEach(function (node) {
        var fragment = document.createDocumentFragment();
        Array.from(node.nodeValue).forEach(function (character) {
          if (/\s/.test(character)) {
            fragment.appendChild(document.createTextNode(character));
            return;
          }
          var span = document.createElement('span');
          span.className = 'hyper-text-char';
          span.dataset.hyperFinal = character;
          span.textContent = character;
          characters.push(span);
          fragment.appendChild(span);
        });
        node.parentNode.replaceChild(fragment, node);
      });
      element.__hyperTextCharacters = characters;
    }

    function animateText(element) {
      if (element.dataset.hyperTextDone) return;
      element.dataset.hyperTextDone = 'true';
      var characters = element.__hyperTextCharacters || [];
      if (!characters.length) return;
      var start = 0;
      var lastShuffle = 0;
      var duration = 920;
      function frame(now) {
        if (!start) start = now;
        var progress = Math.min(1, (now - start) / duration);
        if (now - lastShuffle >= 38 || progress === 1) {
          characters.forEach(function (character, index) {
            var reveal = Math.min(1, Math.max(0, progress * 1.35 - (index / characters.length) * .35));
            character.textContent = reveal >= 1
              ? character.dataset.hyperFinal
              : randomSet[Math.floor(Math.random() * randomSet.length)];
          });
          lastShuffle = now;
        }
        if (progress < 1) window.requestAnimationFrame(frame);
        else characters.forEach(function (character) { character.textContent = character.dataset.hyperFinal; });
      }
      window.requestAnimationFrame(frame);
    }

    targets.forEach(prepareText);
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        animateText(entry.target);
        observer.unobserve(entry.target);
      });
    }, { threshold: .18, rootMargin: '0px 0px -6% 0px' });
    targets.forEach(function (target) { observer.observe(target); });
  }

  function initReveals() {
    var targets = $$('.side__copy, .cta__copy');
    targets.forEach(function (el) { el.classList.add('rv'); });
    if (REDUCED || !('IntersectionObserver' in window)) { targets.forEach(function (el) { el.classList.add('is-in'); }); return; }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) en.target.classList.add('is-in'); });
    }, { threshold: 0.18, rootMargin: '0px 0px -8% 0px' });
    targets.forEach(function (el, i) { el.style.transitionDelay = (el.classList.contains('inv') ? (i % 5) * 70 : 0) + 'ms'; io.observe(el); });
  }

  /* ── 5 · HERO INTRO ────────────────────────────────────── */
  function heroIntro() {
    if (!hasGSAP || REDUCED) {
      $$('.hero__copy .eyebrow, .hero__body, .hero__copy .pill, .hero__socials').forEach(function (s) { s.style.opacity = 1; s.style.transform = 'none'; });
      return;
    }
    var tl = gsap.timeline({ defaults: { ease: EASE } });
    tl.to(['.hero__copy .eyebrow', '.hero__body', '.hero__copy .pill', '.hero__socials'], { opacity: 1, y: 0, duration: 1.1, stagger: 0.1 }, 0.35);
  }

  /* ── 6 · PORTFOLIO CONTENT ───────────────────────────── */

  /* ── 7 · PRELOADER ─────────────────────────────────────── */
  function initPreloader(done) {
    var pre = $('#pre'), fill = $('#preFill'), pct = $('#prePct'), status = $('#preStatus');
    if (!pre) { done(); return; }
    var msgs = ['PREPARING THE SCENE', 'LOADING THE PARTICLES', 'SETTING THE STAGE', 'READY TO EXPLORE'];
    var start = performance.now(), fontsReady = false, minTime = REDUCED ? 200 : 3700, finished = false;
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { fontsReady = true; }); else fontsReady = true;
    setTimeout(function () { fontsReady = true; }, 2500);            /* hard cap */
    function step() {
      if (finished) return;
      var el = performance.now() - start;
      var p = clamp(el / minTime, 0, fontsReady ? 1 : 0.9);
      var v = Math.round(p * 100);
      fill.style.width = v + '%'; pct.textContent = v;
      status.textContent = msgs[Math.min(msgs.length - 1, Math.floor(p * msgs.length))];
      if (p >= 1) { finished = true; finish(); return; }
      setTimeout(step, 40);
    }
    function finish() {
      document.body.classList.remove('is-loading');
      burstLetters();
      pre.classList.add('is-bursting');
      pre.classList.add('is-done');
      setTimeout(function () { pre.style.display = 'none'; }, 950);
      done();
    }
    function burstLetters() {
      var canvas = $('#preBurst'), h = $('#preLetterH'), a = $('#preLetterA');
      if (REDUCED || !canvas || !canvas.getContext || !h || !a) return;
      var ctx = canvas.getContext('2d');
      if (!ctx) return;
      var dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      var width = window.innerWidth, height = window.innerHeight;
      canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      var origins = [h, a].map(function (letter) {
        var r = letter.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      });
      var colors = ['#74c8e8', '#a9e8ff', '#d6e6f4', '#91add0', '#c8efff'];
      var particles = [];
      origins.forEach(function (origin) {
        for (var i = 0; i < 160; i++) {
          var angle = Math.random() * Math.PI * 2;
          var speed = 90 + Math.random() * 460;
          var sides = Math.random() < .16 ? 4 : 3;
          var points = [];
          for (var j = 0; j < sides; j++) {
            var a0 = (Math.PI * 2 * j / sides) + Math.random() * .55;
            var radius = 2.2 + Math.random() * 5.5;
            points.push([Math.cos(a0) * radius, Math.sin(a0) * radius]);
          }
          particles.push({
            x: origin.x + (Math.random() - .5) * 14, y: origin.y + (Math.random() - .5) * 14,
            vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 55,
            size: 2.2 + Math.random() * 5.5, points: points,
            rotation: Math.random() * Math.PI * 2, spin: (Math.random() - .5) * 15,
            color: colors[(Math.random() * colors.length) | 0], alpha: .78 + Math.random() * .22,
            glow: i % 3 === 0
          });
        }
      });
      var t0 = performance.now(), previous = t0, duration = 900;
      function draw(now) {
        var dt = Math.min((now - previous) / 1000, .04), elapsed = now - t0;
        previous = now;
        ctx.clearRect(0, 0, width, height);
        particles.forEach(function (p) {
          p.vy += 150 * dt; p.x += p.vx * dt; p.y += p.vy * dt;
          p.vx *= .997; p.vy *= .997; p.rotation += p.spin * dt;
          var fade = Math.max(0, 1 - Math.max(0, elapsed - 360) / (duration - 360));
          if (fade <= 0) return;
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rotation);
          ctx.globalAlpha = p.alpha * fade;
          ctx.fillStyle = p.color; ctx.strokeStyle = 'rgba(220,246,255,.78)'; ctx.lineWidth = .65;
          if (p.glow) { ctx.shadowColor = p.color; ctx.shadowBlur = 8; }
          ctx.beginPath();
          p.points.forEach(function (point, index) {
            if (index === 0) ctx.moveTo(point[0], point[1]); else ctx.lineTo(point[0], point[1]);
          });
          ctx.closePath(); ctx.fill(); ctx.stroke();
          ctx.globalAlpha *= .42; ctx.shadowBlur = 0;
          ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(p.points[0][0], p.points[0][1]); ctx.stroke();
          ctx.restore();
        });
        if (elapsed < duration) requestAnimationFrame(draw); else ctx.clearRect(0, 0, width, height);
      }
      requestAnimationFrame(draw);
    }
    step();
  }


  /* ── boot ──────────────────────────────────────────────── */

  function initProjectLoops() {
    $$('[data-project-loop-toggle]').forEach(function (button) {
      var video = document.getElementById(button.getAttribute('aria-controls'));
      if (!video) return;

      video.muted = true;
      function play() { video.play().catch(function () {}); }
      video.addEventListener('playing', function () {
        video.classList.add('is-playing-preview');
        button.textContent = 'Pause animation';
      });
      video.addEventListener('error', function () {
        video.classList.remove('is-playing-preview');
      });
      video.addEventListener('pause', function () { button.textContent = 'Play animation'; });
      button.addEventListener('click', function () {
        if (video.paused) play(); else video.pause();
      });
      button.hidden = false;
      if (!REDUCED) play();
    });
  }

  function initWorkPreviews() {
    var mobile = window.matchMedia('(max-width: 600px), (hover: none), (pointer: coarse)');
    var active = null;
    function select(next) {
      if (active === next) return;
      if (active) active.stop();
      active = next;
      if (active) active.play();
    }

    var previews = $$('.work-preview').map(function (preview) {
      var video = $('video', preview);
      var button = $('.work-preview__toggle', preview);
      var item = { card: preview.closest('.work-case'), play: play, stop: stop };

      video.muted = true;
      video.controls = false;
      button.hidden = false;

      function play() {
        video.play().catch(function () {});
      }

      function stop() {
        video.pause();
        if (video.currentTime > 0) video.currentTime = 0;
        button.setAttribute('aria-pressed', 'false');
      }

      video.addEventListener('playing', function () {
        button.setAttribute('aria-pressed', 'true');
      });
      video.addEventListener('ended', stop);
      button.addEventListener('click', function () {
        if (!video.paused) stop();
        else if (mobile.matches && active !== item) select(item);
        else play();
      });
      preview.addEventListener('pointerenter', function (event) {
        if (!REDUCED && !mobile.matches && event.pointerType !== 'touch') play();
      });
      preview.addEventListener('pointerleave', function () {
        if (!mobile.matches) stop();
      });

      return item;
    });

    var frame = 0;
    function schedule() {
      if (frame) return;
      frame = requestAnimationFrame(function () {
        frame = 0;
        if (!mobile.matches) { select(null); return; }
        if (REDUCED) return;

        var mostVisible = null;
        var largestOverlap = 48;
        var headerBottom = $('#hud').getBoundingClientRect().bottom;
        previews.forEach(function (item) {
          var rect = item.card.getBoundingClientRect();
          var overlap = Math.min(rect.bottom, innerHeight) - Math.max(rect.top, headerBottom);
          if (overlap > largestOverlap) {
            largestOverlap = overlap;
            mostVisible = item;
          }
        });
        select(mostVisible);
      });
    }
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    mobile.addEventListener('change', schedule);
    schedule();
  }

  function boot() {
    $$('.hud__nav a[data-nav]').forEach(function (a) { navLinks[a.getAttribute('data-nav')] = a; });
    initLenis();
    initShardButtons();
    initProjectLoops();
    initWorkPreviews();
    initCursor();
    initReveals();
    measure();
    window.addEventListener('resize', measure);
    if (hasGSAP) ScrollTrigger.addEventListener('refresh', measure);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure);
    setTimeout(measure, 1200);
    if (!REDUCED) requestAnimationFrame(tick);
    else { var y0 = window.scrollY || 0; var t0 = computeT(y0); if (PART) { PART.setT(t0); PART.setScroll(y0, vh); } window.addEventListener('scroll', function () { var y = window.scrollY || 0; var t = computeT(y); if (PART) { PART.setT(t); PART.setScroll(y, vh); PART.renderOnce(); } updateNav(y); }, { passive: true }); }
    initPreloader(function () { initHyperText(); heroIntro(); });
    window.__lenis = lenis; window.__T = function () { return computeT(lenis ? lenis.scroll : (window.scrollY || 0)); };
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
