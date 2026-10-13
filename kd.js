/* KD Signature: page-local behaviour. The engine (scrollcraft.js) is untouched;
   everything here reads the --sc-p it publishes on each act.

   1. The waterline bar: a live wave along the bar's bottom edge whose
      amplitude follows scroll speed, re-inked for each ground it crosses.
   2. The dining-room caption that flips when the golden wipe has landed.
   3. The water: a small CPU ripple simulation rendered through WebGL over the
      club's own sunset pool. Pointer or finger stirs it. In the dive act the
      scroll takes the camera under the surface and back up into the night. */
(function () {
  'use strict';
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var phone = function () { return innerWidth <= 860; };
  var clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  var smooth = function (a, b, x) { var t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  var actP = function (el) { var v = parseFloat(el.style.getPropertyValue('--sc-p')); return isNaN(v) ? 0 : v; };

  /* ------------------------------------------------------ 1. waterline bar */
  var bar = document.querySelector('.bar');
  var wavePath = bar.querySelector('.bar__wave path');
  var sections = Array.prototype.slice.call(document.querySelectorAll('main > section'));
  var navLinks = Array.prototype.slice.call(bar.querySelectorAll('.bar__nav a'));
  var lastY = scrollY, amp = 0.6, phase = 0, lastT = performance.now();

  function barTone() {
    var probe = 34, current = null;
    for (var i = 0; i < sections.length; i++) {
      var r = sections[i].getBoundingClientRect();
      if (r.top <= probe && r.bottom > probe) { current = sections[i]; break; }
    }
    if (!current) return;
    // A pinned stage keeps its own section under the bar for its whole travel.
    var tone = current.getAttribute('data-tone') || 'dark';
    var mode = current.getAttribute('data-mode') || 'solid';
    if (current.classList.contains('dive')) {
      // under water the bar floats clear; the copy layer carries the scene
      mode = 'clear';
    }
    if (bar.getAttribute('data-tone') !== tone) bar.setAttribute('data-tone', tone);
    if (bar.getAttribute('data-mode') !== mode) bar.setAttribute('data-mode', mode);
    var id = current.id;
    navLinks.forEach(function (a) {
      var on = a.getAttribute('href') === '#' + id;
      if (on) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current');
    });
  }

  function barFrame(t) {
    var dt = Math.min(64, t - lastT); lastT = t;
    var y = scrollY, v = Math.abs(y - lastY) / Math.max(dt, 1); lastY = y;
    var target = reduce ? 0.5 : Math.min(5.5, 0.6 + v * 2.2);
    amp += (target - amp) * (target > amp ? 0.25 : 0.04);
    phase += dt * (0.0016 + v * 0.0009);
    var d = 'M0 6', n = 48;
    for (var i = 1; i <= n; i++) {
      var x = i / n * 1000;
      var w = Math.sin(i * 0.55 + phase) * 0.62 + Math.sin(i * 1.31 - phase * 1.7) * 0.38;
      d += ' L' + x.toFixed(1) + ' ' + (6 + w * amp).toFixed(2);
    }
    wavePath.setAttribute('d', d);
    barTone();
    requestAnimationFrame(barFrame);
  }
  requestAnimationFrame(barFrame);

  /* ------------------------------------- 1b. the name always fits the screen */
  // Fluid type can still overflow when the phone's text size is raised, so the
  // title is measured and stepped down until its longest word fits.
  var title = document.querySelector('.hero__title');
  function fitTitle() {
    if (!title) return;
    title.style.fontSize = '';
    var size = parseFloat(getComputedStyle(title).fontSize), guard = 40;
    while (title.scrollWidth > title.clientWidth + 1 && guard-- > 0) { size *= 0.96; title.style.fontSize = size + 'px'; }
  }
  fitTitle();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitTitle);
  addEventListener('resize', fitTitle, { passive: true });

  /* ----------------------------------------------- 2. the room caption flip */
  var tableAct = document.querySelector('#table');
  var room = document.querySelector('.room');
  if (tableAct && room) {
    (function roomTick() {
      room.classList.toggle('is-gold', actP(tableAct) > 0.55);
      requestAnimationFrame(roomTick);
    })();
  }

  /* ------------------------------------------------------------- 3. water */
  var VS = 'attribute vec2 p; varying vec2 vUv; void main(){ vUv = vec2(p.x*.5+.5, .5-p.y*.5); gl_Position = vec4(p,0.,1.); }';
  var FS = [
    'precision highp float;',
    'varying vec2 vUv;',
    'uniform sampler2D uDay, uNight, uMask, uH;',
    'uniform vec4 uCover; uniform vec2 uTexel, uFocus;',
    'uniform float uTime, uDive, uRise, uNightMix, uDim, uAspect;',
    'float caustic(vec2 p, float t){',
    '  vec2 i = p; float c = 1.0; float inten = .005;',
    '  for (int n = 0; n < 4; n++) {',
    '    float tt = t * (1.0 - (3.5 / float(n+1)));',
    '    i = p + vec2(cos(tt - i.x) + sin(tt + i.y), sin(tt - i.y) + cos(tt + i.x));',
    '    c += 1.0/length(vec2(p.x / (sin(i.x+tt)/inten), p.y / (cos(i.y+tt)/inten)));',
    '  }',
    '  c /= 4.0; c = 1.17 - pow(c, 1.4); return clamp(pow(abs(c), 8.0), 0.0, 1.0);',
    '}',
    'vec3 img(vec2 uv){ return mix(texture2D(uDay, uv).rgb, texture2D(uNight, uv).rgb, uNightMix); }',
    'void main(){',
    '  vec2 suv = vUv;',
    '  float d = smoothstep(0.0, 1.0, uDive), r = smoothstep(0.0, 1.0, uRise);',
    '  float under = d * (1.0 - r);',
    '  float zoom = 1.0 + 1.25 * under;',
    '  vec2 iuv = suv * uCover.xy + uCover.zw;',
    '  iuv = uFocus + (iuv - uFocus) / zoom;',
    '  float hx = texture2D(uH, suv + vec2(uTexel.x, 0.)).r - texture2D(uH, suv - vec2(uTexel.x, 0.)).r;',
    '  float hy = texture2D(uH, suv + vec2(0., uTexel.y)).r - texture2D(uH, suv - vec2(0., uTexel.y)).r;',
    '  float m = texture2D(uMask, iuv).r;',
    '  float persp = smoothstep(0.52, 0.95, iuv.y);',
    '  float amt = m * persp;',
    '  vec2 off = vec2(hx, hy * 0.6) * 0.075 * amt;',
    '  vec2 wob = vec2(sin(suv.y * 16.0 + uTime * 1.5), cos(suv.x * 12.0 + uTime * 1.2)) * 0.014 * under;',
    '  vec2 uv2 = clamp(iuv + off + wob, 0.001, 0.999);',
    '  vec3 base = img(uv2);',
    '  if (under > 0.02) {',
    '    vec3 acc = base;',
    '    for (int k = 0; k < 6; k++) { float a = float(k) * 1.0472; acc += img(clamp(uv2 + vec2(cos(a), sin(a)) * 0.016 * under, 0.001, 0.999)); }',
    '    base = acc / 7.0;',
    '  }',
    '  vec3 n = normalize(vec3(-hx * 7.0, -hy * 7.0, 1.0));',
    '  float spec = pow(max(dot(n, normalize(vec3(-0.25, -0.55, 0.8))), 0.0), 48.0) * amt;',
    '  vec3 surf = base + spec * mix(vec3(1.0, 0.82, 0.55), vec3(0.65, 1.0, 1.0), uNightMix) * 0.55;',
    '  vec3 top = mix(vec3(0.18, 0.56, 0.60), vec3(0.08, 0.66, 0.70), uNightMix);',
    '  vec3 bot = mix(vec3(0.01, 0.08, 0.11), vec3(0.01, 0.10, 0.15), uNightMix);',
    '  vec3 water = mix(top, bot, smoothstep(0.0, 1.0, suv.y));',
    '  vec2 cp = mod(suv * vec2(uAspect, 1.0) * 5.0, 6.2831) - 250.0;',
    '  water += caustic(cp, uTime * 0.45) * 0.32 * (1.0 - suv.y * 0.75);',
    '  float rays = pow(max(0.0, sin(suv.x * 19.0 + sin(suv.x * 6.0 + uTime * 0.35) * 2.2)), 7.0) * (1.0 - suv.y) * 0.16;',
    '  water += rays;',
    '  float b = 0.0;',
    '  for (int i = 0; i < 16; i++) {',
    '    float fi = float(i);',
    '    vec2 bp = vec2(fract(sin(fi * 91.3) * 437.5), 1.0 - fract(uTime * (0.05 + 0.06 * fract(fi * 0.37)) + fract(sin(fi * 13.1) * 91.7)));',
    '    bp.x += sin(uTime * 1.3 + fi) * 0.012;',
    '    float rr = 0.006 + 0.012 * fract(fi * 0.61);',
    '    float dist = length((suv - bp) * vec2(uAspect, 1.0));',
    '    b += smoothstep(rr, rr * 0.7, dist) * smoothstep(rr * 0.2, rr * 0.75, dist);',
    '  }',
    '  water += b * 0.55;',
    '  vec3 underCol = water * 0.78 + base * 0.28;',
    '  vec3 col = mix(surf, underCol, under);',
    '  float flash = (1.0 - abs(under - 0.5) * 2.0);',
    '  col += vec3(0.75, 0.95, 1.0) * pow(flash, 6.0) * 0.08;',
    '  gl_FragColor = vec4(col * uDim, 1.0);',
    '}'
  ].join('\n');

  function loadImage(src) {
    return new Promise(function (res, rej) { var i = new Image(); i.decoding = 'async'; i.onload = function () { res(i); }; i.onerror = rej; i.src = src; });
  }

  function Water(stage, kind) {
    this.stage = stage; this.kind = kind;
    this.act = stage.closest('[data-sc-act]');
    this.canvas = stage.querySelector('canvas.water');
    this.visible = false; this.ready = false; this.started = false;
    this.lastDrop = 0; this.lastSplashDive = 0; this.diveWas = 0; this.riseWas = 0;
    var self = this;
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { self.visible = e.isIntersecting; });
      if (self.visible && !self.started) self.start();
    }, { rootMargin: '120% 0px' });
    io.observe(stage);
  }

  Water.prototype.start = function () {
    this.started = true;
    var c = this.canvas, self = this;
    var gl = c.getContext('webgl', { antialias: false, alpha: false, premultipliedAlpha: false, powerPreference: 'high-performance' });
    if (!gl) return;
    this.gl = gl;
    function sh(type, src) { var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.warn(gl.getShaderInfoLog(s)); return null; } return s; }
    var vs = sh(gl.VERTEX_SHADER, VS), fs = sh(gl.FRAGMENT_SHADER, FS);
    if (!vs || !fs) return;
    var pr = gl.createProgram(); gl.attachShader(pr, vs); gl.attachShader(pr, fs); gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) return;
    gl.useProgram(pr); this.pr = pr;
    var buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    var loc = gl.getAttribLocation(pr, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    this.u = {};
    ['uDay', 'uNight', 'uMask', 'uH', 'uCover', 'uTexel', 'uFocus', 'uTime', 'uDive', 'uRise', 'uNightMix', 'uDim', 'uAspect'].forEach(function (n) { self.u[n] = gl.getUniformLocation(pr, n); });

    this.mobile = phone();
    var m = this.mobile;
    var day = m ? 'assets/dive-day-m.jpg' : 'assets/dive-day.jpg';
    var night = m ? 'assets/dive-night-m.jpg' : 'assets/dive-night.jpg';
    var mask = m ? 'assets/dive-mask-m.png' : 'assets/dive-mask.png';
    if (this.kind === 'close') day = night;
    // image-space focus of the dive and the spout that keeps the water alive
    this.focus = m ? [0.62, 0.74] : [0.66, 0.74];
    this.spout = m ? [0.385, 0.66] : [0.453, 0.66];
    this.pos = m ? (this.kind === 'close' ? [0.72, 0.5] : [0.6, 0.5]) : [0.66, 0.5];
    Promise.all([loadImage(day), loadImage(night), loadImage(mask)]).then(function (im) {
      self.imgAspect = im[0].naturalWidth / im[0].naturalHeight;
      self.tex = im.map(function (img, k) {
        var t = gl.createTexture(); gl.activeTexture(gl.TEXTURE0 + k); gl.bindTexture(gl.TEXTURE_2D, t);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, img);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        return t;
      });
      gl.uniform1i(self.u.uDay, 0); gl.uniform1i(self.u.uNight, 1); gl.uniform1i(self.u.uMask, 2); gl.uniform1i(self.u.uH, 3);
      self.hTex = gl.createTexture(); gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, self.hTex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      self.resize();
      addEventListener('resize', function () { self.resize(); }, { passive: true });
      self.bindPointer();
      self.ready = true;
      self.frame(performance.now());
      self.stage.classList.add('has-water');
      requestAnimationFrame(function loop(t) { if (self.visible) self.frame(t); requestAnimationFrame(loop); });
    }).catch(function () { /* the fallback pictures stay up */ });
  };

  Water.prototype.resize = function () {
    var c = this.canvas, r = this.stage.getBoundingClientRect();
    var dpr = Math.min(devicePixelRatio || 1, phone() ? 1.5 : 1.6);
    c.width = Math.max(2, Math.round(r.width * dpr)); c.height = Math.max(2, Math.round(r.height * dpr));
    this.w = r.width; this.h = r.height;
    this.gl.viewport(0, 0, c.width, c.height);
    var ca = r.width / r.height, ia = this.imgAspect;
    var s = ca > ia ? [1, ia / ca] : [ca / ia, 1];
    this.cover = [s[0], s[1], (1 - s[0]) * this.pos[0], (1 - s[1]) * this.pos[1]];
    // the ripple grid lives in screen space
    var G = phone() ? 120 : 200;
    this.gw = G; this.gh = Math.max(40, Math.round(G * r.height / r.width));
    this.a = new Float32Array(this.gw * this.gh); this.b = new Float32Array(this.gw * this.gh);
    this.bytes = new Uint8Array(this.gw * this.gh);
  };

  // image uv -> grid cell
  Water.prototype.toGrid = function (iu, iv) {
    var sx = (iu - this.cover[2]) / this.cover[0], sy = (iv - this.cover[3]) / this.cover[1];
    return [sx * this.gw, sy * this.gh];
  };

  Water.prototype.drop = function (gx, gy, radius, strength) {
    var W = this.gw, H = this.gh, a = this.a;
    var r = Math.max(1, radius | 0);
    for (var y = -r; y <= r; y++) for (var x = -r; x <= r; x++) {
      var px = (gx | 0) + x, py = (gy | 0) + y;
      if (px < 1 || py < 1 || px >= W - 1 || py >= H - 1) continue;
      var d = Math.sqrt(x * x + y * y) / r; if (d > 1) continue;
      a[py * W + px] += strength * (0.5 + 0.5 * Math.cos(d * Math.PI));
    }
  };

  Water.prototype.bindPointer = function () {
    var self = this, last = null;
    function at(cx, cy, s) {
      var r = self.canvas.getBoundingClientRect();
      var gx = (cx - r.left) / r.width * self.gw, gy = (cy - r.top) / r.height * self.gh;
      if (last) {
        var dx = gx - last[0], dy = gy - last[1], steps = Math.min(8, Math.ceil(Math.hypot(dx, dy) / 2));
        for (var i = 1; i <= steps; i++) self.drop(last[0] + dx * i / steps, last[1] + dy * i / steps, 2, s);
      } else self.drop(gx, gy, 3, s * 1.6);
      last = [gx, gy];
    }
    this.stage.addEventListener('pointermove', function (e) { if (e.pointerType === 'mouse') at(e.clientX, e.clientY, 0.9); }, { passive: true });
    this.stage.addEventListener('pointerleave', function () { last = null; }, { passive: true });
    // touch: passive listeners only, so the finger still scrolls the page
    this.stage.addEventListener('touchstart', function (e) { last = null; var t = e.touches[0]; at(t.clientX, t.clientY, 1.4); }, { passive: true });
    this.stage.addEventListener('touchmove', function (e) { var t = e.touches[0]; at(t.clientX, t.clientY, 1.1); }, { passive: true });
    this.stage.addEventListener('touchend', function () { last = null; }, { passive: true });
    this.stage.addEventListener('pointerdown', function (e) { if (e.pointerType === 'mouse') { last = null; at(e.clientX, e.clientY, 3); } }, { passive: true });
  };

  Water.prototype.step = function () {
    var W = this.gw, H = this.gh, a = this.a, b = this.b, damp = 0.982;
    for (var y = 1; y < H - 1; y++) {
      var row = y * W;
      for (var x = 1; x < W - 1; x++) {
        var i = row + x;
        var v = (a[i - 1] + a[i + 1] + a[i - W] + a[i + W]) * 0.5 - b[i];
        b[i] = v * damp;
      }
    }
    this.a = b; this.b = a;
    var out = this.bytes, cur = this.a;
    for (var k = 0; k < out.length; k++) { var q = 128 + cur[k] * 22; out[k] = q < 0 ? 0 : q > 255 ? 255 : q; }
  };

  Water.prototype.frame = function (t) {
    var gl = this.gl, u = this.u;
    var dive = 0, rise = 0, nightMix = this.kind === 'close' ? 1 : 0, dim = this.kind === 'close' ? 0.62 : 1;
    if (this.kind === 'dive') {
      var p = actP(this.act);
      if (reduce) { nightMix = p > 0.55 ? 1 : 0; }
      else {
        dive = smooth(0.26, 0.46, p);
        rise = smooth(0.58, 0.8, p);
        nightMix = smooth(0.49, 0.55, p);
      }
    }
    if (!reduce) {
      // the spout pours into the pool all day and all night
      if (t - this.lastDrop > 140) {
        this.lastDrop = t;
        var g = this.toGrid(this.spout[0] + (Math.random() - 0.5) * 0.008, this.spout[1] + 0.04 + Math.random() * 0.02);
        this.drop(g[0], g[1], 2, 0.55);
        if (Math.random() < 0.05) { var rg = this.toGrid(0.5 + Math.random() * 0.45, 0.62 + Math.random() * 0.28); this.drop(rg[0], rg[1], 2, 1.1); }
      }
      // breaking the surface on the way down and on the way back up
      if (this.diveWas < 0.04 && dive >= 0.04) { var f = this.toGrid(this.focus[0], this.focus[1]); this.drop(f[0], f[1], 7, 6); }
      if (this.riseWas < 0.92 && rise >= 0.92) { var f2 = this.toGrid(this.focus[0], this.focus[1]); this.drop(f2[0], f2[1], 6, 5); }
      this.diveWas = dive; this.riseWas = rise;
      if (this.kind === 'close' && this.floatEl) {
        var fr = this.floatEl.getBoundingClientRect(), cr = this.canvas.getBoundingClientRect();
        if (t - (this.lastFloat || 0) > 1300) {
          this.lastFloat = t;
          var fx = (fr.left + fr.width / 2 - cr.left) / cr.width * this.gw, fy = (fr.bottom - 4 - cr.top) / cr.height * this.gh;
          this.drop(fx - this.gw * 0.05, fy, 3, 1.8); this.drop(fx + this.gw * 0.05, fy, 3, 1.8);
        }
      }
      this.step();
    }
    gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, this.hTex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, this.gw, this.gh, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, this.bytes);
    gl.uniform4fv(u.uCover, this.cover);
    gl.uniform2f(u.uTexel, 1 / this.gw, 1 / this.gh);
    gl.uniform2f(u.uFocus, this.focus[0], this.focus[1]);
    gl.uniform1f(u.uTime, t / 1000);
    gl.uniform1f(u.uDive, dive);
    gl.uniform1f(u.uRise, rise);
    gl.uniform1f(u.uNightMix, nightMix);
    gl.uniform1f(u.uDim, dim);
    gl.uniform1f(u.uAspect, this.w / this.h);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    // a compact signature of what actually paints, for the verification pass
    this.stage.setAttribute('data-sc-verify-state', [dive.toFixed(2), rise.toFixed(2), nightMix.toFixed(2)].join('|'));
  };

  // the scrim behind "Plongez." follows its cue exactly (a sibling, so the
  // verification pass measures it)
  var plunge = document.querySelector('.dive__copy--two'), plungeScrim = document.querySelector('.dive__plunge-scrim');
  if (plunge && plungeScrim) (function sync() { plungeScrim.style.opacity = plunge.style.opacity || 0; requestAnimationFrame(sync); })();

  Array.prototype.forEach.call(document.querySelectorAll('[data-kd-water]'), function (stage) {
    var w = new Water(stage, stage.getAttribute('data-kd-water'));
    if (w.kind === 'close') {
      w.floatEl = stage.querySelector('.float__btn');
      // hovering the float stirs more water around it
      w.floatEl.addEventListener('pointerenter', function () {
        if (!w.ready || reduce) return;
        var fr = w.floatEl.getBoundingClientRect(), cr = w.canvas.getBoundingClientRect();
        w.drop((fr.left + fr.width / 2 - cr.left) / cr.width * w.gw, (fr.bottom - cr.top) / cr.height * w.gh, 5, 4);
      });
    }
  });
})();
