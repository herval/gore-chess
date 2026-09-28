// Fully synthesized sound: clangs, squelches, screams, and a doom drone.
const SFX = (() => {
  let ac = null, master, sfxBus, musicBus, noiseBuf, distCurve, muted = false, musicOn = true, musicNodes = null;
  const R = (a, b) => a + Math.random() * (b - a);

  function init() {
    if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ac = new AC();
    master = ac.createGain(); master.gain.value = 0.7;
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 6;
    master.connect(comp); comp.connect(ac.destination);
    sfxBus = ac.createGain(); sfxBus.connect(master);
    musicBus = ac.createGain(); musicBus.gain.value = 0.5; musicBus.connect(master);
    noiseBuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    distCurve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) { const x = i / 512 - 1; distCurve[i] = Math.tanh(x * 4); }
    if (musicOn) startMusic();
  }
  const now = () => ac.currentTime;

  function env(g, t, a, peak, d) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }
  function noise(o) {
    if (!ac || muted) return;
    const t = now() + (o.delay || 0);
    const src = ac.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    src.playbackRate.value = o.rate || 1;
    const f = ac.createBiquadFilter(); f.type = o.type || 'bandpass'; f.Q.value = o.q || 1;
    f.frequency.setValueAtTime(o.freq || 1000, t);
    if (o.freqEnd) f.frequency.exponentialRampToValueAtTime(o.freqEnd, t + (o.a || 0.005) + (o.d || 0.2));
    const g = ac.createGain();
    env(g, t, o.a || 0.005, o.gain || 0.3, o.d || 0.2);
    src.connect(f); f.connect(g); g.connect(o.bus || sfxBus);
    src.start(t, Math.random()); src.stop(t + (o.a || 0.005) + (o.d || 0.2) + 0.05);
  }
  function tone(o) {
    if (!ac || muted) return;
    const t = now() + (o.delay || 0);
    const osc = ac.createOscillator(); osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.freq, t);
    if (o.freqEnd) osc.frequency.exponentialRampToValueAtTime(o.freqEnd, t + (o.a || 0.005) + (o.d || 0.2));
    const g = ac.createGain();
    env(g, t, o.a || 0.005, o.gain || 0.2, o.d || 0.2);
    let node = osc;
    if (o.dist) { const ws = ac.createWaveShaper(); ws.curve = distCurve; node.connect(ws); node = ws; }
    if (o.lp) { const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.lp; node.connect(f); node = f; }
    node.connect(g); g.connect(o.bus || sfxBus);
    osc.start(t); osc.stop(t + (o.a || 0.005) + (o.d || 0.2) + 0.05);
  }

  const S = {
    init,
    get muted() { return muted; },
    toggleMute() { muted = !muted; if (master) master.gain.value = muted ? 0 : 0.7; return muted; },
    step(heavy) { noise({ type: 'lowpass', freq: heavy ? 180 : 420, gain: heavy ? 0.35 : 0.12, d: 0.08 }); if (heavy) tone({ freq: 60, freqEnd: 35, gain: 0.3, d: 0.15 }); },
    select() { tone({ type: 'square', freq: 330, freqEnd: 495, gain: 0.05, d: 0.08, lp: 1500 }); },
    deny() { tone({ type: 'square', freq: 140, freqEnd: 90, gain: 0.07, d: 0.15, lp: 800 }); },
    whoosh(p = 1) { noise({ type: 'bandpass', freq: 400 * p, freqEnd: 2400 * p, q: 2, gain: 0.25, a: 0.06, d: 0.14 }); },
    clang() {
      const b = R(0.9, 1.15);
      for (const [f, g, d] of [[1180, 0.12, 0.5], [1660, 0.08, 0.35], [2750, 0.06, 0.25], [3900, 0.04, 0.2], [620, 0.08, 0.3]])
        tone({ type: 'triangle', freq: f * b, gain: g, d: d * R(0.8, 1.3) });
      noise({ type: 'highpass', freq: 3000, gain: 0.3, d: 0.06 });
    },
    slash() { noise({ type: 'bandpass', freq: 4000, freqEnd: 600, q: 1.5, gain: 0.35, d: 0.18 }); },
    splat(big = 1) {
      noise({ type: 'lowpass', freq: 1400, freqEnd: 150, q: 6, gain: 0.5 * big, d: 0.25 + 0.2 * big });
      noise({ type: 'bandpass', freq: 700, freqEnd: 300, q: 10, gain: 0.3 * big, d: 0.18, delay: 0.03 });
      tone({ freq: 120, freqEnd: 40, gain: 0.4 * big, d: 0.2 });
      for (let i = 0; i < 4 * big; i++) noise({ type: 'bandpass', freq: R(300, 1200), q: 12, gain: 0.12, d: 0.06, delay: R(0.05, 0.5) });
    },
    squish() { for (let i = 0; i < 3; i++) noise({ type: 'bandpass', freq: R(250, 700), freqEnd: R(120, 250), q: 9, gain: 0.25, d: 0.12, delay: i * R(0.05, 0.11) }); },
    crunch() {
      for (let i = 0; i < 7; i++) noise({ type: 'bandpass', freq: R(900, 3200), q: 3, gain: 0.35, d: 0.03, delay: i * R(0.012, 0.035) });
      tone({ freq: 90, freqEnd: 40, gain: 0.35, d: 0.15 });
    },
    gush(d = 1.2) {
      noise({ type: 'lowpass', freq: 900, freqEnd: 250, q: 4, gain: 0.25, a: 0.05, d });
      for (let i = 0; i < 6; i++) noise({ type: 'bandpass', freq: R(200, 500), q: 14, gain: 0.15, d: 0.1, delay: R(0, d) });
    },
    scream(pitch = 1, len = 0.9) {
      if (!ac || muted) return;
      const t = now();
      const osc = ac.createOscillator(); osc.type = 'sawtooth';
      const f0 = 260 * pitch * R(0.9, 1.1);
      osc.frequency.setValueAtTime(f0 * 0.8, t);
      osc.frequency.linearRampToValueAtTime(f0 * 1.6, t + 0.12);
      osc.frequency.linearRampToValueAtTime(f0 * 1.3, t + len * 0.6);
      osc.frequency.exponentialRampToValueAtTime(f0 * 0.5, t + len);
      const vib = ac.createOscillator(); vib.frequency.value = R(7, 11);
      const vg = ac.createGain(); vg.gain.value = f0 * 0.07; vib.connect(vg); vg.connect(osc.frequency);
      const ws = ac.createWaveShaper(); ws.curve = distCurve;
      const out = ac.createGain(); env(out, t, 0.04, 0.35, len);
      osc.connect(ws);
      for (const [ff, q, g] of [[800, 6, 1], [1250, 8, 0.7], [2600, 10, 0.4]]) {
        const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = ff * R(0.9, 1.1); bp.Q.value = q;
        const bg = ac.createGain(); bg.gain.value = g;
        ws.connect(bp); bp.connect(bg); bg.connect(out);
      }
      out.connect(sfxBus);
      osc.start(t); vib.start(t); osc.stop(t + len + 0.1); vib.stop(t + len + 0.1);
      noise({ type: 'bandpass', freq: 2000, q: 1, gain: 0.08, a: 0.05, d: len * 0.8 });
    },
    roar() {
      tone({ type: 'sawtooth', freq: 70, freqEnd: 45, gain: 0.35, a: 0.1, d: 0.9, dist: true, lp: 600 });
      tone({ type: 'sawtooth', freq: 104, freqEnd: 60, gain: 0.2, a: 0.1, d: 0.8, dist: true, lp: 500 });
      noise({ type: 'lowpass', freq: 500, gain: 0.3, a: 0.1, d: 0.8 });
    },
    grunt(pitch = 1) { tone({ type: 'sawtooth', freq: 140 * pitch, freqEnd: 90 * pitch, gain: 0.18, d: 0.15, dist: true, lp: 900 }); },
    zap() {
      for (let i = 0; i < 10; i++) tone({ type: 'square', freq: R(200, 1800), gain: 0.07, d: 0.05, delay: i * 0.06, lp: 4000 });
      noise({ type: 'highpass', freq: 2500, gain: 0.35, a: 0.01, d: 0.7 });
      tone({ type: 'sawtooth', freq: 55, gain: 0.25, a: 0.02, d: 0.7, dist: true });
    },
    fire() { noise({ type: 'lowpass', freq: 1200, freqEnd: 400, gain: 0.35, a: 0.1, d: 1.4 }); for (let i = 0; i < 12; i++) noise({ type: 'highpass', freq: 3000, gain: 0.15, d: 0.02, delay: R(0, 1.5) }); },
    boom(big = 1) {
      noise({ type: 'lowpass', freq: 800, freqEnd: 60, gain: 0.8 * big, d: 1.0 * big });
      tone({ freq: 70, freqEnd: 25, gain: 0.7 * big, d: 0.9 * big });
    },
    magic() { for (let i = 0; i < 6; i++) tone({ type: 'sine', freq: 400 * Math.pow(1.26, i), gain: 0.06, d: 0.4, delay: i * 0.05 }); },
    bell() {
      for (const [f, g, d] of [[110, 0.12, 3], [220 * 1.19, 0.05, 2], [330, 0.04, 2.5], [520, 0.02, 1.5]]) tone({ freq: f, gain: g, a: 0.01, d, bus: musicBus || sfxBus });
    },
    check() { for (const f of [110, 131, 156]) tone({ type: 'sawtooth', freq: f, gain: 0.08, a: 0.02, d: 1.0, lp: 900 }); S.bell(); },
    stinger() { for (const f of [55, 58.3, 82.4]) tone({ type: 'sawtooth', freq: f, gain: 0.18, a: 0.3, d: 3.5, lp: 700, dist: true }); S.bell(); },
    toggleMusic() { musicOn = !musicOn; if (musicOn) startMusic(); else stopMusic(); return musicOn; },
  };

  // Quiet dark-minor score: soft pads, low bass, a sparse music-box melody, all through reverb.
  function impulse(sec) {
    const len = ac.sampleRate * sec, buf = ac.createBuffer(2, len, ac.sampleRate);
    for (let c = 0; c < 2; c++) { const d = buf.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3); }
    return buf;
  }
  function note(dest, midi, t, dur, type, gain, attack, lp) {
    const osc = ac.createOscillator(); osc.type = type;
    osc.frequency.value = 440 * Math.pow(2, (midi - 69) / 12);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node = osc;
    if (lp) { const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp; osc.connect(f); node = f; }
    node.connect(g); g.connect(dest);
    osc.start(t); osc.stop(t + dur + 0.05);
  }
  function startMusic() {
    if (!ac || musicNodes) return;
    const out = ac.createGain();
    out.gain.setValueAtTime(0.0001, now()); out.gain.exponentialRampToValueAtTime(1, now() + 3);
    const verb = ac.createConvolver(); verb.buffer = impulse(3.5);
    const wet = ac.createGain(); wet.gain.value = 0.6;
    out.connect(musicBus); out.connect(verb); verb.connect(wet); wet.connect(musicBus);
    // Dm - Bb - Gm - A (harmonic minor turnaround)
    const PROG = [[50, 53, 57], [46, 50, 53], [43, 46, 50], [45, 49, 52]];
    const STEP = 0.55;
    let step = 0, next = now() + 0.2, alive = true, timer;
    const schedule = (st, t) => {
      const chord = PROG[Math.floor(st / 8) % 4], s8 = st % 8;
      if (s8 === 0) {
        for (const m of chord) note(out, m + 12, t, STEP * 8 + 0.8, 'triangle', 0.028, 1.4, 900);
        note(out, chord[0] - 12, t, STEP * 7, 'sine', 0.09, 0.3);
      }
      if (s8 === 4) note(out, chord[0] - 12, t, STEP * 3.5, 'sine', 0.06, 0.2);
      if ((s8 % 2 === 0 && Math.random() < 0.6) || Math.random() < 0.15) {
        const m = pick3(chord) + 24 + (Math.random() < 0.2 ? 12 : 0);
        note(out, m, t, 1.6, 'triangle', 0.035, 0.005, 3000);
        note(out, m + 12, t, 0.8, 'sine', 0.012, 0.005);
      }
      if (st % 64 === 32) S.bell();
    };
    const pick3 = c => c[Math.floor(Math.random() * c.length)];
    const tick = () => {
      if (!alive) return;
      while (next < now() + 0.8) { schedule(step, next); step++; next += STEP; }
      timer = setTimeout(tick, 200);
    };
    tick();
    musicNodes = { stop() { alive = false; clearTimeout(timer); out.gain.setTargetAtTime(0.0001, now(), 0.4); } };
  }
  function stopMusic() { if (musicNodes) { musicNodes.stop(); musicNodes = null; } }

  return S;
})();
