// Articulated pixel-sprite characters. Angles: limbs use "down = 0, forward = +",
// torso/head use "up = 0, lean forward = +". Local space faces right; facing flips.
const POSE_KEYS = ['bx', 'by', 't', 'h', 'ua', 'fa', 'ub', 'fb', 'w', 's', 'la', 'lk', 'ra', 'rk', 'rot', 'jz'];
const EASE = {
  lin: k => k,
  out: k => 1 - Math.pow(1 - k, 3),
  in: k => k * k * k,
  io: k => k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2,
  back: k => { const c = 1.9; return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2); },
  snap: k => 1 - Math.pow(1 - k, 5),
};
const UPPER_PARTS = new Set(['cape', 'upperB', 'foreB', 'torso', 'head', 'shield', 'weapon', 'upper', 'fore']);

class Rig {
  constructor(type, faction) {
    this.type = type; this.faction = faction; this.T = TYPES[type];
    this.spr = spritesFor(type, faction);
    this.x = 0; this.y = 0; this.facing = faction === 'w' ? 1 : -1;
    this.pose = {}; POSE_KEYS.forEach(k => this.pose[k] = 0);
    this.dyn = {};
    this.setPose(this.T.rest);
    this.tweens = []; this.detached = {};
    this.upper = { on: false, free: false, dx: 0, dy: 0, rot: 0, vx: 0, vy: 0, vr: 0, landed: false };
    this.sqx = 1; this.sqy = 1; this.mode = 'normal'; this.flash = 0; this.blood = 0; this.kills = 0;
    this.phase = Math.random() * 10; this.walkPh = 0; this.move = null; this.spasm = 0; this.spasmAmt = 1;
    this.alive = true; this.hidden = false; this.alpha = 1; this.glow = 0; this.selected = false;
    this.items = []; this.J = {};
    this.solve();
  }
  get hipH() { return this.T.thigh + this.T.shin; }
  resolve(target) {
    const o = Object.assign({}, target);
    if ('gw' in o) {
      const g = k => (k in o ? o[k] : this.pose[k]);
      o.w = o.gw - (g('t') + g('ua') + g('fa'));
      delete o.gw;
    }
    return o;
  }
  setPose(target) {
    const o = this.resolve(target);
    for (const k in o) this.pose[k] = o[k];
  }
  rest(dur = 0.3, extra) { return this.tween(Object.assign({ bx: 0, by: 0, h: 0, rot: 0, jz: 0 }, this.T.rest, extra || {}), dur, 'io'); }
  tween(target, dur, ease = 'out') {
    const o = this.resolve(target);
    const from = {}, to = {};
    for (const k in o) { from[k] = this.pose[k]; to[k] = o[k]; }
    for (const tw of this.tweens) for (const k in to) delete tw.to[k];
    const tw = { from, to, t: 0, d: Math.max(0.001, dur), ease: EASE[ease] || EASE.out };
    this.tweens.push(tw);
    return { done: () => tw.t >= tw.d };
  }
  walkTo(x, y, speed = 70, jump = 0) {
    const dist = Math.hypot(x - this.x, y - this.y);
    if (dist < 0.5) { this.x = x; this.y = y; return { done: () => true }; }
    if (Math.abs(x - this.x) > 1) this.facing = Math.sign(x - this.x);
    const m = { x0: this.x, y0: this.y, tx: x, ty: y, t: 0, dur: dist / speed, jump, speed };
    this.move = m;
    return { done: () => this.move !== m };
  }
  update(dt, time) {
    for (let i = this.tweens.length - 1; i >= 0; i--) {
      const tw = this.tweens[i];
      tw.t += dt;
      const k = tw.ease(Math.min(1, tw.t / tw.d));
      for (const key in tw.to) this.pose[key] = tw.from[key] + (tw.to[key] - tw.from[key]) * k;
      if (tw.t >= tw.d) this.tweens.splice(i, 1);
    }
    const d = this.dyn;
    for (const k in d) d[k] *= Math.pow(0.001, dt);
    if (this.move) {
      const m = this.move;
      m.t += dt;
      const p = Math.min(1, m.t / m.dur);
      if (m.jump) {
        const e = EASE.io(p);
        this.x = m.x0 + (m.tx - m.x0) * e; this.y = m.y0 + (m.ty - m.y0) * e;
        this.pose.jz = Math.sin(Math.PI * p) * m.jump;
        d.la = 0.8 * Math.sin(Math.PI * p); d.lk = -1.2 * Math.sin(Math.PI * p); d.ra = -0.6 * Math.sin(Math.PI * p); d.rk = -1.0 * Math.sin(Math.PI * p);
        d.t = -0.2 * Math.sin(Math.PI * p);
      } else {
        this.x = m.x0 + (m.tx - m.x0) * p; this.y = m.y0 + (m.ty - m.y0) * p;
        const prev = Math.sin(this.walkPh);
        this.walkPh += dt * m.speed * 0.2 * (8 / this.hipH);
        const s = Math.sin(this.walkPh), c = Math.cos(this.walkPh);
        if ((prev < 0) !== (s < 0) && this.onStep) this.onStep(this);
        const sw = this.T.golem ? 0.35 : 0.55;
        d.la = s * sw; d.ra = -s * sw;
        d.lk = -Math.max(0, c) * 0.7; d.rk = -Math.max(0, -c) * 0.7;
        d.ua = -s * 0.3; d.ub = s * 0.35; d.by = -Math.abs(s) * 1.2 + 0.6; d.t = 0.08;
      }
      if (p >= 1) { this.move = null; this.pose.jz = 0; if (m.jump && this.onLand) this.onLand(this); }
    }
    // breathing + weapon sway
    if (this.alive && !this.move) {
      d.by = (d.by || 0) * 0.5 + (Math.sin(time * 2.2 + this.phase) > 0.2 ? 0.5 : 0);
      d.w = Math.sin(time * 1.3 + this.phase) * 0.05;
    }
    if (this.spasm > 0) {
      this.spasm -= dt;
      const a = this.spasmAmt;
      for (const k of ['ua', 'fa', 'ub', 'fb', 'h', 'la', 'ra']) d[k] = (Math.random() - 0.5) * 0.9 * a;
      d.t = (Math.random() - 0.5) * 0.25 * a;
    }
    if (this.flash > 0) this.flash -= dt;
    if (this.glow > 0) this.glow -= dt;
    const u = this.upper;
    if (u.free && !u.landed) {
      u.vy += 320 * dt; u.dx += u.vx * dt; u.dy += u.vy * dt; u.rot += u.vr * dt;
      const floor = this.hipH - 2;
      if (u.dy > floor) {
        u.dy = floor;
        if (u.vy > 60) { u.vy *= -0.3; u.vx *= 0.5; u.vr *= 0.4; if (this.onUpperBounce) this.onUpperBounce(this); }
        else { u.vy = 0; u.vx = 0; u.vr = 0; u.landed = true; }
      }
    }
    if (u.free && u.landed) {
      const target = Math.round(u.rot / Math.PI * 2) * Math.PI / 2 || (u.rot >= 0 ? Math.PI / 2 : -Math.PI / 2);
      u.rot += (target - u.rot) * Math.min(1, dt * 8);
    }
  }
  // lift a fallen body so it lies on, not in, the floor
  get lift() { return Math.abs(Math.sin(this.pose.rot)) * this.T.tw * 0.4; }

  solve() {
    const T = this.T, p = this.pose, d = this.dyn;
    const g = k => p[k] + (d[k] || 0);
    const hipH = this.hipH;
    const P = { x: g('bx'), y: -hipH + g('by') };
    const t = g('t');
    const up = L => ({ x: P.x + Math.sin(t) * L, y: P.y - Math.cos(t) * L });
    const dir = (o, a, L) => ({ x: o.x + Math.sin(a) * L, y: o.y + Math.cos(a) * L });
    const neck = up(T.torso - (T.golem ? 4 : 0));
    const sh = up(T.torso - (T.golem ? 4 : 2));
    const g1 = t + g('ua'), elbow = dir(sh, g1, T.upper), g2 = g1 + g('fa'), hand = dir(elbow, g2, T.fore);
    const gw = g2 + g('w');
    const shB = { x: sh.x - (T.golem ? 4 : 1), y: sh.y };
    const b1 = t + g('ub'), elbowB = dir(shB, b1, T.upper), b2 = b1 + g('fb'), handB = dir(elbowB, b2, T.fore);
    const hipF = { x: P.x + (T.golem ? 3 : 1), y: P.y }, hipB = { x: P.x - (T.golem ? 3 : 1), y: P.y };
    const la = g('la'), kneeF = dir(hipF, la, T.thigh), sa = la + g('lk'), footF = dir(kneeF, sa, T.shin);
    const ra = g('ra'), kneeB = dir(hipB, ra, T.thigh), sb = ra + g('rk'), footB = dir(kneeB, sb, T.shin);
    const head = t + g('h');
    this.J = { pelvis: P, neck, sh, elbow, hand, gw, elbowB, handB, kneeF, kneeB, footF, footB, t, head, chest: up(T.torso * 0.62), belly: up(T.torso * 0.3), headTop: { x: neck.x + Math.sin(head) * 7, y: neck.y - Math.cos(head) * 7 } };
    const it = [];
    const add = (name, x, y, ang, back) => { if (this.spr[name.replace(/B$/, '')] || name === 'weapon') it.push({ name, x, y, ang, back, upper: UPPER_PARTS.has(name) }); };
    if (T.cape) add('cape', neck.x - 2, neck.y + 1, -(-0.18 - t * 0.4 + (d.t || 0) * 0.5 - Math.abs(d.la || 0) * 0.15));
    add('thighB', hipB.x, hipB.y, -ra, true); add('shinB', kneeB.x, kneeB.y, -sb, true);
    add('upperB', shB.x, shB.y, -b1, true); add('foreB', elbowB.x, elbowB.y, -b2, true);
    add('thigh', hipF.x, hipF.y, -la); add('shin', kneeF.x, kneeF.y, -sa);
    if (T.skirt) add('skirt', P.x, P.y - 1, -((d.la || 0) * 0.15));
    add('torso', P.x, P.y, t);
    add('head', neck.x, neck.y, head);
    if (T.shield) add('shield', handB.x, handB.y, -(b2 + g('s')));
    if (T.weapon) add('weapon', hand.x, hand.y, -gw);
    add('upper', sh.x, sh.y, -g1); add('fore', elbow.x, elbow.y, -g2);
    this.items = it;
    return it;
  }

  spriteFor(item, override) {
    const base = item.name.replace(/B$/, '');
    let s;
    if (this.mode === 'skel' && this.spr.skel[base]) s = this.spr.skel[base];
    else if (this.mode === 'skel' && (base === 'cape' || base === 'skirt')) return null;
    else s = this.spr[base];
    if (!s) return null;
    if (override) return variant(s, override);
    if (this.flash > 0) return variant(s, 'flash');
    if (this.mode === 'char' && base !== 'weapon') s = variant(s, 'char');
    else if (this.blood > 0 && this.mode === 'normal') s = variant(s, 'blood' + Math.min(3, this.blood));
    if (item.back) s = variant(s, 'back');
    return s;
  }

  applyXf(ctx, item) {
    const u = this.upper;
    if (!(item.upper && u.free)) { ctx.translate(0, -this.lift / this.sqy); ctx.rotate(this.pose.rot); }
    if (item.upper && u.on) {
      const P = this.J.pelvis;
      ctx.translate(P.x + u.dx, P.y + u.dy); ctx.rotate(u.rot); ctx.translate(-P.x, -P.y);
    }
  }

  draw(ctx, override) {
    if (this.hidden) return;
    this.solve();
    ctx.save();
    ctx.globalAlpha = this.alpha;
    ctx.translate(Math.round(this.x), Math.round(this.y - this.pose.jz));
    ctx.scale(this.facing * this.sqx, this.sqy);
    for (const item of this.items) {
      if (this.detached[item.name]) continue;
      const s = this.spriteFor(item, override);
      if (!s) continue;
      ctx.save();
      this.applyXf(ctx, item);
      ctx.translate(Math.round(item.x), Math.round(item.y));
      ctx.rotate(item.ang);
      ctx.drawImage(s.c, -s.ax, -s.ay);
      ctx.restore();
    }
    ctx.restore();
  }

  // local -> world
  toWorld(lx, ly, isUpper) {
    let x = lx, y = ly;
    const u = this.upper;
    if (isUpper && u.on) {
      const P = this.J.pelvis, dx = x - P.x, dy = y - P.y, c = Math.cos(u.rot), s = Math.sin(u.rot);
      x = P.x + dx * c - dy * s + u.dx; y = P.y + dx * s + dy * c + u.dy;
    }
    let lift = 0;
    if (!(isUpper && u.free)) {
      const r = this.pose.rot, c = Math.cos(r), s = Math.sin(r);
      [x, y] = [x * c - y * s, x * s + y * c];
      lift = this.lift;
    }
    return { x: this.x + x * this.facing * this.sqx, y: this.y - this.pose.jz - lift + y * this.sqy };
  }
  joint(name) {
    this.solve();
    const j = this.J[name];
    return this.toWorld(j.x, j.y, name !== 'pelvis' && name !== 'kneeF' && name !== 'kneeB' && name !== 'footF' && name !== 'footB');
  }
  // world-space spray angle (x/z plane, 0 = +x, PI/2 = straight up) of the body's "up" at a joint
  upAngle(name, isUpper = true) {
    this.solve();
    const j = this.J[name], t = this.J.t;
    const a = this.toWorld(j.x, j.y, isUpper), b = this.toWorld(j.x + Math.sin(t) * 4, j.y - Math.cos(t) * 4, isUpper);
    return Math.atan2(-(b.y - a.y), b.x - a.x);
  }
  weaponTip() {
    this.solve();
    const h = this.J.hand, L = { spear: 17, greatsword: 22, mace: 13, staff: 13, labrys: 18 }[this.T.weapon] || 6;
    return this.toWorld(h.x + Math.sin(this.J.gw) * L, h.y + Math.cos(this.J.gw) * L, true);
  }
  // Detach a part into a free-flying gib. Returns {spr,x,y,ang,flip}.
  detach(name) {
    this.solve();
    const item = this.items.find(i => i.name === name);
    if (!item || this.detached[name]) return null;
    const s = this.spriteFor(item);
    this.detached[name] = true;
    if (!s) return null;
    const pos = this.toWorld(item.x, item.y, item.upper);
    let ang = item.ang;
    if (!(item.upper && this.upper.free)) ang += this.pose.rot;
    if (item.upper && this.upper.on) ang += this.upper.rot;
    return { spr: s, x: pos.x, y: pos.y, ang, flip: this.facing < 0 };
  }
  detachAll() {
    this.solve();
    const out = [];
    for (const it of this.items) { const g = this.detach(it.name); if (g) out.push(Object.assign(g, { name: it.name })); }
    this.hidden = true;
    return out;
  }
}
