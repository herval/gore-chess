// Chess rules + alpha-beta search. Wrapped in a function so the same source
// can be instantiated on the main thread and inside a Blob Web Worker.
function ENGINE() {
  const P = 1, N = 2, B = 3, R = 4, Q = 5, K = 6;
  const pc = (c, t) => c * 8 + t;
  const typeOf = p => p & 7;
  const colorOf = p => p >> 3;

  // squares: index = r*8+f, r=0 is rank 8 (black's back rank)
  const KN = [], KG = [], DRAYS = [], ORAYS = [];
  const inb = (r, f) => r >= 0 && r < 8 && f >= 0 && f < 8;
  for (let sq = 0; sq < 64; sq++) {
    const r = sq >> 3, f = sq & 7;
    KN[sq] = []; KG[sq] = []; DRAYS[sq] = []; ORAYS[sq] = [];
    for (const [dr, df] of [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]])
      if (inb(r + dr, f + df)) KN[sq].push((r + dr) * 8 + f + df);
    for (const [dr, df] of [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]])
      if (inb(r + dr, f + df)) KG[sq].push((r + dr) * 8 + f + df);
    for (const [dr, df] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
      const ray = [];
      for (let i = 1; inb(r + dr * i, f + df * i); i++) ray.push((r + dr * i) * 8 + f + df * i);
      if (ray.length) DRAYS[sq].push(ray);
    }
    for (const [dr, df] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const ray = [];
      for (let i = 1; inb(r + dr * i, f + df * i); i++) ray.push((r + dr * i) * 8 + f + df * i);
      if (ray.length) ORAYS[sq].push(ray);
    }
  }
  // castling-rights mask per square
  const CR = new Array(64).fill(15);
  CR[60] = 15 & ~3; CR[63] = 15 & ~1; CR[56] = 15 & ~2;
  CR[4] = 15 & ~12; CR[7] = 15 & ~4; CR[0] = 15 & ~8;

  class Position {
    constructor() {
      this.b = new Int8Array(64);
      this.side = 0; this.castle = 15; this.ep = -1; this.half = 0; this.full = 1;
      this.kings = [60, 4]; this.hist = [];
    }
    static start() {
      const p = new Position();
      const back = [R, N, B, Q, K, B, N, R];
      for (let f = 0; f < 8; f++) {
        p.b[f] = pc(1, back[f]); p.b[8 + f] = pc(1, P);
        p.b[48 + f] = pc(0, P); p.b[56 + f] = pc(0, back[f]);
      }
      return p;
    }
    attacked(sq, by) {
      const b = this.b, r = sq >> 3, f = sq & 7;
      // pawns
      const pr = by === 0 ? r + 1 : r - 1;
      if (pr >= 0 && pr < 8) {
        const pp = pc(by, P);
        if (f > 0 && b[pr * 8 + f - 1] === pp) return true;
        if (f < 7 && b[pr * 8 + f + 1] === pp) return true;
      }
      const kn = pc(by, N), kg = pc(by, K);
      for (const s of KN[sq]) if (b[s] === kn) return true;
      for (const s of KG[sq]) if (b[s] === kg) return true;
      const bb = pc(by, B), rr = pc(by, R), qq = pc(by, Q);
      for (const ray of DRAYS[sq]) for (const s of ray) { const x = b[s]; if (x) { if (x === bb || x === qq) return true; break; } }
      for (const ray of ORAYS[sq]) for (const s of ray) { const x = b[s]; if (x) { if (x === rr || x === qq) return true; break; } }
      return false;
    }
    inCheck(c = this.side) { return this.attacked(this.kings[c], c ^ 1); }
    pseudo(capsOnly) {
      const out = [], b = this.b, s = this.side, e = s ^ 1;
      const add = (f, t, fl = 0, pr = 0) => out.push({ f, t, p: b[f], c: b[t], pr, fl });
      for (let sq = 0; sq < 64; sq++) {
        const p = b[sq];
        if (!p || colorOf(p) !== s) continue;
        const t = typeOf(p);
        if (t === P) {
          const dir = s === 0 ? -8 : 8, r = sq >> 3, f = sq & 7;
          const one = sq + dir, promoRank = s === 0 ? 1 : 6, startRank = s === 0 ? 6 : 1;
          if (!b[one]) {
            if (r === promoRank) { add(sq, one, 0, Q); if (!capsOnly) { add(sq, one, 0, R); add(sq, one, 0, B); add(sq, one, 0, N); } }
            else if (!capsOnly) {
              add(sq, one);
              if (r === startRank && !b[one + dir]) add(sq, one + dir, 4);
            }
          }
          for (const df of [-1, 1]) {
            if (f + df < 0 || f + df > 7) continue;
            const to = one + df, x = b[to];
            if (x && colorOf(x) === e) {
              if (r === promoRank) { add(sq, to, 0, Q); if (!capsOnly) { add(sq, to, 0, R); add(sq, to, 0, B); add(sq, to, 0, N); } }
              else add(sq, to);
            } else if (to === this.ep) {
              out.push({ f: sq, t: to, p, c: pc(e, P), pr: 0, fl: 1 });
            }
          }
        } else if (t === N || t === K) {
          for (const to of (t === N ? KN : KG)[sq]) {
            const x = b[to];
            if (x ? colorOf(x) === e : !capsOnly) add(sq, to);
          }
          if (t === K && !capsOnly) {
            if (s === 0 && sq === 60) {
              if ((this.castle & 1) && !b[61] && !b[62] && b[63] === pc(0, R) && !this.attacked(60, 1) && !this.attacked(61, 1) && !this.attacked(62, 1)) add(60, 62, 2);
              if ((this.castle & 2) && !b[59] && !b[58] && !b[57] && b[56] === pc(0, R) && !this.attacked(60, 1) && !this.attacked(59, 1) && !this.attacked(58, 1)) add(60, 58, 2);
            } else if (s === 1 && sq === 4) {
              if ((this.castle & 4) && !b[5] && !b[6] && b[7] === pc(1, R) && !this.attacked(4, 0) && !this.attacked(5, 0) && !this.attacked(6, 0)) add(4, 6, 2);
              if ((this.castle & 8) && !b[3] && !b[2] && !b[1] && b[0] === pc(1, R) && !this.attacked(4, 0) && !this.attacked(3, 0) && !this.attacked(2, 0)) add(4, 2, 2);
            }
          }
        } else {
          const rays = t === B ? DRAYS[sq] : t === R ? ORAYS[sq] : DRAYS[sq].concat(ORAYS[sq]);
          for (const ray of rays) for (const to of ray) {
            const x = b[to];
            if (!x) { if (!capsOnly) add(sq, to); continue; }
            if (colorOf(x) === e) add(sq, to);
            break;
          }
        }
      }
      return out;
    }
    make(m) {
      const b = this.b, s = this.side;
      this.hist.push({ m, castle: this.castle, ep: this.ep, half: this.half });
      const p = b[m.f];
      b[m.t] = m.pr ? pc(s, m.pr) : p; b[m.f] = 0;
      if (m.fl & 1) b[m.t + (s === 0 ? 8 : -8)] = 0;
      if (m.fl & 2) {
        if (m.t === 62) { b[61] = b[63]; b[63] = 0; } else if (m.t === 58) { b[59] = b[56]; b[56] = 0; }
        else if (m.t === 6) { b[5] = b[7]; b[7] = 0; } else if (m.t === 2) { b[3] = b[0]; b[0] = 0; }
      }
      if (typeOf(p) === K) this.kings[s] = m.t;
      this.castle &= CR[m.f] & CR[m.t];
      this.ep = (m.fl & 4) ? (m.f + m.t) >> 1 : -1;
      this.half = (typeOf(p) === P || m.c) ? 0 : this.half + 1;
      if (s === 1) this.full++;
      this.side = s ^ 1;
    }
    unmake() {
      const h = this.hist.pop(), m = h.m, b = this.b;
      this.side ^= 1; const s = this.side;
      if (s === 1) this.full--;
      b[m.f] = m.p;
      if (m.fl & 1) { b[m.t] = 0; b[m.t + (s === 0 ? 8 : -8)] = m.c; } else b[m.t] = m.c;
      if (m.fl & 2) {
        if (m.t === 62) { b[63] = b[61]; b[61] = 0; } else if (m.t === 58) { b[56] = b[59]; b[59] = 0; }
        else if (m.t === 6) { b[7] = b[5]; b[5] = 0; } else if (m.t === 2) { b[0] = b[3]; b[3] = 0; }
      }
      if (typeOf(m.p) === K) this.kings[s] = m.f;
      this.castle = h.castle; this.ep = h.ep; this.half = h.half;
    }
    legal() {
      const out = [];
      for (const m of this.pseudo(false)) {
        this.make(m);
        if (!this.attacked(this.kings[m.p >> 3], this.side)) out.push(m);
        this.unmake();
      }
      return out;
    }
    insufficient() {
      let minors = 0;
      for (let i = 0; i < 64; i++) {
        const t = typeOf(this.b[i]);
        if (t === P || t === R || t === Q) return false;
        if (t === N || t === B) minors++;
      }
      return minors <= 1;
    }
    status() {
      const moves = this.legal();
      if (!moves.length) return this.inCheck() ? 'checkmate' : 'stalemate';
      if (this.half >= 100) return 'fifty';
      if (this.insufficient()) return 'insufficient';
      return null;
    }
    san(m) {
      const t = typeOf(m.p);
      let s;
      if (m.fl & 2) s = (m.t & 7) === 6 ? 'O-O' : 'O-O-O';
      else {
        const file = 'ABCDEFGH'[m.t & 7], rank = 8 - (m.t >> 3);
        const cap = m.c ? 'X' : '';
        if (t === P) s = (m.c ? 'ABCDEFGH'[m.f & 7] : '') + cap + file + rank + (m.pr ? '=' + ' PNBRQK'[m.pr] : '');
        else {
          let dis = '';
          const others = this.legal().filter(o => o.t === m.t && o.p === m.p && o.f !== m.f);
          if (others.length) {
            if (!others.some(o => (o.f & 7) === (m.f & 7))) dis = 'ABCDEFGH'[m.f & 7];
            else if (!others.some(o => (o.f >> 3) === (m.f >> 3))) dis = String(8 - (m.f >> 3));
            else dis = 'ABCDEFGH'[m.f & 7] + (8 - (m.f >> 3));
          }
          s = ' PNBRQK'[t] + dis + cap + file + rank;
        }
      }
      this.make(m);
      if (this.inCheck()) s += this.legal().length ? '+' : '#';
      this.unmake();
      return s;
    }
  }

  // ---------------- evaluation ----------------
  const VAL = [0, 100, 320, 330, 500, 900, 0];
  const PST = [
    null,
    [0,0,0,0,0,0,0,0, 50,50,50,50,50,50,50,50, 10,10,20,30,30,20,10,10, 5,5,10,25,25,10,5,5, 0,0,0,20,20,0,0,0, 5,-5,-10,0,0,-10,-5,5, 5,10,10,-20,-20,10,10,5, 0,0,0,0,0,0,0,0],
    [-50,-40,-30,-30,-30,-30,-40,-50, -40,-20,0,0,0,0,-20,-40, -30,0,10,15,15,10,0,-30, -30,5,15,20,20,15,5,-30, -30,0,15,20,20,15,0,-30, -30,5,10,15,15,10,5,-30, -40,-20,0,5,5,0,-20,-40, -50,-40,-30,-30,-30,-30,-40,-50],
    [-20,-10,-10,-10,-10,-10,-10,-20, -10,0,0,0,0,0,0,-10, -10,0,5,10,10,5,0,-10, -10,5,5,10,10,5,5,-10, -10,0,10,10,10,10,0,-10, -10,10,10,10,10,10,10,-10, -10,5,0,0,0,0,5,-10, -20,-10,-10,-10,-10,-10,-10,-20],
    [0,0,0,0,0,0,0,0, 5,10,10,10,10,10,10,5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, 0,0,0,5,5,0,0,0],
    [-20,-10,-10,-5,-5,-10,-10,-20, -10,0,0,0,0,0,0,-10, -10,0,5,5,5,5,0,-10, -5,0,5,5,5,5,0,-5, 0,0,5,5,5,5,0,-5, -10,5,5,5,5,5,0,-10, -10,0,5,0,0,0,0,-10, -20,-10,-10,-5,-5,-10,-10,-20],
    [-30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30, -20,-30,-30,-40,-40,-30,-30,-20, -10,-20,-20,-20,-20,-20,-20,-10, 20,20,0,0,0,0,20,20, 20,30,10,0,0,10,30,20],
  ];
  const KING_END = [-50,-40,-30,-20,-20,-30,-40,-50, -30,-20,-10,0,0,-10,-20,-30, -30,-10,20,30,30,20,-10,-30, -30,-10,30,40,40,30,-10,-30, -30,-10,30,40,40,30,-10,-30, -30,-10,20,30,30,20,-10,-30, -30,-30,0,0,0,0,-30,-30, -50,-30,-30,-30,-30,-30,-30,-50];

  function evaluate(pos) {
    const b = pos.b;
    let score = 0, npm = 0;
    for (let i = 0; i < 64; i++) { const t = typeOf(b[i]); if (t > 1 && t < 6) npm += VAL[t]; }
    const endgame = npm <= 2600;
    for (let i = 0; i < 64; i++) {
      const p = b[i]; if (!p) continue;
      const t = typeOf(p), c = colorOf(p);
      const sq = c === 0 ? i : i ^ 56;
      const pst = (t === K && endgame) ? KING_END[sq] : PST[t][sq];
      const v = VAL[t] + pst;
      score += c === 0 ? v : -v;
    }
    return pos.side === 0 ? score : -score;
  }

  // ---------------- search ----------------
  const MATE = 100000;
  function orderMoves(moves, pvMove) {
    for (const m of moves) {
      let s = 0;
      if (m.c) s += 10 * VAL[typeOf(m.c)] + 1000 - VAL[typeOf(m.p)];
      if (m.pr) s += VAL[m.pr] + 800;
      if (pvMove && m.f === pvMove.f && m.t === pvMove.t && m.pr === pvMove.pr) s += 100000;
      m.s = s;
    }
    moves.sort((a, b) => b.s - a.s);
  }

  function search(pos, opts = {}) {
    const timeMs = opts.time || 800, maxDepth = opts.depth || 5, noise = opts.noise || 0, bloodlust = opts.bloodlust || 0;
    const t0 = Date.now();
    let nodes = 0, stop = false;
    const check = () => { if ((++nodes & 1023) === 0 && Date.now() - t0 > timeMs) stop = true; return stop; };

    function quiesce(alpha, beta, ply) {
      if (check()) return 0;
      const stand = evaluate(pos);
      if (stand >= beta) return beta;
      if (stand > alpha) alpha = stand;
      if (ply > 12) return stand;
      const moves = pos.pseudo(true);
      orderMoves(moves);
      for (const m of moves) {
        pos.make(m);
        if (pos.attacked(pos.kings[pos.side ^ 1], pos.side)) { pos.unmake(); continue; }
        const sc = -quiesce(-beta, -alpha, ply + 1);
        pos.unmake();
        if (stop) return 0;
        if (sc >= beta) return beta;
        if (sc > alpha) alpha = sc;
      }
      return alpha;
    }
    function negamax(depth, alpha, beta, ply) {
      if (check()) return 0;
      const inChk = pos.inCheck();
      if (inChk) depth++;
      if (depth <= 0) return quiesce(alpha, beta, ply);
      if (pos.half >= 100) return 0;
      const moves = pos.pseudo(false);
      orderMoves(moves);
      let legalCount = 0;
      for (const m of moves) {
        pos.make(m);
        if (pos.attacked(pos.kings[pos.side ^ 1], pos.side)) { pos.unmake(); continue; }
        legalCount++;
        const sc = -negamax(depth - 1, -beta, -alpha, ply + 1);
        pos.unmake();
        if (stop) return 0;
        if (sc >= beta) return beta;
        if (sc > alpha) alpha = sc;
      }
      if (!legalCount) return inChk ? -MATE + ply : 0;
      return alpha;
    }

    const root = pos.legal();
    if (!root.length) return null;
    // discourage shuffling a piece straight back where it came from
    const lastOwn = pos.hist.length >= 2 ? pos.hist[pos.hist.length - 2].m : null;
    const repPenalty = opts.repPenalty === undefined ? 35 : opts.repPenalty;
    let best = root[0], pv = null;
    for (let d = 1; d <= maxDepth; d++) {
      orderMoves(root, pv);
      let alpha = -Infinity, bestHere = null;
      for (const m of root) {
        // root-only preferences; folded into the window so fail-hard clamping stays exact
        let bonus = 0;
        if (m.c) bonus += bloodlust;           // a taste for carnage
        if (lastOwn && m.f === lastOwn.t && m.t === lastOwn.f) bonus -= repPenalty;
        if (noise) bonus += (Math.random() - 0.5) * noise;
        pos.make(m);
        const sc = -negamax(d - 1, -Infinity, -(alpha - bonus), 1) + bonus;
        pos.unmake();
        if (stop) break;
        if (sc > alpha) { alpha = sc; bestHere = m; }
      }
      if (stop && !bestHere) break;
      if (bestHere) { best = bestHere; pv = bestHere; }
      if (stop || alpha > MATE - 100) break;
    }
    return best;
  }

  return { Position, search, P, N, B, R, Q, K, pc, typeOf, colorOf };
}

// Runs the search off the main thread so torches keep flickering while the AI thinks.
function makeAIWorker() {
  try {
    const src = ENGINE.toString() + `
      const E = ENGINE();
      onmessage = e => {
        const { moves, opts } = e.data;
        const pos = E.Position.start();
        for (const [f, t, pr] of moves) {
          const m = pos.legal().find(m => m.f === f && m.t === t && (m.pr || 0) === (pr || 0));
          pos.make(m);
        }
        const best = E.search(pos, opts);
        postMessage(best ? [best.f, best.t, best.pr || 0] : null);
      };`;
    const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
    return new Worker(url);
  } catch (e) {
    return null;
  }
}
