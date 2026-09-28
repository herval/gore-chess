// Scripted announcement trailer, rendered live by the game engine.
// Open trailer.html and click, or call TR.run({ record: true }) to capture a webm.
// Captions stay inside the 16:9 safe area (world y 15..285) so the 1920x1200
// capture can be cropped to 1920x1080.
const TR = (() => {
  const sleep = s => new Promise(r => setTimeout(r, s * 1000));
  const until = fn => new Promise(r => { const i = setInterval(() => { if (fn()) { clearInterval(i); r(); } }, 16); });
  const sq = n => (8 - +n[1]) * 8 + 'abcdefgh'.indexOf(n[0]);
  let cards = [], drums = null, running = false;

  game.state = 'trailer';

  function card(c) {
    const cc = Object.assign({ t0: performance.now() / 1000, dur: 2, bg: 1, fadeIn: 0.25, fadeOut: 0.25, lines: [] }, c);
    cards.push(cc);
    return cc;
  }
  function drawCards(x, t) {
    cards = cards.filter(c => t - c.t0 <= c.dur);
    for (const c of cards) {
      const e = t - c.t0;
      const a = Math.min(1, c.fadeIn ? e / c.fadeIn : 1, c.fadeOut ? (c.dur - e) / c.fadeOut : 1);
      if (c.bg) { x.globalAlpha = a * c.bg; x.fillStyle = '#000'; x.fillRect(0, 0, W, H); }
      for (const L of c.lines) {
        const le = e - (L.at || 0);
        if (le < 0) continue;
        x.globalAlpha = a * Math.min(1, le / 0.12);
        if (L.band) { x.fillStyle = 'rgba(0,0,0,0.7)'; x.fillRect(0, L.y - 5, W, 17); }
        if (L.blood) FONT.bloodTitle(x, L.text, W / 2, L.y, L.scale || 3, t, L.text.length + 3);
        else FONT.draw(x, L.text, W / 2, L.y, { color: L.color || '#d8c8b0', align: 'center', scale: L.scale || 1 });
      }
      x.globalAlpha = 1;
    }
  }

  // cinematic UI: no HUD, just bars, kill-cam text, lens blood and cards
  renderUI = function () {
    const x = uctx, t = performance.now() / 1000;
    x.clearRect(0, 0, W, H);
    x.imageSmoothingEnabled = false;
    const lb = WORLD.letterbox;
    if (lb > 0.01) {
      const h = Math.round(30 * lb);
      x.fillStyle = '#000'; x.fillRect(0, 0, W, h); x.fillRect(0, H - h, W, h);
      x.fillStyle = '#3a0408'; x.fillRect(0, h, W, 1); x.fillRect(0, H - h - 1, W, 1);
    }
    const b = WORLD.banner;
    if (b) {
      if (b.top && lb > 0.5) FONT.draw(x, b.top, W / 2, 19, { color: '#d8c8b0', align: 'center' });
      if (b.bottom) FONT.bloodTitle(x, b.bottom, W / 2, H - 46, Math.min(1, b.t * 5) < 1 ? 3 : 2, t, b.bottom.length);
    }
    if (!running) card({ dur: 0.05, fadeIn: 0, fadeOut: 0, bg: 0.7, lines: [{ text: 'CLICK TO PLAY THE TRAILER', y: 146, color: '#d02030' }] });
    drawCards(x, t);
    WORLD.drawLens(x);
  };

  function startDrums() {
    let i = 0;
    const pat = [1, 0, 0, 0.6, 0.8, 0, 0.5, 0];
    drums = setInterval(() => { const a = pat[i++ % 8]; if (a) SFX.drum(a); }, 275);
  }
  function stopDrums() { clearInterval(drums); drums = null; }

  function place(list) {
    for (const [type, f, n] of list) spawnRig(type, f, sq(n));
  }
  function cutTo(x, y, z) { Object.assign(WORLD.cam, { x, y, z, tx: x, ty: y, tz: z }); }

  // Every bout but the finale is a tease: smash to black on the frame the killing blow
  // lands, let the audio play over the dark, then fast-forward the aftermath behind it.
  let pending = null, blackout = null, teasing = false;
  BATTLE.onKill = () => {
    if (!teasing) return;
    blackout = card({ dur: 99, fadeIn: 0, fadeOut: 0.1 });
    WORLD.splatLens(3, 1.3);
  };
  async function fight(att, vic, opts = {}) {
    const [a, v] = [game.rigs[sq(att)], game.rigs[sq(vic)]];
    cutTo((a.x + v.x) / 2, (a.y + v.y) / 2 - 20, 1.7);
    game.busy = true;
    teasing = !opts.full;
    const h = WORLD.run((function* () {
      yield* BATTLE.fight(a, v, opts);
      WORLD.spot = null;
      WORLD.bakeRig(v);
      WORLD.letterboxT = 0; WORLD.banner = null;
      game.rigs[sq(vic)] = a; game.rigs[sq(att)] = null;
      const d = sqCenter(sq(vic));
      yield a.walkTo(d.x, d.y, 80);
      a.facing = a.faction === 'w' ? 1 : -1; a.rest(0.2);
      game.busy = false;
    })());
    pending = h;
    // lift the previous blackout now that the new shot is framed
    if (blackout) { blackout.dur = performance.now() / 1000 - blackout.t0 + 0.1; blackout = null; SFX.drum(1); }
    if (opts.full) return until(() => h.done());
    await until(() => h.done() || blackout);
    await sleep(0.85);
    SFX.quietFx(true); game.warp = 8;
    await until(() => h.done());
    game.warp = 1; SFX.quietFx(false);
    WORLD.settle();
    WORLD.lens = [];
    teasing = false;
  }

  async function record() {
    const stream = new MediaStream([...view.captureStream(60).getVideoTracks(), ...SFX.stream().getAudioTracks()]);
    const type = ['video/webm;codecs=vp8,opus', 'video/webm'].find(t => MediaRecorder.isTypeSupported(t));
    const rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 40e6, audioBitsPerSecond: 256e3 });
    const chunks = [];
    rec.ondataavailable = e => chunks.push(e.data);
    rec.start(1000);
    return () => new Promise(res => {
      rec.onstop = () => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob(chunks, { type }));
        a.download = 'gore-chess-trailer-raw.webm';
        document.body.appendChild(a); a.click();
        res();
      };
      rec.stop();
    });
  }

  async function run(o = {}) {
    if (running) return;
    running = true;
    cards = [];
    SFX.init();
    game.aiToken++;
    // hold on black while the recorder spins up
    card({ dur: 1.2, fadeIn: 0, fadeOut: 0 });
    await sleep(0.2);
    const stop = o.record ? await record() : null;
    await sleep(0.8);

    // 1. cold open
    SFX.bell();
    card({ dur: 4, fadeIn: 0, fadeOut: 0.4, lines: [
      { text: 'BENEATH THE CASTLE', y: 118, at: 0.3, color: '#9a8a90', scale: 2 },
      { text: 'TWO ARMIES AWAIT THE FIRST MOVE', y: 144, at: 1.3, scale: 2 },
    ] });
    await sleep(3.4);

    // 2. the board rises
    newGame(['human', 'human'], false);
    game.state = 'trailer';
    cutTo(W / 2, H / 2, 1.0);
    WORLD.focus(W / 2, H / 2 + 12, 1.14, 0.35);
    await until(() => !game.intro);
    await sleep(0.2);

    // 3. the promise
    const promise = card({ dur: 3.4, fadeIn: 0.15, lines: [
      { text: 'EVERY CAPTURE', blood: true, scale: 3, y: 92, at: 0 },
      { text: 'IS A FIGHT', blood: true, scale: 3, y: 122, at: 0.8 },
      { text: 'TO THE DEATH', blood: true, scale: 4, y: 156, at: 1.6 },
    ] });
    SFX.drum(1); setTimeout(() => SFX.drum(1), 800); setTimeout(() => { SFX.drum(1); SFX.boom(0.6); }, 1600);
    await sleep(0.5);
    // behind the card, reset to a mid-game board
    WORLD.rigs = []; game.rigs = new Array(64).fill(null);
    place([
      ['k', 'w', 'g1'], ['b', 'w', 'f1'], ['r', 'w', 'e1'], ['p', 'w', 'a2'], ['p', 'w', 'b2'], ['p', 'w', 'g2'], ['p', 'w', 'h2'],
      ['k', 'b', 'e8'], ['n', 'b', 'b8'], ['r', 'b', 'h8'], ['p', 'b', 'a7'], ['p', 'b', 'b7'], ['p', 'b', 'g7'], ['p', 'b', 'h7'],
    ]);
    cutTo(W / 2, H / 2, 1);
    await until(() => performance.now() / 1000 - promise.t0 > promise.dur);

    // 4. the montage: six ways to die, one board that never gets cleaned
    startDrums();
    // (the e-file stays clear for the final rook)
    const bouts = [
      [['n', 'w', 'c3'], ['b', 'b', 'd5'], {}],
      [['b', 'b', 'f5'], ['p', 'w', 'g4'], {}],
      [['q', 'b', 'a5'], ['n', 'w', 'c3'], { kill: 'queenBolt' }],
      [['p', 'w', 'b2'], ['q', 'b', 'c3'], {}],
      [['q', 'w', 'a3'], ['r', 'b', 'd6'], { kill: 'queenFire' }],
      [['k', 'w', 'g1'], ['n', 'b', 'f2'], {}],
    ];
    for (const [att, vic, opts] of bouts) {
      for (const [ty, f, n] of [att, vic]) if (!game.rigs[sq(n)]) spawnRig(ty, f, sq(n));
      await fight(att[2], vic[2], opts);
    }
    stopDrums();

    // 5. checkmate: the one kill we show in full
    const king = game.rigs[sq('e8')];
    cutTo(king.x, king.y - 20, 2.2);
    WORLD.focus(king.x, king.y - 20, 2.4, 1);
    WORLD.letterboxT = 1;
    SFX.stinger();
    king.tween(BATTLE.G.cower, 0.4); king.spasm = 2; king.spasmAmt = 0.3;
    if (blackout) { blackout.dur = performance.now() / 1000 - blackout.t0 + 0.1; blackout = null; }
    card({ dur: 2, bg: 0.45, fadeIn: 0.1, lines: [{ text: 'CHECKMATE', blood: true, scale: 5, y: 120 }] });
    await sleep(2);
    await fight('e1', 'e8', { finale: true, full: true });

    // 6. the reveal
    WORLD.focus(W / 2, H / 2 + 4, 1.0, 0.7);
    await sleep(1.2);
    card({ dur: 4, bg: 0, fadeIn: 0.6, fadeOut: 0.5, lines: [{ text: 'EVERY DROP STAYS ON THE BOARD. FOREVER.', y: 262, color: '#e8d8c0', band: true }] });
    await sleep(4.2);

    // 7. end card
    SFX.boom(0.8); SFX.bell();
    card({ dur: 99, bg: 0.82, fadeIn: 0.6, fadeOut: 0, lines: [
      { text: 'GORE', blood: true, scale: 6, y: 34, at: 0 },
      { text: 'CHESS', blood: true, scale: 4, y: 84, at: 0.3 },
      { text: 'A GAME OF KINGS, QUEENS AND UNSPEAKABLE CARNAGE', y: 136, at: 1.0, color: '#9a8a90' },
      { text: '6 PIECES.  7 WAYS TO DIE.  1 VERY DIRTY BOARD.', y: 166, at: 1.8, color: '#e8d8c0' },
      { text: 'VS AI  -  HOTSEAT  -  AI VS AI CARNAGE MODE', y: 182, at: 2.4, color: '#d02030' },
    ] });
    await sleep(6);
    if (stop) await stop();
    window.__trailerDone = true;
  }

  view.addEventListener('mousedown', () => run());
  return { run };
})();
