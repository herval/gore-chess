// Game state, input, turn flow, HUD and compositing.
const E = ENGINE();
const view = document.getElementById('screen');
const vctx = view.getContext('2d');
const worldC = makeCanvas(W, H), wctx = worldC.getContext('2d');
const uiC = makeCanvas(W, H), uctx = uiC.getContext('2d');
let BG, VIGNETTE;
const worker = makeAIWorker();
const DIFFS = [
  { name: 'SQUIRE', opts: { time: 250, depth: 2, noise: 60, bloodlust: 40 } },
  { name: 'KNIGHT', opts: { time: 700, depth: 4, noise: 15, bloodlust: 20 } },
  { name: 'WARLORD', opts: { time: 1600, depth: 7, noise: 0, bloodlust: 0 } },
];
// AI-vs-AI plays for the spectacle: it would rather trade than shuffle
const CARNAGE = { time: 400, depth: 3, noise: 40, bloodlust: 140, repPenalty: 60 };
const MENU = [
  { label: 'BUTCHER THE AI  (WHITE)', players: ['human', 'ai'] },
  { label: 'PLAY THE LEGION  (BLACK)', players: ['ai', 'human'] },
  { label: 'TWO BUTCHERS  (HOTSEAT)', players: ['human', 'human'] },
  { label: 'WATCH THE CARNAGE  (AI VS AI)', players: ['ai', 'ai'] },
  { label: 'DIFFICULTY', diff: true },
];

const game = {
  state: 'title', menuSel: 0, menuHover: -1, diff: 1, players: ['ai', 'ai'], attract: true,
  pos: null, rigs: [], sel: -1, targets: [], legal: [], busy: false, log: [], trophies: { w: [], b: [] },
  over: null, overT: 0, hover: -1, promo: null, aiPending: false, aiToken: 0, aiWait: 0, lastMove: null,
  status: '', checkT: 0, fade: 0,
};
const keys = {};
let mouse = { x: -1, y: -1 };

// ---------------- setup ----------------
function newGame(players, attract) {
  WORLD.reset();
  game.aiToken++;
  Object.assign(game, { players, attract, pos: E.Position.start(), rigs: new Array(64).fill(null), sel: -1, targets: [], busy: false, log: [], trophies: { w: [], b: [] }, over: null, overT: 0, promo: null, intro: false, aiPending: false, aiWait: attract ? 0.6 : 1.2, lastMove: null, checkT: 0 });
  for (let sq = 0; sq < 64; sq++) {
    const p = game.pos.b[sq];
    if (p) spawnRig(TYPE_CH[p & 7], (p >> 3) ? 'b' : 'w', sq);
  }
  game.legal = game.pos.legal();
  if (!attract) {
    SFX.bell();
    WORLD.letterboxT = 0;
    // pieces rise from the floor
    for (const r of WORLD.rigs) { r.pose.jz = -40; r.alpha = 0; }
    game.intro = true;
    WORLD.run((function* () {
      const order = WORLD.rigs.slice().sort((a, b) => Math.abs(a.y - 160) - Math.abs(b.y - 160));
      for (let i = 0; i < order.length; i++) {
        const r = order[i];
        r.alpha = 1; r.pose.jz = 30;
        r.tween({ jz: 0 }, 0.25, 'in');
        WORLD.run((function* () { yield 0.25; SFX.step(r.T.golem); WORLD.dust(r.x, r.y, 4); if (r.T.golem) WORLD.shake(0.15); })());
        yield 0.035;
      }
      yield 0.4;
      WORLD.banner = { top: null, bottom: 'LET THE CARNAGE BEGIN', t: 0 };
      WORLD.letterboxT = 0;
      SFX.stinger();
      yield 1.6;
      WORLD.banner = null;
      game.intro = false;
    })());
  }
}
function spawnRig(type, faction, sq) {
  const r = new Rig(type, faction);
  const c = sqCenter(sq);
  r.x = c.x; r.y = c.y;
  r.onStep = rr => {
    if (!game.attract || Math.random() < 0.5) SFX.step(rr.T.golem);
    if (rr.T.golem) WORLD.shake(0.08);
    // killers track gore wherever they walk
    if (rr.blood > 0) { const fx = rr.x + rand(-3, 3); WORLD.stainPx(fx, rr.y + rand(-1, 1), 2, 1); if (rr.blood > 1) WORLD.stainPx(fx + 1, rr.y - 1, 1, 1); }
  };
  r.onLand = rr => { SFX.step(true); WORLD.dust(rr.x, rr.y, 6); };
  game.rigs[sq] = r;
  WORLD.rigs.push(r);
  return r;
}
const isAI = side => game.players[side] === 'ai';
const defaultFacing = r => r.faction === 'w' ? 1 : -1;

// ---------------- moves ----------------
function doMove(m) {
  game.busy = true;
  deselect();
  const san = game.pos.san(m);
  WORLD.run(moveScript(m, san));
}

function* moveScript(m, san) {
  const pos = game.pos, side = pos.side, r = game.rigs[m.f];
  const dest = sqCenter(m.t);
  const speedTo = (rig, x, y) => Math.max(60, Math.hypot(x - rig.x, y - rig.y) / 1.3);
  if (m.c) {
    const capSq = (m.fl & 1) ? m.t + (side === 0 ? 8 : -8) : m.t;
    const vic = game.rigs[capSq];
    yield* BATTLE.fight(r, vic);
    WORLD.spot = null;
    WORLD.bakeRig(vic);
    game.rigs[capSq] = null;
    game.trophies[r.faction].push(vic);
    WORLD.letterboxT = 0; WORLD.unfocus();
    WORLD.banner = null;
    yield r.walkTo(dest.x, dest.y, speedTo(r, dest.x, dest.y));
  } else if (m.fl & 2) {
    const rookMap = { 62: [63, 61], 58: [56, 59], 6: [7, 5], 2: [0, 3] }[m.t];
    const rk = game.rigs[rookMap[0]], rd = sqCenter(rookMap[1]);
    yield [r.walkTo(dest.x, dest.y, 60), rk.walkTo(rd.x, rd.y, 60)];
    rk.facing = defaultFacing(rk);
    game.rigs[rookMap[1]] = rk; game.rigs[rookMap[0]] = null;
  } else {
    yield r.walkTo(dest.x, dest.y, speedTo(r, dest.x, dest.y), r.type === 'n' ? 24 : 0);
  }
  r.facing = defaultFacing(r);
  r.rest(0.2);
  game.rigs[m.f] = null;
  game.rigs[m.t] = r;
  pos.make(m);
  game.log.push(san);
  game.lastMove = [m.f, m.t];
  if (m.pr) yield* promote(r, m.pr, m.t);

  const st = pos.status();
  if (pos.inCheck() && st !== 'checkmate') {
    SFX.check();
    WORLD.banner = { top: null, bottom: 'CHECK!', t: 0 };
    WORLD.run((function* () { yield 1.4; if (WORLD.banner && WORLD.banner.bottom === 'CHECK!') WORLD.banner = null; })());
  }
  if (st === 'checkmate') yield* finale(side);
  else if (st) {
    game.over = { winner: null, reason: { stalemate: 'STALEMATE', fifty: 'FIFTY MOVES OF PEACE', insufficient: 'TOO FEW LEFT TO KILL' }[st] };
    SFX.stinger();
  }
  game.legal = pos.legal();
  game.busy = false;
  game.aiWait = game.attract ? 0.4 : 0.5;
}

function* promote(r, pr, sq) {
  WORLD.focus(r.x, r.y - 20, 2.4, 4);
  WORLD.letterboxT = 1;
  WORLD.banner = { top: 'ASCENSION', bottom: null, t: 0 };
  SFX.magic();
  r.glow = 1.6; r.spasm = 1.3; r.spasmAmt = 0.5;
  r.tween({ jz: 10, ua: 2.8, ub: 2.8 }, 1);
  for (let i = 0; i < 30; i++) {
    WORLD.flame(r.x, r.y - rand(0, 40), 1, 5); WORLD.spark(r.x + rand(-6, 6), r.y - rand(0, 40), 1, r.faction === 'w' ? '#fff6a0' : '#ff4030');
    WORLD.light(r.x, r.y - 20, 60, r.faction === 'w' ? '#ffe080' : '#ff3020', 0.1);
    yield 0.035;
  }
  // the pawn's mortal shell bursts open
  const c = { x: r.x, y: r.y, z: 20 };
  for (const d of r.detachAll()) WORLD.gibFromPart(d, r.y, { vx: rand(-100, 100), vy: rand(-15, 15), vz: rand(80, 180), vang: rand(-20, 20), bleed: 1, bloody: true });
  WORLD.burst(c.x, c.y, c.z, 250, 190); WORLD.chunks(c.x, c.y, c.z, 12, 150, CHUNKS.meat);
  WORLD.splatBig(c.x, c.y, 14); SFX.boom(); SFX.splat(1.6); WORLD.shake(0.9); WORLD.doFlash('#fff', 0.6); WORLD.splatLens(4);
  const i = WORLD.rigs.indexOf(r); if (i >= 0) WORLD.rigs.splice(i, 1);
  const nr = spawnRig(TYPE_CH[pr], r.faction, sq);
  nr.kills = r.kills; nr.blood = r.blood; nr.glow = 1.2; nr.pose.jz = 16; nr.tween({ jz: 0 }, 0.6, 'io');
  WORLD.banner = { top: 'ASCENSION', bottom: 'A ' + nr.T.name + ' IS BORN IN BLOOD', t: 0 };
  yield 1.3;
  WORLD.letterboxT = 0; WORLD.unfocus(); WORLD.banner = null;
}

function* finale(winnerSide) {
  const pos = game.pos, ksq = pos.kings[pos.side];
  const king = game.rigs[ksq];
  // find a piece giving check
  pos.side ^= 1;
  const checker = pos.pseudo(true).find(m => m.t === ksq);
  pos.side ^= 1;
  SFX.stinger();
  WORLD.letterboxT = 1;
  WORLD.banner = { top: 'CHECKMATE', bottom: null, t: 0 };
  WORLD.focus(king.x, king.y - 20, 2.2, 3);
  king.tween(BATTLE.G.cower, 0.4); king.spasm = 1.5; king.spasmAmt = 0.3;
  yield 1.4;
  if (checker) {
    const att = game.rigs[checker.f];
    yield* BATTLE.fight(att, king, { finale: true });
    WORLD.spot = null;
    WORLD.bakeRig(king);
    game.rigs[ksq] = null;
    game.trophies[att.faction].push(king);
  }
  game.over = { winner: winnerSide, reason: 'CHECKMATE' };
  WORLD.letterboxT = 0; WORLD.unfocus(); WORLD.banner = null;
  SFX.bell();
}

// ---------------- AI ----------------
function requestAI() {
  game.aiPending = true;
  const token = ++game.aiToken;
  const moves = game.pos.hist.map(h => [h.m.f, h.m.t, h.m.pr || 0]);
  const opts = game.players[0] === 'ai' && game.players[1] === 'ai' ? CARNAGE : DIFFS[game.diff].opts;
  const t0 = performance.now();
  const handle = mv => {
    if (token !== game.aiToken) return;
    const delay = Math.max(0, 350 - (performance.now() - t0));
    setTimeout(() => {
      if (token !== game.aiToken) return;
      game.aiPending = false;
      const m = mv && game.pos.legal().find(x => x.f === mv[0] && x.t === mv[1] && (x.pr || 0) === (mv[2] || 0));
      if (m) doMove(m);
    }, delay);
  };
  if (worker) { worker.onmessage = e => handle(e.data); worker.postMessage({ moves, opts }); }
  else setTimeout(() => { const b = E.search(game.pos, opts); handle(b && [b.f, b.t, b.pr]); }, 30);
}

// ---------------- input ----------------
function toUI(ev) {
  const rect = view.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const px = (ev.clientX - rect.left) * dpr, py = (ev.clientY - rect.top) * dpr;
  const L = layout();
  return { x: (px - L.ox) / L.scale, y: (py - L.oy) / L.scale };
}
function toWorldPt(u) {
  const c = WORLD.cam;
  return { x: camX() + (u.x - W / 2) / c.z, y: camY() + (u.y - H / 2) / c.z };
}
function squareAt(x, y) {
  const f = Math.floor((x - BX) / SQ_W), r = Math.floor((y - BY) / SQ_H);
  return f >= 0 && f < 8 && r >= 0 && r < 8 ? r * 8 + f : -1;
}
// pieces are tall: allow clicking their bodies, not just their squares
function pieceAt(x, y, color) {
  let best = -1, bestY = -1;
  for (let sq = 0; sq < 64; sq++) {
    const r = game.rigs[sq]; if (!r) continue;
    if (color !== undefined && (r.faction === 'w' ? 0 : 1) !== color) continue;
    const h = r.hipH + r.T.torso + 10, w = r.T.tw / 2 + 4;
    if (x >= r.x - w && x <= r.x + w && y >= r.y - h && y <= r.y + 4 && r.y > bestY) { best = sq; bestY = r.y; }
  }
  return best;
}
function select(sq) {
  deselect();
  game.sel = sq;
  game.targets = game.legal.filter(m => m.f === sq);
  const r = game.rigs[sq];
  r.selected = true; r.rest(0.2, BATTLE.G.ready);
  SFX.select();
}
function deselect() {
  if (game.sel >= 0 && game.rigs[game.sel]) { game.rigs[game.sel].selected = false; game.rigs[game.sel].rest(0.25); }
  game.sel = -1; game.targets = [];
}
function humanTurn() { return game.state === 'play' && !game.busy && !game.intro && !game.over && !isAI(game.pos.side); }

view.addEventListener('mousemove', ev => {
  const u = toUI(ev); mouse = u;
  if (game.state === 'title') { game.menuHover = menuAt(u); return; }
  const w = toWorldPt(u);
  game.hover = squareAt(w.x, w.y);
});
view.addEventListener('mousedown', ev => {
  SFX.init();
  const u = toUI(ev);
  if (game.state === 'title') { const i = menuAt(u); if (i >= 0) chooseMenu(i); return; }
  if (game.over && game.overT > 1.5) { toTitle(); return; }
  if (game.promo) {
    const i = promoAt(u);
    if (i >= 0) { const m = game.promo.moves.find(x => x.pr === [E.Q, E.R, E.B, E.N][i]); game.promo = null; doMove(m); }
    else game.promo = null;
    return;
  }
  if (!humanTurn()) return;
  const w = toWorldPt(u);
  const sq = squareAt(w.x, w.y);
  if (game.sel >= 0) {
    const ms = game.targets.filter(m => m.t === sq);
    if (ms.length) {
      if (ms.length > 1) { game.promo = { moves: ms, sq }; return; }
      doMove(ms[0]); return;
    }
  }
  const side = game.pos.side;
  let own = pieceAt(w.x, w.y, side);
  if (sq >= 0 && game.rigs[sq] && (game.rigs[sq].faction === 'w' ? 0 : 1) === side) own = sq;
  if (own >= 0 && own !== game.sel) { if (game.legal.some(m => m.f === own)) select(own); else { SFX.deny(); select(own); } }
  else deselect();
});
window.addEventListener('keydown', ev => {
  SFX.init();
  keys[ev.code] = true;
  if (game.state === 'title') {
    if (ev.code === 'ArrowDown') { game.menuSel = (game.menuSel + 1) % MENU.length; SFX.select(); }
    if (ev.code === 'ArrowUp') { game.menuSel = (game.menuSel + MENU.length - 1) % MENU.length; SFX.select(); }
    if (ev.code === 'Enter' || ev.code === 'Space') chooseMenu(game.menuSel);
    if (ev.code === 'ArrowLeft' || ev.code === 'ArrowRight') if (MENU[game.menuSel].diff) chooseMenu(game.menuSel, ev.code === 'ArrowLeft' ? -1 : 1);
  } else {
    if (ev.code === 'Escape') toTitle();
    if (game.over && (ev.code === 'Enter' || ev.code === 'Space') && game.overT > 1.5) toTitle();
  }
  if (ev.code === 'KeyM') SFX.toggleMusic();
  if (ev.code === 'KeyN') SFX.toggleMute();
  if (ev.code === 'Space') ev.preventDefault();
});
window.addEventListener('keyup', ev => { keys[ev.code] = false; });

function menuAt(u) {
  for (let i = 0; i < MENU.length; i++) { const y = 150 + i * 18; if (u.y >= y - 3 && u.y < y + 12 && Math.abs(u.x - W / 2) < 120) return i; }
  return -1;
}
function chooseMenu(i, dir = 1) {
  const it = MENU[i];
  if (it.diff) { game.diff = (game.diff + DIFFS.length + dir) % DIFFS.length; SFX.select(); return; }
  SFX.init(); SFX.splat(1);
  game.state = 'play';
  newGame(it.players, false);
}
function toTitle() {
  game.state = 'title';
  newGame(['ai', 'ai'], true);
}
function promoAt(u) {
  if (!game.promo) return -1;
  for (let i = 0; i < 4; i++) { const x = W / 2 - 80 + i * 40; if (u.x >= x && u.x < x + 38 && u.y >= 120 && u.y < 160) return i; }
  return -1;
}

// ---------------- update ----------------
function update(dt) {
  WORLD.fast = keys.Space && game.state === 'play' ? 3.5 : (game.warp || 1);
  WORLD.update(dt);
  game.fade = Math.max(0, game.fade - dt);
  if (game.over) {
    game.overT += dt;
    if (game.attract && game.overT > 5) newGame(['ai', 'ai'], true);
  } else if (!game.busy && !game.intro && game.pos) {
    if (isAI(game.pos.side) && !game.aiPending) {
      game.aiWait -= dt;
      if (game.aiWait <= 0) requestAI();
    }
  }
  // the king in check glows
  if (game.pos && !game.busy && game.pos.inCheck()) {
    const k = game.rigs[game.pos.kings[game.pos.side]];
    if (k) k.glow = 0.4 + 0.35 * Math.sin(WORLD.time * 8);
  }
  // idle fidgets: glance around, shift the grip
  if (!game.busy && game.pos && Math.random() < dt * 0.8) {
    const r = pick(WORLD.rigs);
    if (r && r.alive && !r.selected && !r.move && !r.tweens.length) {
      r.tween({ h: rand(-0.35, 0.25), t: r.T.rest.t + rand(-0.08, 0.08) }, 0.4, 'io');
      WORLD.run((function* () { yield rand(0.8, 1.8); if (r.alive && !r.selected && !r.move && !game.busy) r.tween({ h: 0, t: r.T.rest.t }, 0.4, 'io'); })());
    }
  }
  // blooded weapons keep dripping
  for (const r of WORLD.rigs) {
    if (r.blood > 0 && r.alive && !r.hidden && Math.random() < dt * r.blood * 0.7) {
      const tp = r.T.weapon ? r.weaponTip() : r.joint('hand');
      WORLD.drop(tp.x + rand(-1, 1), r.y + rand(-2, 2), Math.max(1, r.y - tp.y), rand(-4, 4), 0, 0, 1);
    }
  }
  // ambient torch embers
  if (Math.random() < dt * 6) { const tx = pick(TORCHES); WORLD.ember(tx + rand(-2, 2), 16); }
}

// ---------------- rendering ----------------
function camX() { const c = WORLD.cam, h = W / (2 * c.z); return Math.max(h, Math.min(W - h, c.x)); }
function camY() { const c = WORLD.cam, h = H / (2 * c.z); return Math.max(h, Math.min(H - h, c.y)); }

function drawTorches(ctx, t) {
  for (const tx of TORCHES) {
    const f = Math.sin(t * 17 + tx) * 0.5 + Math.sin(t * 23.3 + tx * 2) * 0.5;
    ctx.fillStyle = '#b82010'; ctx.fillRect(tx - 3, 17, 7, 5);
    ctx.fillStyle = '#ff6a1a'; ctx.fillRect(tx - 2, 13 + Math.round(f), 5, 8);
    ctx.fillStyle = '#ffc040'; ctx.fillRect(tx - 1, 14 + Math.round(f), 3, 6);
    ctx.fillStyle = '#fff6b0'; ctx.fillRect(tx, 16, 1, 3);
    ctx.fillStyle = '#ff6a1a'; ctx.fillRect(tx + Math.round(f * 2), 10 + Math.round(f), 1, 3);
  }
}

function drawBoardMarks(ctx) {
  const t = WORLD.time;
  const box = (sq, col, inset = 0) => {
    const x = BX + (sq & 7) * SQ_W + inset, y = BY + (sq >> 3) * SQ_H + inset, w = SQ_W - inset * 2, h = SQ_H - inset * 2;
    ctx.fillStyle = col; ctx.fillRect(x, y, w, 1); ctx.fillRect(x, y + h - 1, w, 1); ctx.fillRect(x, y, 1, h); ctx.fillRect(x + w - 1, y, 1, h);
  };
  if (game.lastMove && game.state === 'play') { box(game.lastMove[0], 'rgba(255,200,80,0.35)', 1); box(game.lastMove[1], 'rgba(255,200,80,0.55)', 1); }
  if (humanTurn() && game.hover >= 0) box(game.hover, 'rgba(255,255,255,0.35)');
  if (game.sel >= 0) box(game.sel, '#ffd24a');
  const p = 0.5 + 0.5 * Math.sin(t * 6);
  for (const m of game.targets) {
    const c = sqCenter(m.t);
    if (m.c) {
      const x = BX + (m.t & 7) * SQ_W, y = BY + (m.t >> 3) * SQ_H, col = `rgba(255,${40 + p * 40},40,${0.6 + p * 0.4})`;
      ctx.fillStyle = col;
      for (const [cx, cy, dx, dy] of [[x + 1, y + 1, 1, 1], [x + SQ_W - 2, y + 1, -1, 1], [x + 1, y + SQ_H - 2, 1, -1], [x + SQ_W - 2, y + SQ_H - 2, -1, -1]]) {
        ctx.fillRect(Math.min(cx, cx + dx * 5), cy, 6, 1); ctx.fillRect(cx, Math.min(cy, cy + dy * 4), 1, 5);
      }
    } else {
      ctx.fillStyle = `rgba(20,0,0,0.5)`; ctx.fillRect(c.x - 3, c.y - 5, 7, 3);
      ctx.fillStyle = `rgba(200,20,30,${0.55 + p * 0.4})`; ctx.fillRect(c.x - 2, c.y - 5, 5, 2); ctx.fillRect(c.x - 1, c.y - 6, 3, 4);
    }
  }
}

function renderWorld() {
  const x = wctx;
  x.imageSmoothingEnabled = false;
  x.drawImage(BG, 0, 0);
  drawTorches(x, performance.now() / 1000);
  // stains are painted at full strength but shown slightly faded so the board stays readable
  x.globalAlpha = 0.72; x.drawImage(WORLD.stain, 0, 0);
  x.globalAlpha = 0.55; x.drawImage(WORLD.wet, 0, 0);
  x.globalAlpha = 1;
  drawBoardMarks(x);
  WORLD.drawEntities(x);
  WORLD.drawParticles(x);
  WORLD.drawFx(x);
  WORLD.drawFlies(x, performance.now() / 1000);
  x.drawImage(VIGNETTE, 0, 0);
  // torch light
  x.globalCompositeOperation = 'lighter';
  const t = performance.now() / 1000;
  for (const tx of TORCHES) {
    const r = 80 + Math.sin(t * 13 + tx) * 4 + Math.sin(t * 7.1) * 3;
    const g = x.createRadialGradient(tx, 18, 0, tx, 18, r);
    g.addColorStop(0, 'rgba(255,150,60,0.22)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.fillRect(tx - r, 18 - r, r * 2, r * 2);
  }
  x.globalCompositeOperation = 'source-over';
  WORLD.drawLights(x);
}

function panel(ctx, x, y, w, h, col) {
  ctx.fillStyle = 'rgba(8,4,10,0.78)'; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = col; ctx.fillRect(x, y, w, 1); ctx.fillRect(x, y + h - 1, w, 1); ctx.fillRect(x, y, 1, h); ctx.fillRect(x + w - 1, y, 1, h);
  ctx.fillStyle = '#000'; ctx.fillRect(x + 1, y + 1, w - 2, 1);
}

function drawTrophies(ctx, list, x, y) {
  list.forEach((r, i) => {
    const s = variant(r.spr.head, 'blood3');
    const cx = x + (i % 5) * 17 + 8, cy = y + Math.floor(i / 5) * 18 + 14;
    ctx.save(); ctx.translate(cx, cy); if (r.faction === 'b') ctx.scale(-1, 1);
    ctx.drawImage(s.c, -s.ax, -s.ay); ctx.restore();
    ctx.fillStyle = '#8a0a14'; ctx.fillRect(cx - 1, cy, 2, 2 + ((i * 7) % 3));
  });
}

function renderUI() {
  const x = uctx, t = performance.now() / 1000;
  x.clearRect(0, 0, W, H);
  x.imageSmoothingEnabled = false;
  const lb = WORLD.letterbox;

  if (game.state === 'title') { renderTitle(x, t); WORLD.drawLens(x); return; }

  // title on the wall
  const hudA = 1 - lb;
  x.globalAlpha = hudA;
  FONT.bloodTitle(x, 'GORE CHESS', W / 2, 18, 2, t, 3);
  // side panels
  const turn = game.pos ? game.pos.side : 0;
  for (const side of [0, 1]) {
    const px = side === 0 ? 4 : W - 96, f = side === 0 ? 'w' : 'b';
    const col = side === 0 ? '#ffd24a' : '#ff3a2e';
    panel(x, px, 64, 92, 228, turn === side && !game.over ? col : '#3a2a30');
    FONT.draw(x, side === 0 ? 'WHITE ORDER' : 'BLACK LEGION', px + 46, 68, { color: col, align: 'center' });
    FONT.draw(x, game.players[side] === 'ai' ? 'AI: ' + DIFFS[game.diff].name : 'HUMAN', px + 46, 78, { color: '#9a8a90', align: 'center' });
    x.fillStyle = '#3a2a30'; x.fillRect(px + 4, 88, 84, 1);
    FONT.draw(x, 'TROPHIES', px + 5, 91, { color: '#b0a0a8' });
    drawTrophies(x, game.trophies[f], px + 3, 100);
    const kills = game.trophies[f].length;
    x.fillStyle = '#3a2a30'; x.fillRect(px + 4, 178, 84, 1);
    FONT.draw(x, 'SLAIN: ' + kills, px + 5, 182, { color: '#d02030' });
    if (side === 0) {
      FONT.draw(x, 'BLOOD SPILT', px + 5, 196, { color: '#b0a0a8' });
      FONT.draw(x, WORLD.liters.toFixed(1) + ' LITRES', px + 5, 206, { color: '#d02030' });
      FONT.draw(x, 'MOVE ' + (game.pos ? game.pos.full : 1), px + 5, 222, { color: '#b0a0a8' });
      const hint = ['SPACE: HASTEN', 'M: MUSIC', 'N: SOUND', 'ESC: MENU'];
      hint.forEach((h, i) => FONT.draw(x, h, px + 5, 244 + i * 11, { color: '#5a4a52' }));
    } else {
      FONT.draw(x, 'CHRONICLE', px + 5, 196, { color: '#b0a0a8' });
      const lines = [];
      for (let i = 0; i < game.log.length; i += 2) lines.push((i / 2 + 1) + '.' + game.log[i] + (game.log[i + 1] ? ' ' + game.log[i + 1] : ''));
      lines.slice(-8).forEach((l, i) => FONT.draw(x, l, px + 5, 207 + i * 10, { color: '#8a7a80' }));
    }
  }
  // status line
  if (game.pos && !game.over) {
    const side = game.pos.side;
    let s = (side === 0 ? 'WHITE' : 'BLACK') + (isAI(side) ? ' PLOTS MURDER...' : ' TO MOVE');
    if (game.busy) s = '';
    if (s) FONT.draw(x, s, W / 2, 287, { color: side === 0 ? '#ffd24a' : '#ff3a2e', align: 'center' });
  }
  x.globalAlpha = 1;

  // letterbox
  if (lb > 0.01) {
    const h = Math.round(30 * lb);
    x.fillStyle = '#000'; x.fillRect(0, 0, W, h); x.fillRect(0, H - h, W, h);
    x.fillStyle = '#3a0408'; x.fillRect(0, h, W, 1); x.fillRect(0, H - h - 1, W, 1);
  }
  const b = WORLD.banner;
  if (b) {
    if (b.top && lb > 0.5) FONT.draw(x, b.top, W / 2, 11, { color: '#d8c8b0', align: 'center' });
    if (b.bottom) {
      const pop = Math.min(1, b.t * 5);
      const sc = pop < 1 ? 3 : 2;
      FONT.bloodTitle(x, b.bottom, W / 2, lb > 0.5 ? H - 24 : H - 40, sc, t, b.bottom.length);
    }
  }
  // promotion picker
  if (game.promo) {
    panel(x, W / 2 - 84, 104, 168, 64, '#ffd24a');
    FONT.draw(x, 'CHOOSE ASCENSION', W / 2, 108, { color: '#ffd24a', align: 'center' });
    const f = game.pos.side === 0 ? 'w' : 'b';
    ['q', 'r', 'b', 'n'].forEach((ty, i) => {
      const px = W / 2 - 80 + i * 40, hov = promoAt(mouse) === i;
      x.fillStyle = hov ? '#5a1018' : '#20141a'; x.fillRect(px, 120, 38, 40);
      const s = spritesFor(ty, f).head;
      x.drawImage(s.c, px + 19 - s.ax, 138 - s.ay);
      FONT.draw(x, TYPES[ty].name, px + 19, 150, { color: hov ? '#fff' : '#9a8a90', align: 'center' });
    });
  }
  WORLD.drawLens(x);
  if (game.over) renderGameOver(x, t);
}

function renderTitle(x, t) {
  x.fillStyle = 'rgba(6,2,8,0.62)'; x.fillRect(0, 0, W, H);
  FONT.bloodTitle(x, 'GORE', W / 2, 20, 6, t, 1);
  FONT.bloodTitle(x, 'CHESS', W / 2, 70, 4, t, 2);
  FONT.draw(x, 'A GAME OF KINGS, QUEENS AND UNSPEAKABLE CARNAGE', W / 2, 120, { color: '#9a8a90', align: 'center' });
  MENU.forEach((it, i) => {
    const y = 150 + i * 18, on = game.menuSel === i || game.menuHover === i;
    const label = it.diff ? '< DIFFICULTY: ' + DIFFS[game.diff].name + ' >' : it.label;
    if (on) { x.fillStyle = 'rgba(120,10,20,0.6)'; x.fillRect(W / 2 - 118, y - 3, 236, 13); x.fillStyle = '#d02030'; x.fillRect(W / 2 - 118, y - 3, 2, 13); x.fillRect(W / 2 + 116, y - 3, 2, 13); }
    FONT.draw(x, label, W / 2, y, { color: on ? '#fff' : '#b0a0a8', align: 'center' });
  });
  FONT.draw(x, 'CLICK OR ENTER TO BEGIN THE SLAUGHTER', W / 2, 262, { color: Math.sin(t * 4) > 0 ? '#d02030' : '#6a1018', align: 'center' });
  FONT.draw(x, 'M: MUSIC   N: SOUND   SPACE (IN GAME): HASTEN   ESC: MENU', W / 2, 282, { color: '#5a4a52', align: 'center' });
}

function renderGameOver(x, t) {
  const a = Math.min(1, game.overT / 1.2);
  x.fillStyle = `rgba(20,0,4,${0.55 * a})`; x.fillRect(0, 0, W, H);
  if (game.attract) return;
  x.globalAlpha = a;
  FONT.bloodTitle(x, game.over.reason, W / 2, 80, game.over.reason.length > 12 ? 3 : 5, t, 7);
  const who = game.over.winner === null ? 'NO ONE WINS. EVERYONE BLEEDS.' : game.over.winner === 0 ? 'THE WHITE ORDER STANDS ATOP THE PILE' : 'THE BLACK LEGION FEASTS TONIGHT';
  FONT.draw(x, who, W / 2, 140, { color: '#e8d8c0', align: 'center' });
  const slain = game.trophies.w.length + game.trophies.b.length;
  FONT.draw(x, slain + ' SLAIN   ' + WORLD.liters.toFixed(1) + ' LITRES OF BLOOD SPILT', W / 2, 160, { color: '#d02030', align: 'center' });
  if (game.overT > 1.5) FONT.draw(x, 'CLICK TO RETURN TO THE MENU', W / 2, 190, { color: Math.sin(t * 4) > 0 ? '#fff' : '#9a8a90', align: 'center' });
  x.globalAlpha = 1;
}

function layout() {
  const cw = view.width, ch = view.height;
  let scale = Math.min(cw / W, ch / H);
  if (scale >= 1) scale = Math.floor(scale);
  const vw = W * scale, vh = H * scale;
  return { scale, ox: Math.floor((cw - vw) / 2), oy: Math.floor((ch - vh) / 2), vw, vh };
}

function compose() {
  const L = layout(), c = WORLD.cam;
  vctx.imageSmoothingEnabled = false;
  vctx.fillStyle = '#000'; vctx.fillRect(0, 0, view.width, view.height);
  vctx.save();
  vctx.beginPath(); vctx.rect(L.ox, L.oy, L.vw, L.vh); vctx.clip();
  const s = L.scale * c.z;
  const dx = L.ox + L.vw / 2 - camX() * s + c.sx * L.scale, dy = L.oy + L.vh / 2 - camY() * s + c.sy * L.scale;
  vctx.drawImage(worldC, Math.round(dx), Math.round(dy), Math.round(W * s), Math.round(H * s));
  vctx.drawImage(uiC, L.ox, L.oy, L.vw, L.vh);
  if (WORLD.flash.a > 0.01) { vctx.globalAlpha = WORLD.flash.a; vctx.fillStyle = WORLD.flash.col; vctx.fillRect(L.ox, L.oy, L.vw, L.vh); vctx.globalAlpha = 1; }
  vctx.restore();
}

function resize() {
  const dpr = window.devicePixelRatio || 1;
  view.width = Math.floor(window.innerWidth * dpr); view.height = Math.floor(window.innerHeight * dpr);
  view.style.width = window.innerWidth + 'px'; view.style.height = window.innerHeight + 'px';
}

function buildVignette() {
  const c = makeCanvas(W, H), x = c.getContext('2d');
  const g = x.createRadialGradient(W / 2, H / 2 + 20, 90, W / 2, H / 2, 300);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.7)');
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  return c;
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  update(dt);
  renderWorld(); renderUI(); compose();
  requestAnimationFrame(frame);
}

function boot() {
  resize(); window.addEventListener('resize', resize);
  buildChunks();
  BG = buildBackground(); VIGNETTE = buildVignette();
  WORLD.init();
  toTitle();
  requestAnimationFrame(frame);
}
boot();
