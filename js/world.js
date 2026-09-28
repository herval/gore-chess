// Simulation of everything wet: particles, stains, gibs, fountains, pools, entrails.
const rand = (a, b) => a + Math.random() * (b - a);
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const GRAV = 300;
const DRY = ['#4e0810', '#5c0a12', '#6a0c16', '#420610', '#741018'];
const WET = ['#a8101c', '#c01420', '#8e0c18', '#d82028'];

const WORLD = {
  rigs: [], gibs: [], parts: [], emitters: [], pools: [], ropes: [], fx: [], scripts: [], lens: [], flies: [],
  time: 0, timeScale: 1, slowT: 0, hitstop: 0, liters: 0, fast: 1,
  cam: { x: W / 2, y: H / 2, z: 1, tx: W / 2, ty: H / 2, tz: 1, trauma: 0, sx: 0, sy: 0, speed: 5 },
  flash: { a: 0, col: '#fff' }, spot: null, letterbox: 0, letterboxT: 0, banner: null, lights: [],

  init() {
    this.stain = makeCanvas(W, H); this.sx = this.stain.getContext('2d');
    this.wet = makeCanvas(W, H); this.wx = this.wet.getContext('2d');
    this.wetFade = 0;
  },
  reset() {
    this.rigs = []; this.gibs = []; this.parts = []; this.emitters = []; this.pools = []; this.ropes = []; this.fx = []; this.scripts = []; this.lens = []; this.flies = [];
    this.sx.clearRect(0, 0, W, H); this.wx.clearRect(0, 0, W, H);
    this.timeScale = 1; this.slowT = 0; this.hitstop = 0; this.liters = 0;
    Object.assign(this.cam, { x: W / 2, y: H / 2, z: 1, tx: W / 2, ty: H / 2, tz: 1, trauma: 0 });
    this.letterboxT = 0; this.banner = null; this.spot = null;
  },

  // ---------- screen effects ----------
  shake(a) { this.cam.trauma = Math.min(1.2, this.cam.trauma + a); },
  stop(s) { this.hitstop = Math.max(this.hitstop, s); },
  slowmo(scale, dur) { this.timeScale = scale; this.slowT = dur; },
  doFlash(col, a) { this.flash.col = col; this.flash.a = a; },
  focus(x, y, z, speed = 5) { Object.assign(this.cam, { tx: x, ty: y, tz: z, speed }); },
  unfocus() { this.focus(W / 2, H / 2, 1, 4); },
  splatLens(n, big = 1) {
    for (let i = 0; i < n; i++) {
      const drops = [];
      const cx = rand(20, W - 20), cy = rand(10, H - 60), r = rand(4, 14) * big;
      for (let k = 0; k < r * 5; k++) { const a = rand(0, 6.28), d = Math.pow(Math.random(), 0.7) * r; drops.push([Math.cos(a) * d, Math.sin(a) * d * 0.9, rand(1, 3)]); }
      for (let k = 0; k < 6; k++) { const a = rand(0, 6.28), d = r * rand(1.2, 2.2); drops.push([Math.cos(a) * d, Math.sin(a) * d, rand(1, 2)]); }
      const runs = [];
      for (let k = 0; k < 2 + Math.floor(r / 4); k++) runs.push({ x: rand(-r * 0.7, r * 0.7), len: 0, max: rand(10, 60), sp: rand(6, 20) });
      this.lens.push({ x: cx, y: cy, drops, runs, life: rand(3.5, 6), t: 0 });
    }
  },

  // ---------- stains ----------
  stainPx(x, y, w = 1, h = 1, wet = true) {
    x = Math.round(x); y = Math.round(y);
    this.sx.fillStyle = pick(DRY); this.sx.fillRect(x, y, w, h);
    if (wet) { this.wx.fillStyle = pick(WET); this.wx.fillRect(x, y, w, h); }
  },
  splatDrop(x, y, size, vx, vy) {
    this.stainPx(x, y, size, size);
    const sp = Math.hypot(vx, vy);
    if (sp > 50) {
      const n = Math.min(7, sp / 30), ux = vx / sp, uy = vy / sp;
      for (let i = 1; i < n; i++) if (Math.random() < 0.8) this.stainPx(x + ux * i, y + uy * i * 0.6, 1, 1);
    }
    if (size > 1 && Math.random() < 0.5) this.stainPx(x + rand(-2, 2), y + rand(-1, 1), 1, 1);
  },
  splatBig(x, y, r, dirX = 0) {
    for (let i = 0; i < r * r * 1.4; i++) {
      const a = rand(0, 6.28), d = Math.pow(Math.random(), 0.6) * r;
      this.stainPx(x + Math.cos(a) * d + dirX * d * 0.5, y + Math.sin(a) * d * 0.5, Math.random() < 0.3 ? 2 : 1, 1);
    }
    const rays = 8 + Math.floor(r / 2);
    for (let k = 0; k < rays; k++) {
      const a = rand(0, 6.28), L = r * rand(1.1, 2.6);
      for (let d = r * 0.6; d < L; d += rand(1, 3)) this.stainPx(x + Math.cos(a) * d + dirX * d * 0.4, y + Math.sin(a) * d * 0.5, 1, 1);
      this.stainPx(x + Math.cos(a) * L + dirX * L * 0.4, y + Math.sin(a) * L * 0.5, 2, 2);
    }
  },
  scorch(x, y, r) {
    const c = this.sx;
    for (let i = 0; i < r * r * 2; i++) {
      const a = rand(0, 6.28), d = Math.pow(Math.random(), 0.5) * r;
      c.fillStyle = pick(['#0c0808', '#1a1210', '#241814', '#100a0a']);
      c.fillRect(Math.round(x + Math.cos(a) * d), Math.round(y + Math.sin(a) * d * 0.5), 1, 1);
    }
  },
  pool(x, y, max, speed = 6) {
    const p = { x, y, r: 1, max, speed, s1: rand(0, 6), s2: rand(0, 6), s3: rand(0, 6) };
    this.pools.push(p);
    return p;
  },
  drawPool(p) {
    const rx = p.r, ry = p.r * 0.5;
    const shape = a => 1 + 0.18 * Math.sin(3 * a + p.s1) + 0.1 * Math.sin(5 * a + p.s2) + 0.06 * Math.sin(9 * a + p.s3);
    for (let j = -Math.ceil(ry * 1.4); j <= Math.ceil(ry * 1.4); j++) {
      for (let i = -Math.ceil(rx * 1.4); i <= Math.ceil(rx * 1.4); i++) {
        const nx = i / rx, ny = j / ry, a = Math.atan2(ny, nx), rr = Math.hypot(nx, ny);
        const lim = shape(a);
        if (rr > lim) continue;
        const X = Math.round(p.x + i), Y = Math.round(p.y + j);
        this.sx.fillStyle = rr > lim - 0.12 ? '#3a040a' : '#5a0610';
        this.sx.fillRect(X, Y, 1, 1);
        this.wx.fillStyle = rr < lim * 0.35 && j < 0 && i < 0 && (i + j) % 3 === 0 ? '#e04850' : '#9a0c18';
        this.wx.fillRect(X, Y, 1, 1);
      }
    }
  },

  // ---------- particles ----------
  drop(x, y, z, vx, vy, vz, size = 1) {
    if (this.parts.length > 3500) return;
    this.parts.push({ x, y, z, vx, vy, vz, s: size, c: pick(WET), px: x, pz: z });
    this.liters += 0.004 * size;
  },
  spray(x, y, z, ang, spread, speed, n, o = {}) {
    for (let i = 0; i < n; i++) {
      const a = ang + (Math.random() - 0.5) * spread, s = speed * rand(0.35, 1.1);
      this.drop(x + rand(-1, 1), y + rand(-1, 1), z + rand(-1, 1), Math.cos(a) * s, (Math.random() - 0.5) * speed * (o.depth || 0.25), Math.sin(a) * s, Math.random() < (o.big || 0.2) ? 2 : 1);
    }
  },
  burst(x, y, z, n, speed) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, 6.28), e = rand(-0.3, 1.3), s = speed * Math.pow(Math.random(), 0.5);
      this.drop(x, y + rand(-1, 1), z, Math.cos(a) * Math.cos(e) * s, Math.sin(a) * Math.cos(e) * s * 0.5, Math.sin(e) * s, Math.random() < 0.3 ? 2 : 1);
    }
  },
  // src() -> {x, y(ground), z, ang}
  emit(src, o) {
    const e = Object.assign({ src, rate: 120, dur: 2, speed: 90, spread: 0.35, pulse: 0, t: 0, acc: 0, big: 0.25 }, o);
    this.emitters.push(e);
    return e;
  },

  // ---------- gibs ----------
  gib(spr, x, y, z, o = {}) {
    const g = Object.assign({ spr, x, y, z, vx: 0, vy: 0, vz: 0, ang: 0, vang: 0, flip: false, bleed: 0, rest: 0, resting: false, bake: rand(2.5, 4), roll: 0, bounces: 0 }, o);
    this.gibs.push(g);
    return g;
  },
  // turn a detached rig part into a flying gib
  gibFromPart(d, groundY, o = {}) {
    if (!d) return null;
    const gy = groundY + rand(-2, 3);
    return this.gib(d.spr, d.x, gy, Math.max(0, gy - d.y), Object.assign({ ang: d.ang, flip: d.flip }, o));
  },
  chunks(x, y, z, n, speed, set = CHUNKS.meat, o = {}) {
    for (let i = 0; i < n; i++) {
      const a = (o.ang !== undefined ? o.ang + (Math.random() - 0.5) * (o.spread || 1.5) : rand(0, 6.28)), s = speed * rand(0.4, 1.1);
      const up = o.ang !== undefined ? Math.sin(a) * s : rand(0.2, 1) * s;
      const hx = o.ang !== undefined ? Math.cos(a) * s : Math.cos(a) * s * 0.8;
      this.gib(pick(set), x, y + rand(-2, 2), z, { vx: hx, vy: rand(-1, 1) * s * 0.25, vz: up, vang: rand(-15, 15), bleed: set === CHUNKS.meat || set === CHUNKS.organ ? rand(0.3, 1.2) : 0 });
    }
  },
  bakeSprite(spr, x, y, ang, flip, variantName = 'remains') {
    const s = variantName ? variant(spr, variantName) : spr;
    const c = this.sx;
    c.save(); c.translate(Math.round(x), Math.round(y)); if (flip) c.scale(-1, 1); c.rotate(ang);
    c.drawImage(s.c, -s.ax, -s.ay); c.restore();
  },
  // instantly land/bake everything in flight (used to clean up behind a cut)
  settle() {
    for (const p of this.parts) this.splatDrop(p.x, p.y, p.s, 0, 0);
    this.parts = []; this.emitters = [];
    for (const p of this.pools) { p.r = p.max; this.drawPool(p); }
    this.pools = [];
    for (const g of this.gibs) this.bakeSprite(g.spr, g.x, g.y, g.ang, g.flip, g.bakeAs === undefined ? 'remains' : g.bakeAs);
    this.gibs = [];
    for (const r of this.ropes) this.drawRope(this.sx, r, true);
    this.ropes = [];
  },
  // carrion flies settle over every corpse, forever
  swarm(x, y, n = 4) {
    for (let i = 0; i < n; i++) this.flies.push({ x, y: y - 6, ph: rand(0, 6.28), sp: rand(3, 6), rx: rand(4, 9), ry: rand(2, 5) });
    if (this.flies.length > 48) this.flies.splice(0, this.flies.length - 48);
  },
  drawFlies(ctx, t) {
    ctx.fillStyle = '#0a0608';
    for (const f of this.flies) {
      const a = t * f.sp + f.ph;
      ctx.fillRect(Math.round(f.x + Math.cos(a) * f.rx + Math.sin(a * 2.7) * 1.5), Math.round(f.y + Math.sin(a * 1.3) * f.ry - Math.abs(Math.sin(a * 5))), 1, 1);
    }
  },
  bakeRig(rig) {
    this.swarm(rig.x, rig.y, 3 + Math.floor(Math.random() * 3));
    if (!rig.hidden) rig.draw(this.sx, 'remains');
    const i = this.rigs.indexOf(rig); if (i >= 0) this.rigs.splice(i, 1);
  },

  // ---------- entrails ----------
  rope(a, b, n = 12, seg = 2.2, floorY) {
    const pa = a();
    const nodes = [];
    for (let i = 0; i < n; i++) nodes.push({ x: pa.x + rand(-1, 1), y: pa.y + i * 0.5, px: pa.x, py: pa.y });
    const r = { a, b, nodes, seg, floorY, broken: false, rest: 0 };
    this.ropes.push(r);
    return r;
  },

  // ---------- fx ----------
  spark(x, y, n = 12, col) {
    for (let i = 0; i < n; i++) { const a = rand(0, 6.28), s = rand(40, 160); this.fx.push({ k: 'spark', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 30, life: rand(0.15, 0.4), t: 0, col: col || pick(['#fff', '#fff6a0', '#ffd040']) }); }
  },
  dust(x, y, n = 10, col = '#6a5a60') {
    for (let i = 0; i < n; i++) { const a = rand(0, 6.28), s = rand(10, 50); this.fx.push({ k: 'dust', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.3 - 5, life: rand(0.5, 1.2), t: 0, r: rand(1, 3), col }); }
  },
  ring(x, y, max, col = '#fff') { this.fx.push({ k: 'ring', x, y, max, life: 0.35, t: 0, col }); },
  bolt(from, to, dur, col) { const b = { k: 'bolt', from, to, life: dur, t: 0, col }; this.fx.push(b); return b; },
  flame(x, y, n = 1, spread = 6) { for (let i = 0; i < n; i++) this.fx.push({ k: 'flame', x: x + rand(-spread, spread), y: y + rand(-2, 2), vx: rand(-8, 8), vy: rand(-45, -20), life: rand(0.3, 0.8), t: 0 }); },
  ember(x, y) { this.fx.push({ k: 'ember', x, y, vx: rand(-10, 10), vy: rand(-30, -10), life: rand(0.6, 1.5), t: 0 }); },
  light(x, y, r, col, life) { this.fx.push({ k: 'light', x, y, r, col, life, t: 0 }); },
  text(str, sub) { this.banner = { str, sub, t: 0 }; },

  // ---------- scripts (generator coroutines) ----------
  run(gen) {
    const s = { gen, wait: 0, cond: null, done: false };
    this.scripts.push(s);
    return { done: () => s.done };
  },
  stepScripts(dt) {
    for (let i = 0; i < this.scripts.length; i++) {
      const s = this.scripts[i];
      if (s.wait > 0) { s.wait -= dt; if (s.wait > 0) continue; }
      if (s.cond && !s.cond()) continue;
      s.cond = null;
      let r;
      try { r = s.gen.next(); } catch (e) { console.error(e); s.done = true; continue; }
      if (r.done) { s.done = true; continue; }
      const v = r.value;
      if (typeof v === 'number') s.wait = v;
      else if (v && v.done) s.cond = v.done;
      else if (Array.isArray(v)) s.cond = () => v.every(h => h.done());
    }
    this.scripts = this.scripts.filter(s => !s.done);
  },

  // ---------- update ----------
  update(realDt) {
    const cam = this.cam;
    const k = 1 - Math.exp(-realDt * cam.speed);
    cam.x += (cam.tx - cam.x) * k; cam.y += (cam.ty - cam.y) * k; cam.z += (cam.tz - cam.z) * k;
    cam.trauma = Math.max(0, cam.trauma - realDt * 1.3);
    if (this.spot && this.letterbox > 0.5) cam.trauma = Math.max(cam.trauma, 0.24); // the ground trembles while they fight
    const sh = cam.trauma * cam.trauma * 9;
    cam.sx = (Math.random() * 2 - 1) * sh; cam.sy = (Math.random() * 2 - 1) * sh;
    this.flash.a = Math.max(0, this.flash.a - realDt * 3);
    this.letterbox += (this.letterboxT - this.letterbox) * Math.min(1, realDt * 6);
    if (this.banner) this.banner.t += realDt;
    for (const L of this.lens) {
      L.t += realDt;
      for (const r of L.runs) r.len = Math.min(r.max, r.len + r.sp * realDt);
    }
    this.lens = this.lens.filter(L => L.t < L.life);

    if (this.hitstop > 0) { this.hitstop -= realDt; return; }
    if (this.slowT > 0) { this.slowT -= realDt; if (this.slowT <= 0) this.timeScale = 1; }
    const dt = Math.min(0.05, realDt) * this.timeScale * this.fast;
    this.time += dt;
    this.stepScripts(dt);
    for (const r of this.rigs) r.update(dt, this.time);

    // emitters
    for (const e of this.emitters) {
      e.t += dt;
      const decay = Math.max(0, 1 - e.t / e.dur);
      const pf = e.pulse ? Math.pow(Math.max(0, Math.sin(e.t * e.pulse * Math.PI * 2)), 2) : 1;
      e.acc += e.rate * dt * decay * (0.25 + 0.75 * pf);
      const src = e.src();
      if (!src) { e.t = e.dur; continue; }
      while (e.acc >= 1) {
        e.acc -= 1;
        const a = src.ang + (Math.random() - 0.5) * e.spread, s = e.speed * (0.4 + 0.6 * pf) * (0.5 + 0.5 * decay) * rand(0.7, 1.1);
        this.drop(src.x + rand(-0.5, 0.5), src.y + rand(-1, 1), src.z, Math.cos(a) * s, rand(-8, 8), Math.sin(a) * s, Math.random() < e.big ? 2 : 1);
      }
    }
    this.emitters = this.emitters.filter(e => e.t < e.dur);

    // particles
    const P = this.parts;
    for (let i = P.length - 1; i >= 0; i--) {
      const p = P[i];
      p.px = p.x; p.pz = p.y - p.z;
      p.vz -= GRAV * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.z <= 0) {
        if (p.y > 58) this.splatDrop(p.x, p.y, p.s, p.vx, p.vy);
        P[i] = P[P.length - 1]; P.pop();
      } else if (p.x < -10 || p.x > W + 10 || p.y - p.z < -50) { P[i] = P[P.length - 1]; P.pop(); }
    }

    // pools
    for (const p of this.pools) { if (p.r < p.max) { p.r = Math.min(p.max, p.r + p.speed * dt * (1.2 - p.r / p.max)); this.drawPool(p); } }
    this.pools = this.pools.filter(p => p.r < p.max - 0.05);

    // gibs
    for (const g of this.gibs) {
      if (!g.resting) {
        g.vz -= GRAV * dt; g.x += g.vx * dt; g.y += g.vy * dt; g.z += g.vz * dt; g.ang += g.vang * dt;
        if (g.x < 6 || g.x > W - 6) { g.vx *= -0.5; g.x = Math.max(6, Math.min(W - 6, g.x)); }
        if (g.y < 64) { g.y = 64; g.vy = Math.abs(g.vy) * 0.5; }
        if (g.y > H - 4) { g.y = H - 4; g.vy = -Math.abs(g.vy) * 0.5; }
        if (g.bleed > 0) {
          g.bleed -= dt;
          if (Math.random() < 0.7) this.drop(g.x, g.y, g.z + 1, g.vx * 0.3 + rand(-15, 15), rand(-5, 5), g.vz * 0.3 + rand(0, 25), 1);
        }
        if (g.z <= 0) {
          g.z = 0;
          if (g.vz < -45) {
            g.vz = -g.vz * 0.35; g.vx *= 0.6; g.vy *= 0.6; g.vang *= 0.5; g.bounces++;
            if (g.bleed > 0 || g.bloody) this.splatDrop(g.x, g.y, 2, g.vx, g.vy);
            if (g.onBounce) g.onBounce(g);
          } else {
            g.vz = 0;
            g.vx *= Math.pow(0.02, dt); g.vy *= Math.pow(0.02, dt);
            if (g.roll) g.ang += g.vx * dt / g.roll; else g.vang *= Math.pow(0.001, dt);
            if (g.bleed > 0 && Math.random() < 0.2) this.stainPx(g.x + rand(-1, 1), g.y, 1, 1);
            if (Math.abs(g.vx) < 2 && Math.abs(g.vy) < 2) g.resting = true;
          }
        }
      } else {
        g.rest += dt;
        if (g.pool && !g.pooled) { g.pooled = true; this.pool(g.x, g.y + 1, g.pool, 4); }
        if (g.rest > g.bake && !g.keep) { this.bakeSprite(g.spr, g.x, g.y - g.z, g.ang, g.flip, g.bakeAs === undefined ? 'remains' : g.bakeAs); g.dead = true; }
      }
    }
    this.gibs = this.gibs.filter(g => !g.dead);

    // ropes
    for (const r of this.ropes) {
      const n = r.nodes;
      for (let i = 0; i < n.length; i++) {
        const q = n[i], vx = (q.x - q.px) * 0.96, vy = (q.y - q.py) * 0.96;
        q.px = q.x; q.py = q.y; q.x += vx; q.y += vy + GRAV * dt * dt;
        if (q.y > r.floorY) { q.y = r.floorY; q.px = q.x - vx * 0.3; }
      }
      const A = r.a && r.a(), B = !r.broken && r.b && r.b();
      for (let it = 0; it < 5; it++) {
        if (A) { n[0].x = A.x; n[0].y = A.y; }
        if (B) { n[n.length - 1].x = B.x; n[n.length - 1].y = B.y; }
        for (let i = 0; i < n.length - 1; i++) {
          const p = n[i], q = n[i + 1], dx = q.x - p.x, dy = q.y - p.y, d = Math.hypot(dx, dy) || 0.001, diff = (d - r.seg) / d * 0.5;
          p.x += dx * diff; p.y += dy * diff; q.x -= dx * diff; q.y -= dy * diff;
        }
      }
      if (B && A && Math.hypot(B.x - A.x, B.y - A.y) > n.length * r.seg * 1.6) {
        r.broken = true; SFX.squish();
        this.spray(B.x, r.floorY, r.floorY - B.y, Math.PI / 2, 2, 60, 20);
      }
      // unbroken guts still settle into the floor eventually
      r.age = (r.age || 0) + dt;
      if (r.broken) r.rest += dt;
      if (r.rest > 4 || r.age > 7) { this.drawRope(this.sx, r, true); r.dead = true; }
      if (r.broken && Math.random() < 0.1) { const q = pick(n); this.stainPx(q.x, Math.min(q.y + 1, r.floorY), 1, 1); }
    }
    this.ropes = this.ropes.filter(r => !r.dead);

    // fx
    for (const f of this.fx) {
      f.t += dt;
      if (f.k === 'spark' || f.k === 'dust' || f.k === 'flame' || f.k === 'ember') {
        f.x += f.vx * dt; f.y += f.vy * dt;
        if (f.k === 'spark') f.vy += 200 * dt;
        if (f.k === 'dust') { f.vx *= 0.95; f.r += dt * 4; }
      }
    }
    this.fx = this.fx.filter(f => f.t < f.life);

    // wet blood slowly dries into the permanent layer
    this.wetFade += dt;
    if (this.wetFade > 0.2) {
      this.wetFade = 0;
      this.wx.globalCompositeOperation = 'destination-out';
      this.wx.fillStyle = 'rgba(0,0,0,0.07)'; this.wx.fillRect(0, 0, W, H);
      this.wx.globalCompositeOperation = 'source-over';
    }
  },

  drawRope(ctx, r, baked) {
    const n = r.nodes;
    const line = (a, b, col, w) => {
      const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y)));
      ctx.fillStyle = col;
      for (let s = 0; s <= steps; s++) ctx.fillRect(Math.round(a.x + (b.x - a.x) * s / steps) - (w >> 1), Math.round(a.y + (b.y - a.y) * s / steps) - (w >> 1), w, w);
    };
    for (let i = 0; i < n.length - 1; i++) line(n[i], n[i + 1], baked ? '#2a0408' : '#3a0610', 3);
    for (let i = 0; i < n.length - 1; i++) line(n[i], n[i + 1], baked ? '#6a2030' : (i % 3 ? '#c85a70' : '#e07a8a'), 2);
    if (!baked) for (let i = 1; i < n.length - 1; i += 2) { ctx.fillStyle = '#f0a0b0'; ctx.fillRect(Math.round(n[i].x), Math.round(n[i].y) - 1, 1, 1); }
  },

  // entities sorted by ground y; shadows first
  drawEntities(ctx) {
    const list = [];
    for (const r of this.rigs) if (!r.hidden) list.push({ y: r.y + (r.layer || 0), r });
    for (const g of this.gibs) list.push({ y: g.y, g });
    for (const r of this.ropes) list.push({ y: r.floorY, rope: r });
    list.sort((a, b) => a.y - b.y);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    for (const e of list) {
      if (e.r && e.r.alive && !e.r.upper.free) {
        const r = e.r, w = (r.T.tw + 8) * (1 - Math.min(0.5, r.pose.jz / 40)) * r.sqx;
        ctx.fillRect(Math.round(r.x - w / 2), Math.round(r.y - 1), Math.round(w), 3);
        ctx.fillRect(Math.round(r.x - w / 2 + 2), Math.round(r.y - 2), Math.round(w - 4), 5);
      } else if (e.g && e.g.z > 1) ctx.fillRect(Math.round(e.g.x - 1), Math.round(e.g.y), 3, 1);
    }
    // cinematic spotlight: bystanders are drawn first, then darkened
    const spot = this.spot && this.letterbox > 0.05 ? this.spot : null;
    const inSpot = e => !spot || !e.r || spot.includes(e.r);
    if (spot) {
      for (const e of list) if (!inSpot(e)) e.r.draw(ctx);
      ctx.fillStyle = `rgba(4,0,6,${0.5 * this.letterbox})`; ctx.fillRect(0, 0, W, H);
    }
    for (const e of list) {
      if (!inSpot(e)) continue;
      if (e.r) {
        const r = e.r;
        if (r.selected) {
          const p = 0.5 + 0.5 * Math.sin(this.time * 8);
          ctx.fillStyle = `rgba(255,${r.faction === 'w' ? 220 : 60},${r.faction === 'w' ? 120 : 40},${0.25 + p * 0.3})`;
          const w = r.T.tw + 12;
          ctx.fillRect(Math.round(r.x - w / 2), Math.round(r.y - 2), w, 4);
        }
        r.draw(ctx);
        if (r.glow > 0) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = Math.min(1, r.glow) * 0.5; r.draw(ctx, 'flash'); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; }
      } else if (e.g) {
        const g = e.g, s = g.spr;
        ctx.save(); ctx.translate(Math.round(g.x), Math.round(g.y - g.z)); if (g.flip) ctx.scale(-1, 1); ctx.rotate(g.ang);
        ctx.drawImage(s.c, -s.ax, -s.ay); ctx.restore();
      } else if (e.rope) this.drawRope(ctx, e.rope);
    }
  },
  drawParticles(ctx) {
    for (const p of this.parts) {
      const X = Math.round(p.x), Y = Math.round(p.y - p.z);
      ctx.fillStyle = p.c;
      ctx.fillRect(X, Y, p.s, p.s);
      const dx = X - Math.round(p.px), dy = Y - Math.round(p.pz);
      if (Math.abs(dx) + Math.abs(dy) > 2) { ctx.fillRect(Math.round(X - dx * 0.5), Math.round(Y - dy * 0.5), 1, 1); }
    }
  },
  drawFx(ctx) {
    for (const f of this.fx) {
      const k = f.t / f.life;
      if (f.k === 'spark') { ctx.fillStyle = f.col; ctx.fillRect(Math.round(f.x), Math.round(f.y), 1, 1); ctx.fillRect(Math.round(f.x - f.vx * 0.015), Math.round(f.y - f.vy * 0.015), 1, 1); }
      else if (f.k === 'dust') { ctx.fillStyle = f.col; ctx.globalAlpha = 0.6 * (1 - k); const r = Math.round(f.r); ctx.fillRect(Math.round(f.x - r), Math.round(f.y - r), r * 2, r * 2); ctx.globalAlpha = 1; }
      else if (f.k === 'ring') {
        const r = f.max * EASE.out(k);
        ctx.fillStyle = f.col; ctx.globalAlpha = 1 - k;
        for (let a = 0; a < 6.28; a += 0.12) ctx.fillRect(Math.round(f.x + Math.cos(a) * r), Math.round(f.y + Math.sin(a) * r * 0.45), 2, 1);
        ctx.globalAlpha = 1;
      } else if (f.k === 'flame') {
        ctx.fillStyle = k < 0.2 ? '#fff6b0' : k < 0.45 ? '#ffc040' : k < 0.7 ? '#ff6a1a' : k < 0.85 ? '#b82010' : '#3a2a2a';
        const s = k < 0.5 ? 2 : 1; ctx.fillRect(Math.round(f.x), Math.round(f.y), s, s + 1);
      } else if (f.k === 'ember') { ctx.fillStyle = Math.random() < 0.5 ? '#ffb040' : '#ff6020'; ctx.fillRect(Math.round(f.x), Math.round(f.y), 1, 1); }
      else if (f.k === 'bolt') {
        const a = f.from(), b = f.to();
        if (!a || !b) continue;
        for (let pass = 0; pass < 2; pass++) {
          const pts = [a];
          const n = Math.max(4, Math.floor(Math.hypot(b.x - a.x, b.y - a.y) / 5));
          for (let i = 1; i < n; i++) pts.push({ x: a.x + (b.x - a.x) * i / n + rand(-4, 4), y: a.y + (b.y - a.y) * i / n + rand(-5, 5) });
          pts.push(b);
          for (let i = 0; i < pts.length - 1; i++) {
            const p = pts[i], q = pts[i + 1], st = Math.ceil(Math.hypot(q.x - p.x, q.y - p.y));
            for (let s = 0; s <= st; s++) {
              const X = Math.round(p.x + (q.x - p.x) * s / st), Y = Math.round(p.y + (q.y - p.y) * s / st);
              ctx.fillStyle = f.col; ctx.fillRect(X - 1, Y - 1, 3, 3);
              ctx.fillStyle = '#fff'; ctx.fillRect(X, Y, 1, 1);
            }
          }
          if (Math.random() < 0.5) break;
        }
      }
    }
  },
  drawLights(ctx) {
    ctx.globalCompositeOperation = 'lighter';
    for (const f of this.fx) {
      if (f.k === 'light' || f.k === 'bolt') {
        const L = f.k === 'bolt' ? { ...f.to(), r: 70, col: f.col } : f;
        if (!L || L.x === undefined) continue;
        const a = (1 - f.t / f.life) * (f.k === 'bolt' ? rand(0.12, 0.3) : 0.45);
        const g = ctx.createRadialGradient(L.x, L.y, 0, L.x, L.y, L.r);
        g.addColorStop(0, L.col); g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.globalAlpha = a; ctx.fillStyle = g; ctx.fillRect(L.x - L.r, L.y - L.r, L.r * 2, L.r * 2);
      }
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  },
  drawLens(ctx) {
    for (const L of this.lens) {
      const a = Math.min(1, (L.life - L.t) / 1.2) * 0.9;
      ctx.globalAlpha = a;
      for (const [dx, dy, s] of L.drops) { ctx.fillStyle = '#7a0812'; ctx.fillRect(Math.round(L.x + dx), Math.round(L.y + dy), Math.round(s), Math.round(s)); }
      for (const r of L.runs) {
        ctx.fillStyle = '#6a0610'; ctx.fillRect(Math.round(L.x + r.x), Math.round(L.y), 2, Math.round(r.len));
        ctx.fillStyle = '#8e0c18'; ctx.fillRect(Math.round(L.x + r.x), Math.round(L.y + r.len), 2, 2);
      }
      for (const [dx, dy, s] of L.drops) if (s > 2.3) { ctx.fillStyle = '#c83040'; ctx.fillRect(Math.round(L.x + dx), Math.round(L.y + dy), 1, 1); }
    }
    ctx.globalAlpha = 1;
  },
};
