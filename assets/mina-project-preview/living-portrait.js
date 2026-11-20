  // A deformable WebGL mesh blends the portrait's local PNG frames.
  (() => {
    const assetRoot = new URL('./portrait-assets/', document.currentScript.src);

    const RING = ['e', 'ene', 'ne', 'nne', 'n', 'nnw', 'nw', 'wnw', 'w', 'wsw', 'sw', 'ssw', 's', 'sse', 'se', 'ese'];
    const EYEFILE = {e: 'right', ene: 'ene', ne: 'upright', nne: 'nne', n: 'up', nnw: 'nnw', nw: 'wnw', wnw: 'wnw', w: 'left', wsw: 'wsw', sw: 'downleft', ssw: 'ssw', s: 'down', sse: 'sse', se: 'downright', ese: 'ese'};
    const EYE_CENTER = [.52, .345];

    const OVER = 1.7, N = 72, M = N + 1, SPAN = OVER / N, ORIGIN = .5 - OVER / 2;
    const WOBBLE = 2.3 * 2 * Math.PI, REACH = .085 / SPAN, C = REACH * WOBBLE, GAMMA = 2 * .14 * WOBBLE, NU = .2 * C;

    const wrap = document.getElementById('magnetWrap'), canvas = document.getElementById('faceGl');
    const fallback = document.getElementById('faceFallback');
    const fly = document.getElementById('faceFly'), hand = document.getElementById('faceHand');
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!wrap || !canvas || !fallback || !fly || !hand) return;
    const cropStyle = getComputedStyle(canvas.parentElement);
    const cropCenterY = parseFloat(cropStyle.getPropertyValue('--portrait-crop-center-y')) / 100;
    const cropRadius = parseFloat(cropStyle.getPropertyValue('--portrait-crop-radius')) / 100;
    const gl = canvas.getContext('webgl', {alpha: true, premultipliedAlpha: true, antialias: true});
    if (!gl) return;

    const VS = `attribute vec2 a, d; attribute float s; varying vec2 vUv; varying float vS;
      uniform vec2 lean; uniform float overS;
      void main(){ vUv = a; vS = s; vec2 p = a + d + lean; gl_Position = vec4(vec2(p.x-.5, .5-p.y)*2./overS, 0., 1.); }`;
    const FS = `precision highp float; varying vec2 vUv; varying float vS;
      uniform sampler2D faceA, faceB;
      uniform float fade;
      void main(){
        if(vUv.x<0.||vUv.y<0.||vUv.x>1.||vUv.y>1.){ gl_FragColor = vec4(0.); return; }
        vec4 c = mix(texture2D(faceA,vUv), texture2D(faceB,vUv), fade);
        if(c.a<.004){ gl_FragColor = vec4(0.); return; }
        gl_FragColor = vec4(c.rgb*vS, c.a);
      }`;
    const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) console.error(gl.getShaderInfoLog(o)); return o; };
    const pr = gl.createProgram();
    gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) return;
    gl.useProgram(pr);
    const U = {over_: gl.getUniformLocation(pr, 'overS')};
    for (const n of ['lean', 'faceA', 'faceB', 'fade']) U[n] = gl.getUniformLocation(pr, n);
    gl.uniform1f(U.over_, OVER);
    gl.uniform1i(U.faceA, 0); gl.uniform1i(U.faceB, 1); 

    // ---- the sheet: a damped wave equation on the displacement of each node ----
    const count = M * M, ux = new Float32Array(count), uy = new Float32Array(count);
    let vx = new Float32Array(count), vy = new Float32Array(count);
    let nextVx = new Float32Array(count), nextVy = new Float32Array(count);
    const rest = new Float32Array(count * 2), dyn = new Float32Array(count * 3);
    const sx = new Float32Array(count), sy = new Float32Array(count);
    const MAX_PULL = .24;
    const MAX_EDGE_STRETCH = SPAN * .55;
    for (let j = 0, k = 0; j < M; j++) for (let i = 0; i < M; i++) { rest[k++] = ORIGIN + i * SPAN; rest[k++] = ORIGIN + j * SPAN; }
    const idx = new Uint16Array(N * N * 6);
    for (let j = 0, k = 0; j < N; j++) for (let i = 0; i < N; i++) { const a = j * M + i, b = a + 1, c = a + M, d = c + 1; idx[k++] = a; idx[k++] = c; idx[k++] = b; idx[k++] = b; idx[k++] = c; idx[k++] = d; }
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer()); gl.bufferData(gl.ARRAY_BUFFER, rest, gl.STATIC_DRAW);
    const aa = gl.getAttribLocation(pr, 'a'); gl.enableVertexAttribArray(aa); gl.vertexAttribPointer(aa, 2, gl.FLOAT, false, 0, 0);
    const dynBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, dynBuf); gl.bufferData(gl.ARRAY_BUFFER, dyn, gl.DYNAMIC_DRAW);
    const ad = gl.getAttribLocation(pr, 'd'), as = gl.getAttribLocation(pr, 's');
    gl.enableVertexAttribArray(ad); gl.vertexAttribPointer(ad, 2, gl.FLOAT, false, 12, 0);
    gl.enableVertexAttribArray(as); gl.vertexAttribPointer(as, 1, gl.FLOAT, false, 12, 8);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer()); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); gl.clearColor(0, 0, 0, 0);

    let brush = null;
    function takeHold(u, v, radius = .22) {
      const list = [];
      for (let j = 1; j < N; j++) for (let i = 1; i < N; i++) {
        const k = j * M + i;
        const dx = rest[k * 2] - u, dy = rest[k * 2 + 1] - v;
        const weight = Math.exp(-(dx * dx + dy * dy) / (radius * radius));
        if (weight > .02) list.push([k, weight]);
      }
      brush = {u, v, list, px: 0, py: 0};
    }

    function moveBrush(u, v) {
      const dx = u - brush.u, dy = v - brush.v;
      const distance = Math.hypot(dx, dy);
      const scale = distance ? -MAX_PULL * Math.expm1(-distance / MAX_PULL) / distance : 1;
      brush.px = dx * scale;
      brush.py = dy * scale;
    }

    function safeStretchScale() {
      // Bound both columns of each triangle's displacement gradient so it cannot fold over.
      let maxEdgeSquared = MAX_EDGE_STRETCH ** 2;
      for (let j = 0; j < M; j++) for (let i = 0; i < M; i++) {
        const k = j * M + i;
        if (i < N) {
          const dx = sx[k + 1] - sx[k], dy = sy[k + 1] - sy[k];
          maxEdgeSquared = Math.max(maxEdgeSquared, dx * dx + dy * dy);
        }
        if (j < N) {
          const dx = sx[k + M] - sx[k], dy = sy[k + M] - sy[k];
          maxEdgeSquared = Math.max(maxEdgeSquared, dx * dx + dy * dy);
        }
      }
      return MAX_EDGE_STRETCH / Math.sqrt(maxEdgeSquared);
    }

    const H = 1 / 240; let simLeft = 0;
    function step(dt) {
      const c2 = C * C, wo2 = WOBBLE * WOBBLE;
      // The border stays pinned. All interior forces use the same previous velocities.
      for (let j = 1; j < N; j++) for (let i = 1; i < N; i++) {
        const k = j * M + i, l = k - 1, r = k + 1, t = k - M, b = k + M;
        const lx = ux[l] + ux[r] + ux[t] + ux[b] - 4 * ux[k], ly = uy[l] + uy[r] + uy[t] + uy[b] - 4 * uy[k];
        const lvx = vx[l] + vx[r] + vx[t] + vx[b] - 4 * vx[k], lvy = vy[l] + vy[r] + vy[t] + vy[b] - 4 * vy[k];
        nextVx[k] = vx[k] + (c2 * lx - wo2 * ux[k] - GAMMA * vx[k] + NU * lvx) * dt;
        nextVy[k] = vy[k] + (c2 * ly - wo2 * uy[k] - GAMMA * vy[k] + NU * lvy) * dt;
      }
      if (brush) for (const [k, weight] of brush.list) {
        const stiffness = 3000 * weight, damping = 90 * weight;
        // Each grab pulls from the rest shape, so re-grabbing cannot stack displacement.
        nextVx[k] += ((brush.px * weight - ux[k]) * stiffness - vx[k] * damping) * dt;
        nextVy[k] += ((brush.py * weight - uy[k]) * stiffness - vy[k] * damping) * dt;
      }
      for (let j = 1; j < N; j++) for (let i = 1; i < N; i++) {
        const k = j * M + i;
        ux[k] += nextVx[k] * dt;
        uy[k] += nextVy[k] * dt;
      }
      const previousVx = vx, previousVy = vy;
      vx = nextVx; vy = nextVy;
      nextVx = previousVx; nextVy = previousVy;
    }
    // a shove from nowhere: sneezes, jolts, a fly landing
    function poke(u, v, dx, dy, radius = .09) {
      for (let j = 1; j < N; j++) for (let i = 1; i < N; i++) {
        const k = j * M + i;
        const ax = rest[k * 2] - u, ay = rest[k * 2 + 1] - v, w = Math.exp(-(ax * ax + ay * ay) / (radius * radius));
        vx[k] += dx * w; vy[k] += dy * w;
      }
    }

    // ---- pictures ----
    const tex = {};
    const param = () => { gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); };
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    const load = name => new Promise(resolve => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = new URL(`${name}.webp`, assetRoot).href;
    });
    const textureSize = innerWidth < 760 ? 512 : 768;
    const textureCanvas = document.createElement('canvas');
    textureCanvas.width = textureCanvas.height = textureSize;
    const textureContext = textureCanvas.getContext('2d', {alpha: true});
    if (!textureContext) return;

    function upload(name, img) {
      const texture = gl.createTexture();
      if (!texture) return;
      textureContext.clearRect(0, 0, textureSize, textureSize);
      textureContext.drawImage(img, 0, 0, textureSize, textureSize);
      gl.activeTexture(gl.TEXTURE5);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, textureCanvas);
      param();
      tex[name] = texture;
    }

    function hitMap(img) {
      const a = document.createElement('canvas'); a.width = a.height = 128;
      const ac = a.getContext('2d', {willReadFrequently: true}); ac.drawImage(img, 0, 0, 128, 128);
      alphaMap = ac.getImageData(0, 0, 128, 128).data;
    }

    const NOSE = [.52, .415];
    const CHEEK = [.64, .465];
    // [picture or eye cell, crossfade ms, hold ms, extras]
    const ACTS = {
      yawn: [['yawn1', 140, 240], ['yawn2', 140, 200], ['yawn', 170, 900], ['yawn2', 150, 130], ['yawn4', 180, 700]],
      whistle: [['whistle1', 150, 700], ['whistle2', 100, 700], ['whistle1', 100, 620], ['whistle2', 100, 620]],
      shifty: [['eye:w', 60, 520], ['eye:e', 60, 600], ['eye:w', 60, 400], ['eye:rest', 60, 260]],
      roll: [['eye:w', 70, 200], ['eye:wnw', 50, 55], ['eye:nw', 50, 55], ['eye:nnw', 50, 60], ['eye:n', 50, 140], ['eye:nne', 50, 60], ['eye:ne', 50, 55], ['eye:ene', 50, 55], ['eye:e', 50, 240], ['eye:rest', 90, 200], ['deadpan', 120, 700]],
      sneeze: [['sneeze1', 130, 1060], ['sneeze2', 50, 300, {jolt: [...NOSE, 0, 1.5, .34], lean: [0, .03]}], ['dizzy', 110, 620], ['shy', 140, 650]],
      gum: [['gum1', 130, 800], ['gum2', 180, 460], ['gum3', 200, 760], ['gumpop', 40, 1300, {jolt: [.52, .49, 0, -1.1, .3]}], ['deadpan', 200, 700], ['laugh', 130, 700]],
      flirt: [['smug', 130, 520], ['kiss', 120, 560], ['hearts', 120, 900], ['shy', 160, 620]],
      cheeky: [['tongue', 110, 900], ['grin', 120, 620]],
      cross: [['cross', 140, 800], ['fish', 130, 800], ['puff', 120, 700, {jolt: [.52, .48, 0, -.25, .3]}], ['laugh', 90, 800]],
      sad: [['raised', 140, 500], ['cry', 240, 1500], ['shy', 200, 520]],
      wow: [['stars', 130, 1000], ['grin', 140, 640]],
    };
    const ROTATION = ['yawn', 'shifty', 'gum', 'fly', 'flirt', 'roll', 'sneeze', 'tug', 'cross', 'whistle', 'cheeky', 'wow', 'sad'];
    const ZONES = {
      hover: {nose: 'cross', mouth: 'kiss'},
      tap: {brow: 'angry', eyeL: 'ouch', eyeR: 'ouch', nose: 'act:sneeze', mouth: 'tongue', cheek: 'puff', chin: 'laugh'}
    };
    const zoneAt = (u, v) => {
      if (u < .31 || u > .71 || v < .25 || v > .61) return null;
      if (v < .324) return 'brow';
      if (v < .375 && u > .38 && u < .486) return 'eyeL';
      if (v < .375 && u > .55 && u < .655) return 'eyeR';
      if (Math.abs(u - NOSE[0]) < .055 && v < .449) return 'nose';
      if (Math.abs(u - .52) < .095 && v >= .453 && v < .525) return 'mouth';
      return v >= .525 ? 'chin' : 'cheek';
    };

    // state
    let alphaMap = null, loadingComplete = false, rendered = false;
    let tStart = 0, last = performance.now();
    let [pu, pv] = EYE_CENTER;
    let onHead = false, zone = null, zoneSince = 0;
    let lastInput = -Infinity, drag = null, speed = 0, shake = 0;
    let moodFace = null, moodUntil = 0, pulls = [], lookAt = null;
    let act = null, actI = 0, actT = 0, actFromTap = false, rotationIndex = 0, nextIdle = 2200;
    let faceA = 'rest', faceB = 'rest', fadeT = 0, fadeMs = 1;
    let logical = 'rest', logicalMs = 70, eyeNow = 'rest', eyeNowMs = 40;
    let leanX = 0, leanY = 0, lvX = 0, lvY = 0, wantLean = [0, 0];

    const fileOf = cell => cell === 'rest' ? 'rest' : EYEFILE[cell];
    const setFace = (n, ms) => { logical = n; logicalMs = ms; };
    const setEye = (cell, ms) => { if (tex[fileOf(cell)]) { eyeNow = cell; eyeNowMs = ms; } };
    // one picture on screen at a time, always
    function show(n, ms, now) {
      if (!tex[n]) n = 'rest';
      if (n === faceB) return;
      faceA = (now - fadeT) / fadeMs > .5 ? faceB : faceA; faceB = n; fadeT = now; fadeMs = Math.min(70, Math.max(1, ms));
    }
    function compose(now) {
      if (logical !== 'rest') show(logical, logicalMs, now);
      else show(fileOf(eyeNow), eyeNowMs, now);
    }
    const ringFor = (dx, dy) => RING[Math.round(((Math.atan2(-dy, dx) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI / 8)) % 16];

    function startAct(name, now, fromTap = false) {
      endAct();
      act = name === 'fly' ? flyAct() : name === 'tug' ? tugAct() : ACTS[name];
      actFromTap = fromTap;
      actI = -1; actT = now; advance(now);
    }
    function endAct() {
      act = null;
      actFromTap = false;
      lookAt = null;
      wantEyes = null;
      wantLean = [0, 0];
      fly.style.opacity = 0;
      hand.style.opacity = 0;
      hand.classList.remove('shut');
      handGrip = false;
      if (handHeld) { handHeld = false; brush = null; }
    }
    function advance(now) {
      actI++;
      if (!act || actI >= act.length) { endAct(); return; }
      const [show, fade, , x] = act[actI]; actT = now;
      if (show.startsWith('eye:')) { setFace('rest', fade, now); setEye(show.slice(4), fade, now); wantEyes = show.slice(4); }
      else { wantEyes = null; setFace(show, fade, now); }
      if (x) {
        if (x.jolt) poke(...x.jolt);
        wantLean = x.lean || [0, 0];
        if (x.call) x.call(now);
      } else wantLean = [0, 0];
    }
    let wantEyes = null, handHeld = false, handFrom = [1.4, .9], handTo = [1.4, .9], flyFrom = [1.4, 0], flyTo = [1.4, 0], moveT = 0, moveMs = 1;
    const place = (el, u, v) => { el.style.left = ((u - .5) * 100 + 50) + '%'; el.style.top = ((v - .5) * 100 + 50) + '%'; };
    const moveHand = (u, v, ms) => (now) => { handFrom = handTo; handTo = [u, v]; moveT = now; moveMs = ms; };
    const moveFly = (u, v, ms) => (now) => { flyFrom = flyTo; flyTo = [u, v]; moveT = now; moveMs = ms; };

    function flyAct() {
      flyFrom = flyTo = [1.35, .02];
      fly.style.opacity = 1;
      lookAt = () => flyPos;
      const hop = (u, v, ms) => ['rest', 40, ms, {call: moveFly(u, v, ms * .9)}];
      return [hop(.92, .2, 620), hop(.1, .32, 680), hop(.9, .66, 640), hop(.16, .62, 600), hop(...NOSE, 520),
        ['cross', 110, 950, {jolt: [...NOSE, 0, .28, .05]}],
        ['whistle1', 90, 340, {call: moveFly(.5, .25, 280)}], ['deadpan', 110, 480, {call: moveFly(...NOSE, 320)}],
        ['cross', 90, 560, {jolt: [...NOSE, 0, .28, .05]}],
        ['whistle2', 90, 620, {call: moveFly(1.5, -.35, 600)}], ['smug', 120, 600]];
    }
    function tugAct() {
      handFrom = handTo = [1.3, .78];
      hand.style.opacity = 1;
      const g = (u, v, ms, face, grip) => [face, 90, ms, {call: now => { moveHand(u, v, ms * .8)(now); handGrip = grip; }}];
      return [g(...CHEEK, 760, 'eye:se', false), g(...CHEEK, 240, 'shock', 'on'),
        g(.95, .42, 620, 'ouch', 'pull'), g(.86, .48, 240, 'ouch', 'pull'), g(.98, .4, 240, 'ouch', 'pull'), g(.9, .44, 260, 'ouch', 'pull'),
        g(1.4, .22, 1000, 'dizzy', 'off'), ['angry', 120, 620]];
    }
    let handGrip = false;

    // ---- input ----
    const toUv = (x, y) => { const r = canvas.getBoundingClientRect(); return [((x - r.left) / r.width - .5) * OVER + .5, ((y - r.top) / r.height - .5) * OVER + .5]; };
    function solid(u, v) {
      if (!alphaMap || u < 0 || v < 0 || u >= 1 || v >= 1) return false;
      if (Math.hypot(u - .5, v - cropCenterY) > cropRadius) return false;
      return alphaMap[((v * 128 | 0) * 128 + (u * 128 | 0)) * 4 + 3] > 40;
    }

    function interruptIdle() {
      if (act && !actFromTap) endAct();
    }

    addEventListener('pointermove', e => {
      if (drag ? drag.id !== e.pointerId : e.pointerType === 'touch') return;
      const now = performance.now();
      const dx = e.movementX || 0, dy = e.movementY || 0;
      [pu, pv] = toUv(e.clientX, e.clientY);
      speed += Math.hypot(dx, dy) * .004;
      lastInput = now;
      interruptIdle();
      onHead = solid(pu, pv);
      const z = onHead ? zoneAt(pu, pv) : null;
      if (z !== zone) { zone = z; zoneSince = now; }
      wrap.style.cursor = drag ? 'grabbing' : onHead ? 'grab' : '';
      // a cursor on the skin rubs it along
      if (onHead && !drag) poke(pu, pv, dx * .00035, dy * .00035, .07);
      if (drag && brush) moveBrush(pu, pv);
    });
    wrap.addEventListener('pointerdown', e => {
      if (drag || e.button !== 0) return;
      const now = performance.now(), [u, v] = toUv(e.clientX, e.clientY);
      if (!solid(u, v)) return;
      lastInput = now;
      endAct();
      drag = {id: e.pointerId, time: now, u, v};
      [pu, pv] = [u, v];
      takeHold(u, v);
      moodFace = null;
      wrap.setPointerCapture(e.pointerId);
      wrap.style.cursor = 'grabbing';
      e.preventDefault();
    });

    function resetPointer() {
      [pu, pv] = EYE_CENTER;
      zone = null;
      onHead = false;
      wrap.style.cursor = '';
    }

    function release(e) {
      if (!drag || drag.id !== e.pointerId) return;
      const {u, v, time} = drag;
      const now = performance.now(), pull = Math.hypot(brush.px, brush.py);
      drag = null;
      brush = null;
      if (e.pointerType === 'touch') resetPointer();
      else wrap.style.cursor = onHead ? 'grab' : '';
      if (e.type !== 'pointerup') return;

      lastInput = now;
      pulls = pulls.filter(t => now - t < 14000);
      if (pull < .03 && now - time < 380) {
        const response = ZONES.tap[zoneAt(u, v)];
        if (!response) return;
        if (response.startsWith('act:')) startAct(response.slice(4), now, true);
        else { moodFace = response; moodUntil = now + 1100; }
        poke(u, v, 0, .5, .06);
        return;
      }
      pulls.push(now);
      const n = pulls.length;
      moodFace = n >= 8 ? 'cry' : n >= 5 ? 'angry' : pull > .18 ? 'dizzy' : pull > .1 ? 'scrunch' : 'deadpan';
      moodUntil = now + (n >= 5 ? 2600 : 700 + pull * 2800);
    }
    wrap.addEventListener('pointerup', release);
    wrap.addEventListener('pointercancel', release);
    wrap.addEventListener('lostpointercapture', release);
    document.documentElement.addEventListener('pointerleave', () => { if (!drag) resetPointer(); });
    addEventListener('blur', () => {
      if (drag) { drag = null; brush = null; }
      resetPointer();
    });
    document.querySelectorAll('.contact-btn').forEach(b => {
      b.addEventListener('pointerenter', () => {
        const now = performance.now();
        lastInput = now;
        interruptIdle();
        moodFace = 'hearts';
        moodUntil = Infinity;
      });
      b.addEventListener('pointerleave', () => { moodFace = 'grin'; moodUntil = performance.now() + 700; });
    });
    let lastScroll = scrollY, scrollUntil = 0;
    addEventListener('scroll', () => {
      const now = performance.now();
      if (Math.abs(scrollY - lastScroll) > 2) { scrollUntil = now + 500; lastScroll = scrollY; }
      lastInput = now;
      interruptIdle();
    }, {passive: true});

    let flyPos = [1.4, 0], visible = true;
    new IntersectionObserver(es => { visible = es[0].isIntersecting; }, {threshold: 0}).observe(wrap);
    new ResizeObserver(() => { const r = Math.min(devicePixelRatio || 1, 2), b = canvas.getBoundingClientRect(); canvas.width = b.width * r; canvas.height = b.height * r; gl.viewport(0, 0, canvas.width, canvas.height); }).observe(canvas);

    // ---- frame ----
    function frame(now) {
      if (gl.isContextLost()) return;
      requestAnimationFrame(frame);
      const dt = Math.max(0, Math.min(.04, (now - last) / 1000)); last = now;
      if (!visible || !canvas.width || !canvas.height) return;
      const f = r => 1 - Math.exp(-dt * r);

      speed *= Math.exp(-dt * 6); shake += ((speed > 1.5 ? 1 : 0) - shake) * f(speed > 1.5 ? 1.2 : .9);

      // acts when the page goes quiet
      if (act) { if (now - actT > act[actI][2]) advance(now); }
      else if (loadingComplete && !reduced && !drag && now - Math.max(lastInput, tStart) > nextIdle) {
        startAct(ROTATION[rotationIndex], now);
        rotationIndex = (rotationIndex + 1) % ROTATION.length;
        lastInput = now;
        nextIdle = 30000 + Math.random() * 15000;
      }

      // moving props
      const mk = Math.min(1, (now - moveT) / moveMs), me = mk * mk * (3 - 2 * mk);
      flyPos = [flyFrom[0] + (flyTo[0] - flyFrom[0]) * me + Math.sin(now * .02) * .012 * (1 - (mk >= 1 ? .85 : 0)), flyFrom[1] + (flyTo[1] - flyFrom[1]) * me + Math.cos(now * .027) * .012 * (1 - (mk >= 1 ? .85 : 0))];
      place(fly, flyPos[0], flyPos[1]);
      const hp = [handFrom[0] + (handTo[0] - handFrom[0]) * me, handFrom[1] + (handTo[1] - handFrom[1]) * me];
      place(hand, hp[0], hp[1]);
      if (handGrip === 'on' && !handHeld) { takeHold(hp[0], hp[1], .22); handHeld = true; hand.classList.add('shut'); handGrip = 'pull'; }
      if (handHeld && brush) moveBrush(hp[0], hp[1]);
      if (handGrip === 'off' && handHeld) { handHeld = false; brush = null; hand.classList.remove('shut'); handGrip = false; }

      // which picture
      let want = 'rest';
      const pull = brush ? Math.hypot(brush.px, brush.py) : 0;
      if (act) want = null;
      else if (drag) want = pull > .18 ? 'scared' : pull > .1 ? 'ouch' : pull > .02 ? 'shock' : 'rest';
      else if (moodFace && now < moodUntil) want = moodFace;
      else if (shake > .92) want = 'sick';
      else if (zone && now - zoneSince > 80 && ZONES.hover[zone]) want = ZONES.hover[zone];
      if (want) setFace(want, want === 'rest' ? 110 : 90, now);

      // Gaze frames apply while the face has no expression.
      const neutral = logical === 'rest';
      if (neutral) {
        if (wantEyes) setEye(wantEyes, 60, now);
        else {
          let target;
          if (lookAt) { const p = lookAt(); target = [p[0] - EYE_CENTER[0], p[1] - EYE_CENTER[1]]; }
          else if (now < scrollUntil) target = [0, 1];
          else target = [pu - EYE_CENTER[0], pv - EYE_CENTER[1]];
          setEye(Math.hypot(target[0], target[1]) < .13 ? 'rest' : ringFor(target[0], target[1]), 50, now);
        }
      }

      compose(now);

      // the head leans toward the pull, the cursor, and whatever the act asks
      const tx = (brush ? brush.px * .16 : (pu - EYE_CENTER[0]) * .012) + wantLean[0] + Math.sin(now * .0009) * .0015;
      const ty = (brush ? brush.py * .16 : (pv - EYE_CENTER[1]) * .008) + wantLean[1] + Math.sin(now * .0013) * .0022;
      lvX += ((tx - leanX) * 70 - lvX * 8) * dt; lvY += ((ty - leanY) * 70 - lvY * 8) * dt;
      leanX += lvX * dt; leanY += lvY * dt;

      // skin
      simLeft += dt;
      let steps = 0;
      while (simLeft >= H && steps < 9) { step(H); simLeft -= H; steps++; }
      if (steps === 9) simLeft = 0;
      for (let j = 0; j < M; j++) for (let i = 0; i < M; i++) {
        const k = j * M + i, edge = i === 0 || j === 0 || i === N || j === N;
        sx[k] = edge ? ux[k] : (ux[k] * 4 + ux[k - 1] + ux[k + 1] + ux[k - M] + ux[k + M]) / 8;
        sy[k] = edge ? uy[k] : (uy[k] * 4 + uy[k - 1] + uy[k + 1] + uy[k - M] + uy[k + M]) / 8;
      }
      const stretchScale = safeStretchScale();
      for (let k = 0, o = 0; k < count; k++) {
        dyn[o++] = sx[k] * stretchScale;
        dyn[o++] = sy[k] * stretchScale;
        const r = k % M, c = k / M | 0;
        let sh = 1;
        if (r > 0 && r < N && c > 0 && c < N) sh = Math.max(.86, Math.min(1.16, 1 - ((sx[k + 1] - sx[k - 1]) + (sy[k + M] - sy[k - M])) * stretchScale * 1.8));
        dyn[o++] = sh;
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, dynBuf); gl.bufferSubData(gl.ARRAY_BUFFER, 0, dyn);

      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex[faceA] || tex.rest);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, tex[faceB] || tex.rest);
      gl.uniform1f(U.fade, Math.min(1, (now - fadeT) / fadeMs));
      gl.uniform2f(U.lean, leanX, leanY);
      gl.drawElements(gl.TRIANGLES, idx.length, gl.UNSIGNED_SHORT, 0);
      if (!rendered) {
        rendered = true;
        fallback.style.visibility = 'hidden';
      }
    }

    canvas.addEventListener('webglcontextlost', () => {
      canvas.style.visibility = 'hidden';
      fallback.style.visibility = 'visible';
      drag = null;
      brush = null;
      endAct();
      resetPointer();
    });

    (async () => {
      const base = await load('rest');
      if (!base) return;
      upload('rest', base); hitMap(base);
      if (!tex.rest) return;
      tStart = performance.now();
      requestAnimationFrame(frame);

      // Deliver the interactive frames first, then load the remaining idle sequences.
      const names = [...new Set([
        ...Object.values(EYEFILE), ...Object.values(ZONES.hover),
        ...Object.values(ZONES.tap).filter(name => !name.startsWith('act:')),
        'shock', 'scared', 'scrunch', 'sick', 'hearts', 'grin',
        ...Object.values(ACTS).flatMap(frames => frames.map(([name]) => name))
          .filter(name => !name.startsWith('eye:')),
      ])];
      let index = 0;
      await Promise.all(Array.from({length: 4}, async () => {
        while (index < names.length && !gl.isContextLost()) {
          const name = names[index++];
          const img = await load(name);
          if (img && !gl.isContextLost()) upload(name, img);
        }
      }));
      loadingComplete = true;
    })();
  })();
