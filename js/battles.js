// Fight choreography. Every capture is a little snuff film.
const PI = Math.PI;
const G = {
  ready: { t: 0.18, by: 1, la: 0.45, lk: -0.35, ra: -0.35, rk: -0.1 },
  guard: { t: 0.0, ua: 1.1, fa: 0.5, gw: PI - 0.15, ub: 1.0, fb: 0.7, bx: -1 },
  hurt: { t: -0.4, h: -0.35, ua: -0.5, fa: 0.6, ub: -0.7, fb: 0.4, bx: -3, la: 0.5, lk: -0.2, ra: -0.15 },
  cower: { t: -0.25, h: 0.3, ua: 2.3, fa: 1.3, ub: 2.1, fb: 1.1, by: 2, bx: -2 },
  swingWind: { t: -0.25, ua: -0.9, fa: 0.9, gw: PI + 0.7, bx: -1 },
  swingStrike: { t: 0.3, ua: 1.35, fa: 0.3, gw: PI / 2 + 0.25, bx: 3 },
  victory: { t: -0.12, h: -0.25, ua: 2.7, fa: 0.3, gw: PI, ub: 0.5, fb: 0.9, bx: 0, by: 0 },
  limp: { ua: -0.3, fa: 0.2, ub: 0.3, fb: 0.1, h: 0.5 },
};
const kneel = r => ({ by: r.T.thigh * 0.9, t: 0.35, h: 0.3, la: 1.45, lk: -1.45, ra: 0.05, rk: -1.5, ua: 0.3, fa: 0.2, ub: 0.1, fb: 0.2 });
const FNAME = { w: 'WHITE', b: 'BLACK' };
const rigName = r => FNAME[r.faction] + ' ' + r.T.name;

const BATTLE = (() => {
  // angle in the x/z plane pointing away from the attacker, elevated by `elev`
  const away = (att, elev) => att.facing > 0 ? elev : PI - elev;
  const contact = (att, vic) => ({ x: (att.x + vic.x) / 2, y: vic.y - vic.hipH - 6 });
  const jz = (r, j) => { const p = r.joint(j); return { x: p.x, y: r.y, z: Math.max(1, r.y - p.y) }; };

  function dropGear(vic, att) {
    for (const n of ['weapon', 'shield']) {
      const d = vic.detach(n);
      if (d) WORLD.gibFromPart(d, vic.y, { vx: att.facing * rand(10, 50), vy: rand(-8, 8), vz: rand(30, 70), vang: rand(-10, 10), bake: rand(3, 5), bakeAs: null });
    }
  }
  function neckFountain(vic, o = {}) {
    return WORLD.emit(() => { const p = jz(vic, 'neck'); return { x: p.x, y: p.y, z: p.z, ang: vic.upAngle('neck') }; },
      Object.assign({ rate: 240, dur: 4.2, speed: 150, spread: 0.3, pulse: 1.7, big: 0.35 }, o));
  }

  function* clash(att, vic, attackerSwings = true) {
    const a = attackerSwings ? att : vic, d = attackerSwings ? vic : att;
    a.tween(G.swingWind, 0.2, 'out'); d.tween(G.guard, 0.18, 'out'); SFX.whoosh(); SFX.grunt(a.T.pitch);
    yield 0.22;
    a.tween(G.swingStrike, 0.07, 'in');
    yield 0.07;
    const m = contact(att, vic);
    if (!attackerSwings && Math.random() < 0.35) {
      // the parry fails: the victim draws blood before dying
      const c = jz(d, 'chest');
      WORLD.spray(c.x, c.y, c.z, d.facing > 0 ? PI - 0.3 : 0.3, 0.8, 110, 30);
      SFX.slash(); SFX.squish(); SFX.grunt(d.T.pitch * 0.8);
      WORLD.shake(0.45); WORLD.stop(0.08); WORLD.splatLens(1);
      d.flash = 0.06; d.tween(G.hurt, 0.08); d.spasm = 0.2; d.spasmAmt = 0.4;
      d.blood = Math.max(d.blood, 1);
      yield 0.3;
      a.rest(0.18, G.ready); d.rest(0.25, G.ready);
      yield 0.25;
      return;
    }
    WORLD.spark(m.x, m.y, 16); SFX.clang(); WORLD.shake(0.28); WORLD.stop(0.05); WORLD.light(m.x, m.y, 36, '#ffe0a0', 0.2);
    if (d.T.golem) WORLD.chunks(m.x, d.y, d.y - m.y, 3, 40, CHUNKS.rock[d.faction]);
    d.tween({ bx: -3, t: -0.1 }, 0.08);
    yield 0.14;
    a.rest(0.18, G.ready); d.rest(0.18, G.ready);
    yield 0.2;
  }

  function* fallDead(vic, att, forward = 1) {
    vic.alive = false;
    dropGear(vic, att);
    vic.tween(Object.assign({ rot: forward * PI / 2, by: 0, t: 0.1, la: 0.2, lk: -0.2, ra: -0.1, rk: -0.3 }, G.limp), 0.5, 'in');
    yield 0.5;
    SFX.step(true); SFX.squish(); WORLD.shake(0.35);
    WORLD.dust(vic.x + vic.facing * forward * 14, vic.y, 8);
    const c = vic.joint('chest');
    WORLD.pool(c.x, vic.y + 1, 10 + vic.T.tw * 0.6, 5);
    WORLD.spray(c.x, vic.y, 2, PI / 2, 2.6, 60, 25);
    vic.spasm = 0.6; vic.spasmAmt = 0.3;
  }

  // ---------------- PAWN: the skewering ----------------
  function* pawn(att, vic) {
    yield* clash(att, vic, true);
    if (Math.random() < 0.6) yield* clash(att, vic, false);
    att.tween({ t: -0.2, bx: -3, ua: -0.7, fa: 2.2, gw: PI / 2, la: 0.1, lk: 0, ra: -0.55, rk: 0 }, 0.28, 'out');
    SFX.grunt(1.3); vic.tween(G.guard, 0.2);
    yield 0.34;
    for (let i = 0; i < 3; i++) {
      att.tween({ t: 0.35, bx: 7, ua: 1.05, fa: 0.5, gw: PI / 2 + 0.06, la: 0.75, lk: -0.35, ra: -0.5 }, 0.06, 'in');
      yield 0.06;
      const b = jz(vic, 'belly');
      WORLD.spray(b.x, b.y, b.z, away(att, 0.25), 0.6, 160, 45, { big: 0.3 });
      WORLD.spray(b.x, b.y, b.z, away(att, 0.3) + PI, 0.9, 70, 18);
      SFX.squish(); SFX.splat(0.6 + i * 0.3);
      if (i === 0) SFX.scream(vic.T.pitch, 1.2);
      WORLD.shake(i === 2 ? 0.75 : 0.4); WORLD.stop(i === 2 ? 0.16 : 0.07);
      if (i === 2) { WORLD.splatLens(3); WORLD.doFlash('#ff2020', 0.25); WORLD.slowmo(0.35, 0.3); }
      vic.flash = 0.05;
      vic.tween({ t: 0.5, h: 0.45, ua: 0.8, fa: 0.9, ub: 0.9, fb: 0.8, bx: 2, by: 1 }, 0.1); vic.spasm = 0.3; vic.spasmAmt = 0.5;
      if (i === 0) WORLD.emit(() => { const p = jz(vic, 'belly'); return { x: p.x, y: p.y, z: p.z, ang: away(att, -0.2) + PI }; }, { rate: 70, dur: 4, speed: 45, spread: 0.9, pulse: 1.4 });
      yield 0.2;
      if (i < 2) { att.tween({ t: 0.05, bx: -1, ua: 0.1, fa: 1.7, gw: PI / 2 }, 0.13, 'out'); yield 0.15; }
    }
    // wrench the spear free
    att.tween({ t: -0.3, bx: -5, ua: -0.5, fa: 2.0, gw: PI / 2 + 0.25 }, 0.2, 'out'); SFX.gush(1.5);
    const b = jz(vic, 'belly');
    WORLD.spray(b.x, b.y, b.z, away(att, 0.35) + PI, 0.5, 130, 70, { big: 0.4 });
    WORLD.chunks(b.x, b.y, b.z, 5, 80, CHUNKS.meat, { ang: away(att, 0.6) + PI, spread: 1 });
    WORLD.chunks(b.x, b.y, b.z, 1, 60, CHUNKS.organ, { ang: away(att, 0.6) + PI, spread: 0.5 });
    WORLD.rope(() => vic.joint('belly'), () => null, 8, 2, vic.y + 1).broken = true;
    vic.tween(kneel(vic), 0.35, 'out');
    yield 0.75;
    vic.spasm = 0.5;
    yield 0.35;
    yield* fallDead(vic, att, 1);
    return 'SKEWERED!';
  }

  // ---------------- KNIGHT: cleaved in twain ----------------
  function* knight(att, vic) {
    yield* clash(att, vic, true);
    yield* clash(att, vic, false);
    att.tween({ t: -0.4, bx: -3, ua: -1.7, fa: 0.5, gw: PI + 1.35, ub: -1.3, fb: 0.7, la: 0.05, ra: -0.55 }, 0.32, 'out');
    SFX.grunt(0.9); vic.tween(G.guard, 0.25);
    yield 0.4;
    WORLD.slowmo(0.22, 0.55);
    att.tween({ t: 0.45, bx: 8, ua: 1.55, fa: 0.1, gw: PI / 2 + 0.12, ub: 1.3, fb: 0.3, la: 0.8, lk: -0.35, ra: -0.55 }, 0.08, 'in');
    SFX.whoosh(1.3);
    yield 0.08;
    const P = jz(vic, 'pelvis');
    SFX.slash(); SFX.splat(1.5); SFX.scream(vic.T.pitch, 1.4);
    WORLD.shake(0.95); WORLD.stop(0.17); WORLD.doFlash('#ff2020', 0.35); WORLD.splatLens(4);
    const u = vic.upper;
    u.on = true; u.free = true; u.vx = -rand(45, 75); u.vy = -rand(120, 160); u.vr = -rand(4, 7);
    vic.alive = false;
    vic.onUpperBounce = () => { SFX.splat(0.7); const p = vic.toWorld(vic.J.pelvis.x, vic.J.pelvis.y, true); WORLD.splatBig(p.x, vic.y, 5); };
    WORLD.emit(() => { const p = jz(vic, 'pelvis'); return { x: p.x, y: p.y, z: p.z, ang: vic.upAngle('pelvis', false) }; }, { rate: 230, dur: 3.4, speed: 135, spread: 0.45, pulse: 1.8, big: 0.35 });
    WORLD.emit(() => { vic.solve(); const p = vic.toWorld(vic.J.pelvis.x, vic.J.pelvis.y, true); return { x: p.x, y: vic.y, z: Math.max(1, vic.y - p.y), ang: rand(0, 6.28) }; }, { rate: 120, dur: 2.2, speed: 60, spread: 1.5 });
    WORLD.burst(P.x, P.y, P.z, 140, 150);
    WORLD.chunks(P.x, P.y, P.z, 9, 100, CHUNKS.meat);
    WORLD.chunks(P.x, P.y, P.z, 2, 70, CHUNKS.organ);
    WORLD.rope(() => vic.joint('pelvis'), () => { vic.solve(); return vic.toWorld(vic.J.pelvis.x, vic.J.pelvis.y, true); }, 16, 2.2, vic.y + 2);
    vic.spasm = 1.1; vic.spasmAmt = 0.6;
    yield 0.45;
    att.tween({ t: 0.2, ua: 2.2, fa: 0.2, gw: 0.4 }, 0.35);
    yield 1.0;
    vic.tween({ la: 0.9, lk: -1.2, ra: -0.4, rk: -0.3, by: 3 }, 0.3);
    yield 0.35;
    vic.tween({ rot: -PI / 2 }, 0.4, 'in');
    yield 0.4;
    SFX.step(true); WORLD.pool(vic.x, vic.y + 1, 13, 5); WORLD.shake(0.2);
    return 'CLEAVED IN TWAIN!';
  }

  // ---------------- BISHOP: skull crushed ----------------
  function* bishop(att, vic) {
    yield* clash(att, vic, true);
    yield* clash(att, vic, false);
    att.tween({ t: -0.35, bx: -1, ua: 2.9, fa: 0.5, gw: PI + 1.3, ub: 1.6, fb: 0.4, la: 0.1, ra: -0.45 }, 0.35, 'out');
    SFX.grunt(0.8);
    vic.tween(G.cower, 0.3); vic.spasm = 0.5; vic.spasmAmt = 0.25;
    yield 0.55;
    WORLD.slowmo(0.3, 0.4);
    att.tween({ t: 0.55, bx: 5, by: 2, ua: 1.05, fa: 0.1, gw: 1.0, ub: 0.9, fb: 0.2, la: 0.65, lk: -0.3, ra: -0.5 }, 0.075, 'in');
    SFX.whoosh(0.8);
    yield 0.075;
    const hd = jz(vic, 'headTop');
    vic.detached.head = true; vic.alive = false;
    SFX.crunch(); SFX.splat(1.7);
    WORLD.shake(1.05); WORLD.stop(0.2); WORLD.doFlash('#ffffff', 0.5); WORLD.splatLens(6, 1.2);
    WORLD.burst(hd.x, hd.y, hd.z, 240, 170);
    WORLD.chunks(hd.x, hd.y, hd.z, 9, 110, CHUNKS.bone);
    WORLD.chunks(hd.x, hd.y, hd.z, 10, 120, CHUNKS.brain);
    WORLD.chunks(hd.x, hd.y, hd.z, 5, 90, CHUNKS.meat);
    for (let i = 0; i < 2; i++) WORLD.gib(CHUNKS.eye, hd.x, hd.y, hd.z, { vx: rand(-70, 70), vy: rand(-10, 10), vz: rand(60, 130), vang: rand(-10, 10), roll: 2, bloody: true, bake: 6 });
    WORLD.gib(CHUNKS.jaw, hd.x, hd.y, hd.z - 3, { vx: att.facing * rand(30, 70), vz: rand(40, 80), vang: rand(-12, 12), bloody: true });
    WORLD.splatBig(hd.x + att.facing * 12, vic.y, 11, att.facing);
    neckFountain(vic);
    vic.spasm = 1.6; vic.spasmAmt = 1;
    yield 0.4;
    att.tween({ t: 0.1, by: 0, bx: 1, ua: 0.5, fa: 0.6, gw: 0.6 }, 0.4);
    vic.tween({ t: -0.3, bx: -3, ua: -0.3, ub: -0.5 }, 0.5);
    yield 0.65;
    vic.tween({ t: 0.25, bx: 0 }, 0.4);
    yield 0.5;
    vic.tween(kneel(vic), 0.3);
    yield 0.55;
    yield* fallDead(vic, att, Math.random() < 0.5 ? 1 : -1);
    return 'SKULL CRUSHED!';
  }

  // ---------------- ROOK: pulverized ----------------
  function* rook(att, vic) {
    att.tween({ t: -0.3, h: -0.4, ua: 2.1, fa: 0.9, ub: 2.2, fb: 0.9 }, 0.3); SFX.roar(); WORLD.shake(0.45);
    vic.tween(G.cower, 0.2); vic.spasm = 0.9; vic.spasmAmt = 0.25;
    yield 0.6;
    att.rest(0.25);
    yield 0.3;
    // the futile strike
    vic.rest(0.15, G.swingWind); SFX.grunt(vic.T.pitch);
    yield 0.2;
    vic.tween(G.swingStrike, 0.07, 'in');
    yield 0.07;
    const m = contact(att, vic);
    WORLD.spark(m.x, m.y, 10, '#ffe0a0'); SFX.clang(); WORLD.shake(0.2);
    WORLD.chunks(m.x, att.y, att.y - m.y, 4, 40, CHUNKS.rock[att.faction]);
    att.tween({ h: 0.35 }, 0.12);
    yield 0.45;
    vic.tween(G.cower, 0.15); vic.spasm = 1; vic.spasmAmt = 0.3;
    att.tween({ t: -0.3, h: -0.3, ua: 3.05, fa: 0.25, ub: 3.1, fb: 0.25, by: -1, jz: 9, bx: 3 }, 0.4, 'out'); SFX.roar();
    yield 0.45;
    WORLD.slowmo(0.3, 0.3);
    att.tween({ t: 0.75, h: 0.3, ua: 1.35, fa: 0.1, ub: 1.35, fb: 0.1, by: 4, jz: 0, bx: 6 }, 0.09, 'in');
    yield 0.09;
    WORLD.run((function* () { for (let i = 1; i <= 4; i++) { vic.sqy = 1 - 0.84 * (i / 4); vic.sqx = 1 + 0.9 * (i / 4); yield 0.012; } })());
    vic.alive = false; vic.blood = 3;
    dropGear(vic, att);
    SFX.boom(1.3); SFX.crunch(); SFX.splat(2);
    WORLD.shake(1.25); WORLD.stop(0.26); WORLD.doFlash('#ff1010', 0.5); WORLD.splatLens(8, 1.4);
    WORLD.splatBig(vic.x, vic.y, 20);
    WORLD.pool(vic.x, vic.y + 1, 19, 10);
    for (let i = 0; i < 280; i++) { const a = rand(0, 6.28), s = rand(40, 240); WORLD.drop(vic.x, vic.y, 3, Math.cos(a) * s, Math.sin(a) * s * 0.5, rand(10, 100), Math.random() < 0.3 ? 2 : 1); }
    WORLD.chunks(vic.x, vic.y, 4, 14, 150, CHUNKS.meat);
    WORLD.chunks(vic.x, vic.y, 4, 8, 120, CHUNKS.bone);
    WORLD.chunks(vic.x, vic.y, 4, 3, 90, CHUNKS.organ);
    WORLD.chunks(vic.x, vic.y, 4, 8, 130, CHUNKS.shard[vic.faction]);
    for (let i = 0; i < 2; i++) WORLD.gib(CHUNKS.eye, vic.x, vic.y, 4, { vx: rand(-90, 90), vy: rand(-15, 15), vz: rand(60, 110), roll: 2, bloody: true, bake: 6 });
    WORLD.ring(vic.x, vic.y, 44, '#ffd0a0'); WORLD.dust(vic.x, vic.y, 22);
    yield 0.7;
    for (const hj of ['hand', 'handB']) WORLD.emit(() => { const p = att.joint(hj); return { x: p.x, y: att.y, z: Math.max(1, att.y - p.y), ang: -PI / 2 }; }, { rate: 25, dur: 2.5, speed: 6, spread: 0.3 });
    att.tween({ t: -0.2, h: -0.4, ua: 2.5, fa: 1.7, ub: 2.5, fb: 1.7, by: 0 }, 0.3);
    yield 0.3;
    SFX.roar(); WORLD.shake(0.35);
    for (let i = 0; i < 3; i++) { att.tween({ fa: 1.2, fb: 2.0 }, 0.08); yield 0.1; att.tween({ fa: 2.0, fb: 1.2 }, 0.08); SFX.step(true); yield 0.1; }
    return 'PULVERIZED!';
  }

  // ---------------- QUEEN: sorcery ----------------
  function* queenBolt(att, vic) {
    const col = att.faction === 'w' ? '#60c8ff' : '#ff4020';
    att.tween({ t: -0.15, h: -0.2, ua: 2.7, fa: 0.2, gw: PI, ub: 1.55, fb: 0.05, la: 0.2, ra: -0.3 }, 0.4); SFX.magic();
    vic.tween(G.cower, 0.3);
    for (let i = 0; i < 12; i++) { const tp = att.weaponTip(); WORLD.spark(tp.x, tp.y, 2, col); WORLD.light(tp.x, tp.y, 30, col, 0.08); yield 0.05; }
    WORLD.bolt(() => att.weaponTip(), () => vic.joint('chest'), 1.5, col);
    WORLD.bolt(() => att.joint('handB'), () => vic.joint('head' in vic.J ? 'headTop' : 'chest'), 1.5, col);
    SFX.zap(); SFX.scream(vic.T.pitch * 1.25, 1.7);
    vic.alive = false;
    for (let i = 0; i < 24; i++) {
      vic.mode = i % 2 ? 'skel' : 'normal';
      vic.flash = i % 5 === 0 ? 0.04 : 0;
      vic.spasm = 0.1; vic.spasmAmt = 1.7; vic.pose.jz = rand(0, 5);
      WORLD.shake(0.12);
      const c = vic.joint('chest'); WORLD.spark(c.x, c.y, 3, col);
      if (i % 6 === 0) SFX.zap();
      yield 0.06;
    }
    vic.mode = 'normal'; vic.blood = 3; vic.sqx = 1.15; vic.sqy = 1.1; vic.flash = 0.12;
    yield 0.14;
    const c = jz(vic, 'chest');
    for (const d of vic.detachAll()) {
      WORLD.gibFromPart(d, vic.y, { vx: rand(-110, 110), vy: rand(-20, 20), vz: rand(90, 220), vang: rand(-22, 22), bleed: d.name === 'weapon' || d.name === 'shield' ? 0 : 1.6, bloody: true, pool: d.name === 'torso' ? 7 : 3, roll: d.name === 'head' ? 3 : 0, bake: rand(4, 6) });
    }
    WORLD.burst(c.x, c.y, c.z, 420, 230);
    WORLD.chunks(c.x, c.y, c.z, 22, 170, CHUNKS.meat);
    WORLD.chunks(c.x, c.y, c.z, 4, 120, CHUNKS.organ);
    WORLD.chunks(c.x, c.y, c.z, 8, 150, CHUNKS.bone);
    WORLD.chunks(c.x, c.y, c.z, 5, 150, CHUNKS.brain);
    for (let i = 0; i < 2; i++) WORLD.gib(CHUNKS.eye, c.x, c.y, c.z, { vx: rand(-100, 100), vz: rand(80, 160), roll: 2, bloody: true, bake: 6 });
    SFX.boom(1.2); SFX.splat(2);
    WORLD.shake(1.2); WORLD.stop(0.22); WORLD.doFlash('#ffffff', 0.7); WORLD.splatLens(9, 1.3);
    WORLD.splatBig(vic.x, vic.y, 18); WORLD.scorch(vic.x, vic.y, 8); WORLD.pool(vic.x, vic.y + 1, 14, 6);
    WORLD.light(vic.x, vic.y - 20, 130, '#ffffff', 0.5); WORLD.ring(vic.x, vic.y, 50, col);
    yield 1.4;
    return 'OBLITERATED!';
  }
  function* queenFire(att, vic) {
    att.tween({ t: 0.1, h: 0, ua: 1.6, fa: 0.1, gw: PI / 2 + 0.2, ub: 1.5, fb: 0.1, la: 0.35, ra: -0.3 }, 0.4); SFX.magic();
    vic.tween(G.guard, 0.3);
    for (let i = 0; i < 10; i++) { const h = att.joint('handB'); WORLD.flame(h.x, h.y, 2, 2); WORLD.light(h.x, h.y, 26, '#ff8030', 0.08); yield 0.05; }
    SFX.fire(); SFX.boom(0.5); SFX.scream(vic.T.pitch * 1.1, 2.4);
    WORLD.scorch(vic.x, vic.y, 15);
    vic.alive = false;
    const top = vic.hipH + vic.T.torso + 8;
    for (let i = 0; i < 75; i++) {
      WORLD.flame(vic.x, vic.y - rand(0, top), 3, vic.T.tw * 0.6);
      if (i % 3 === 0) WORLD.ember(vic.x + rand(-8, 8), vic.y - rand(0, top));
      if (i % 4 === 0) WORLD.light(vic.x, vic.y - 18, 70, '#ff7020', 0.12);
      if (i < 12) { const h = att.joint('handB'), c = vic.joint('chest'); for (let k = 0; k < 3; k++) { const s = Math.random(); WORLD.flame(h.x + (c.x - h.x) * s, h.y + (c.y - h.y) * s, 1, 2); } }
      vic.spasm = 0.05; vic.spasmAmt = 1.3;
      if (i % 5 === 0) vic.tween({ ua: rand(1.5, 3), ub: rand(1.5, 3), fa: rand(0, 1.5), fb: rand(0, 1.5), t: rand(-0.3, 0.3) }, 0.12);
      if (i === 18) { vic.mode = 'char'; SFX.fire(); }
      if (i === 45) {
        vic.mode = 'skel'; SFX.gush(2); SFX.squish();
        const c = jz(vic, 'chest');
        WORLD.burst(c.x, c.y, c.z, 120, 90); WORLD.pool(vic.x, vic.y + 1, 13, 7);
        WORLD.chunks(c.x, c.y, c.z, 8, 60, CHUNKS.meat);
      }
      WORLD.shake(0.06);
      yield 0.03;
    }
    SFX.crunch();
    for (const d of vic.detachAll()) WORLD.gibFromPart(d, vic.y, { vx: rand(-35, 35), vy: rand(-6, 6), vz: rand(0, 40), vang: rand(-6, 6), bake: rand(4, 6) });
    WORLD.dust(vic.x, vic.y - 4, 16, '#2a2224');
    for (let i = 0; i < 20; i++) WORLD.ember(vic.x + rand(-10, 10), vic.y - rand(0, 10));
    yield 1.5;
    return 'INCINERATED!';
  }

  // ---------------- KING: dismember, then behead ----------------
  function* king(att, vic) {
    yield* clash(att, vic, true);
    att.tween({ t: -0.35, bx: -2, ua: -1.5, fa: 0.9, gw: PI + 1.2, ub: -1.1, fb: 1.0, la: 0.05, ra: -0.5 }, 0.28);
    SFX.grunt(0.7); vic.tween(G.guard, 0.2);
    yield 0.32;
    att.tween({ t: 0.4, bx: 6, ua: 1.2, fa: 0.3, gw: 1.3, ub: 1.0, fb: 0.5, la: 0.7, lk: -0.3, ra: -0.5 }, 0.07, 'in');
    yield 0.07;
    const el = jz(vic, 'elbow');
    WORLD.gibFromPart(vic.detach('fore'), vic.y, { vx: att.facing * rand(40, 80), vz: rand(70, 120), vang: rand(-14, 14), bleed: 1.6, bloody: true, pool: 4 });
    const w = vic.detach('weapon');
    if (w) WORLD.gibFromPart(w, vic.y, { vx: att.facing * rand(20, 60), vz: rand(50, 90), vang: rand(-10, 10), bakeAs: null });
    SFX.slash(); SFX.splat(1); SFX.scream(vic.T.pitch, 1.5);
    WORLD.shake(0.6); WORLD.stop(0.1); WORLD.splatLens(2);
    WORLD.spray(el.x, el.y, el.z, away(att, 0.3), 0.8, 130, 50);
    WORLD.emit(() => {
      vic.solve();
      const e = vic.toWorld(vic.J.elbow.x, vic.J.elbow.y, true), s = vic.toWorld(vic.J.sh.x, vic.J.sh.y, true);
      return { x: e.x, y: vic.y, z: Math.max(1, vic.y - e.y), ang: Math.atan2(-(e.y - s.y), e.x - s.x) };
    }, { rate: 110, dur: 4, speed: 95, spread: 0.3, pulse: 2.2 });
    vic.tween({ t: -0.3, h: 0.3, ua: 0.8, ub: 1.3, fb: 1.8, bx: -3, by: 1 }, 0.2); vic.spasm = 0.6; vic.spasmAmt = 0.5;
    yield 0.8;
    att.tween({ t: -0.45, bx: -3, ua: -1.9, fa: 0.5, gw: PI + 1.6, ub: -1.5, fb: 0.6, la: 0.05, ra: -0.55 }, 0.33);
    SFX.grunt(0.6);
    yield 0.42;
    WORLD.slowmo(0.2, 0.7);
    att.tween({ t: 0.3, bx: 7, ua: 1.75, fa: 0.05, gw: PI / 2 - 0.05, ub: 1.5, fb: 0.2, la: 0.75, lk: -0.3, ra: -0.55 }, 0.07, 'in');
    SFX.whoosh(1.2);
    yield 0.07;
    const hg = WORLD.gibFromPart(vic.detach('head'), vic.y, { vx: att.facing * rand(35, 60), vy: rand(-8, 8), vz: rand(160, 200), vang: att.facing * rand(10, 16), bleed: 2.6, bloody: true, roll: 4, pool: 5, bake: 7 });
    if (hg) hg.onBounce = g => { if (g.bounces < 4) { SFX.step(true); WORLD.splatBig(g.x, g.y, 3); } };
    vic.alive = false;
    SFX.slash(); SFX.splat(1.5); SFX.crunch();
    WORLD.shake(1.0); WORLD.stop(0.18); WORLD.doFlash('#ff2020', 0.4); WORLD.splatLens(5);
    neckFountain(vic, { rate: 270, dur: 4.6, speed: 165 });
    const n = jz(vic, 'neck');
    WORLD.chunks(n.x, n.y, n.z, 4, 60, CHUNKS.meat);
    vic.spasm = 1.2; vic.spasmAmt = 0.7;
    yield 1.3;
    att.tween({ t: 0.1, ua: 2.4, fa: 0.3, gw: 0.2 }, 0.3);
    vic.tween(kneel(vic), 0.4);
    yield 0.8;
    yield* fallDead(vic, att, 1);
    return 'DECAPITATED!';
  }

  const KILLS = { p: pawn, n: knight, b: bishop, r: rook, q: (a, v) => (Math.random() < 0.5 ? queenBolt : queenFire)(a, v), k: king };
  const GAP = { p: 31, n: 30, b: 27, r: 25, q: 52, k: 30 };

  // Full capture sequence: approach, butcher, gloat, then clean up.
  function* fight(att, vic, o = {}) {
    let side = Math.sign(att.x - vic.x);
    if (!side) side = att.faction === 'w' ? -1 : 1;
    let gap = GAP[att.type] + (vic.T.golem ? 5 : 0);
    let ex = vic.x + side * gap;
    if (ex < 20 || ex > W - 20) { side = -side; ex = vic.x + side * gap; }
    const ey = vic.y;
    WORLD.letterboxT = 1;
    WORLD.spot = [att, vic];
    WORLD.banner = { top: rigName(att) + '  VS  ' + rigName(vic), bottom: null, t: 0 };
    WORLD.focus((att.x + ex) / 2, (att.y + ey) / 2 - 20, 1.5, 2.5);
    vic.facing = side;
    const dist = Math.hypot(ex - att.x, ey - att.y);
    yield att.walkTo(ex, ey, Math.max(70, dist / 1.4), att.type === 'n' ? 20 : 0);
    att.facing = -side; vic.facing = side;
    WORLD.focus((ex + vic.x) / 2, vic.y - 22, att.type === 'q' ? 2.1 : 2.6, 5);
    vic.rest(0.2, G.ready); att.rest(0.2, G.ready);
    vic.layer = 0.1;
    yield 0.4;
    const txt = yield* KILLS[att.type](att, vic);
    att.kills++; att.blood = Math.min(3, att.blood + 1);
    WORLD.banner = { top: WORLD.banner.top, bottom: o.finale ? 'REGICIDE!' : txt, t: 0 };
    yield 0.5;
    att.rest(0.35, G.victory);
    if (att.T.golem) SFX.roar(); else SFX.grunt(att.T.pitch * 0.8);
    yield 0.9;
    att.rest(0.3);
    yield 0.3;
    return txt;
  }

  return { fight, G };
})();
