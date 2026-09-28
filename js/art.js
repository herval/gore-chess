// Pixel-art generation: every character part is authored as a tiny char-grid,
// rendered through a faction palette, and auto-outlined.
const W = 480, H = 300;
const SQ_W = 34, SQ_H = 24, BX = 104, BY = 68;
const TYPE_CH = [null, 'p', 'n', 'b', 'r', 'q', 'k'];

const FIXED = {
  k: '#140c14', r: '#b0101c', q: '#5a0610', W: '#ffffff', w: '#ece4d0', v: '#a89c84', o: '#8a5a30', p: '#553418',
  m: '#f4f4fa', n: '#b0b4c4', l: '#5e6276', P: '#d86a7c', Q: '#f4a8b8', M: '#7a1a2a', O: '#ff9a2a',
};
const PALS = {
  w: { a: '#f6f6fa', b: '#c6cad8', c: '#8a90aa', d: '#50567a', g: '#ffd24a', h: '#c08624', e: '#4474e0', f: '#23408e', s: '#f2c8a0', t: '#c48a62', x: '#1a1422', u: '#f4dc8e', U: '#b8944a', y: '#c8f6ff', z: '#40b8ff' },
  b: { a: '#8a84a6', b: '#5a5474', c: '#3a3450', d: '#201b2e', g: '#ff3a2e', h: '#9a1420', e: '#8a1838', f: '#4a0a20', s: '#b8c69a', t: '#76865e', x: '#ff2a1a', u: '#3a2446', U: '#1c0e24', y: '#ffc070', z: '#ff3010' },
};
const ROOK_PALS = {
  w: { a: '#f0e8d4', b: '#c6bba2', c: '#8e836c', d: '#5c5444', g: '#8af0ff', h: '#2a98d8', x: '#bff8ff' },
  b: { a: '#6a6474', b: '#46404e', c: '#2a2532', d: '#16121c', g: '#ffb030', h: '#e03a10', x: '#ffd060' },
};
const OUTLINE = '#0c0610';

// ---------- grid helpers ----------
const grid = (w, h) => Array.from({ length: h }, () => Array(w).fill('.'));
const rows = rs => rs.map(r => r.split(''));
function rectG(g, x, y, w, h, c) { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (g[j] && i >= 0 && i < g[j].length) g[j][i] = c; }
function seeded(seed) { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

function limbG(w, len, o = {}) {
  const ext = o.foot || 0;
  const g = grid(w + ext, len + 1);
  const hi = o.hi || 'a', mid = o.mid || 'b', lo = o.lo || 'c';
  for (let y = 0; y <= len; y++) for (let x = 0; x < w; x++) g[y][x] = x === 0 ? hi : x === w - 1 ? lo : mid;
  for (const b of o.bands || []) for (let x = 0; x < w; x++) g[b][x] = x === w - 1 ? (o.bandLo || 'h') : (o.band || 'g');
  if (o.hand) for (let y = len + 1 - o.hand; y <= len; y++) for (let x = 0; x < w; x++) g[y][x] = x === w - 1 ? (o.handLo || 't') : (o.handKey || 's');
  if (ext) {
    for (let y = len - 1; y <= len; y++) for (let x = 0; x < w + ext; x++) g[y][x] = y === len ? (o.soleKey || 'd') : (x >= w - 1 ? (o.bootKey || 'c') : g[y][x]);
  }
  if (o.round) { g[0][0] = '.'; g[0][w - 1] = '.'; }
  return { g, ax: Math.floor((w - 1) / 2), ay: 0 };
}
function textureG(g, keys, sub, prob, seed) {
  const rnd = seeded(seed);
  for (const r of g) for (let i = 0; i < r.length; i++) if (keys.includes(r[i]) && rnd() < prob) r[i] = sub;
}

// ---------- part definitions per piece type (facing right) ----------
const TYPES = {
  p: {
    name: 'PAWN', thigh: 6, shin: 6, torso: 9, upper: 5, fore: 5, tw: 8, weapon: 'spear', shield: true, pitch: 1.25, mass: 1,
    rest: { t: 0.05, ua: 0.15, fa: 1.35, gw: Math.PI, ub: 0.7, fb: 0.7, s: -1.4, la: 0.2, lk: -0.1, ra: -0.2, rk: 0 },
  },
  n: {
    name: 'KNIGHT', thigh: 7, shin: 7, torso: 11, upper: 6, fore: 6, tw: 10, weapon: 'greatsword', pitch: 1.0, mass: 1.3,
    rest: { t: 0.08, ua: 0.3, fa: 0.9, gw: Math.PI - 0.5, ub: 0.45, fb: 0.9, la: 0.22, lk: -0.1, ra: -0.22, rk: 0 },
  },
  b: {
    name: 'BISHOP', thigh: 7, shin: 7, torso: 11, upper: 6, fore: 6, tw: 9, weapon: 'mace', skirt: true, pitch: 0.9, mass: 1.1,
    rest: { t: 0.04, ua: 0.1, fa: 0.7, gw: Math.PI + 0.35, ub: 0.3, fb: 0.6, la: 0.12, lk: 0, ra: -0.12, rk: 0 },
  },
  r: {
    name: 'ROOK', thigh: 6, shin: 7, torso: 18, upper: 9, fore: 10, tw: 16, weapon: null, golem: true, pitch: 0.5, mass: 2.5,
    rest: { t: 0.12, ua: 0.25, fa: 0.25, ub: -0.05, fb: 0.35, la: 0.25, lk: -0.1, ra: -0.25, rk: 0 },
  },
  q: {
    name: 'QUEEN', thigh: 7, shin: 7, torso: 11, upper: 6, fore: 6, tw: 8, weapon: 'staff', skirt: true, pitch: 1.7, mass: 1,
    rest: { t: 0.0, ua: 0.2, fa: 1.0, gw: Math.PI, ub: 0.25, fb: 0.5, la: 0.08, lk: 0, ra: -0.08, rk: 0 },
  },
  k: {
    name: 'KING', thigh: 8, shin: 7, torso: 13, upper: 7, fore: 7, tw: 11, weapon: 'labrys', cape: true, pitch: 0.75, mass: 1.6,
    rest: { t: 0.06, ua: 0.1, fa: 1.3, gw: Math.PI + 0.55, ub: 0.3, fb: 0.6, la: 0.2, lk: -0.1, ra: -0.2, rk: 0 },
  },
};

function partGrids(type, faction) {
  const P = {};
  switch (type) {
    case 'p':
      P.head = { g: rows([
        '...aab...',
        '..abbbc..',
        '.abbbbbc.',
        'accccccdd',
        '..sssxs..',
        '..ssssss.',
        '..tssks..',
        '...ttt...',
        '...tt....']), ax: 4, ay: 8 };
      P.torso = { g: rows([
        '.bbbbbb.',
        'abeeeefc',
        'abegeefc',
        'aegggefc',
        'abegeefc',
        'abeeeefc',
        'abeeeffc',
        'hhhghhhh',
        'bfffffff',
        '.ffffff.']), ax: 4, ay: 9 };
      P.upper = limbG(4, 5, { bands: [0], band: 'b', bandLo: 'c' });
      P.fore = limbG(3, 5, { hand: 2 });
      P.thigh = limbG(4, 6, { hi: 'e', mid: 'f', lo: 'f' });
      P.shin = limbG(4, 6, { foot: 2, hi: 'b', mid: 'c', lo: 'd', bands: [1], band: 'c', bandLo: 'd' });
      P.weapon = { g: rows(['.l.', '.l.', ...Array(20).fill('.o.'), '.h.', 'lmn', 'lmn', 'lmn', '.m.', '.m.']), ax: 1, ay: 9 };
      P.shield = { g: rows([
        '.abbbc.',
        'abeeefc',
        'abegefc',
        'aegggfc',
        'abegefc',
        'abegefc',
        '.beeef.',
        '..bcc..']), ax: 3, ay: 4 };
      break;
    case 'n':
      P.head = { g: rows([
        '..hh.......',
        '.hhabb.....',
        '.habbbb....',
        'hhabxbbbb..',
        'habbbbbbbc.',
        'habbbbbbbcc',
        'hbbbbccbckc',
        'hbbbcc.cccc',
        '.bbcc......',
        '.bbcc......',
        '..cc.......']), ax: 3, ay: 10 };
      P.torso = { g: rows([
        '..abbbbb..',
        '.aabbbbbc.',
        'aabbgbbbcc',
        'abbgggbbcc',
        'abbbgbbbcc',
        'abbbgbbccc',
        '.abbbbbcc.',
        '.hhhhhhhh.',
        '.abbbbbcc.',
        '.abcbbccc.',
        '.aeeeeeff.',
        '..eeeeff..']), ax: 5, ay: 11 };
      P.upper = limbG(5, 6, { bands: [0, 3], round: true });
      P.fore = limbG(4, 6, { hand: 2, handKey: 'c', handLo: 'd', bands: [2] });
      P.thigh = limbG(5, 7, { bands: [5] });
      P.shin = limbG(5, 7, { foot: 2, bands: [0] });
      P.weapon = { g: rows(['..h..', '..p..', '..p..', '..p..', 'hgggh', ...Array(19).fill('.mnl.'), '.mn..', '..n..']), ax: 2, ay: 2 };
      break;
    case 'b':
      P.head = { g: rows([
        '....e....',
        '...eef...',
        '..eegef..',
        '..egggf..',
        '.eeegeef.',
        '.eeegeef.',
        '.ggggggg.',
        '..ssssxs.',
        '..sssssss',
        '..tsskss.',
        '..wwwwwt.',
        '...wwwv..',
        '....wv...']), ax: 4, ay: 10 };
      P.torso = { g: rows([
        '.eeeeee..',
        'eegeeeeff',
        'eegeegeff',
        'eegeggfff',
        'eegeegfff',
        'eegeegfff',
        'eegeeefff',
        'hhhhhhhhh',
        'eegeeefff',
        'eegeeefff',
        'eegeeefff']), ax: 4, ay: 10 };
      P.upper = limbG(4, 6, { hi: 'e', mid: 'e', lo: 'f', bands: [0], band: 'g', bandLo: 'h' });
      P.fore = limbG(4, 6, { hi: 'e', mid: 'e', lo: 'f', hand: 2, bands: [3], band: 'g', bandLo: 'h' });
      P.thigh = limbG(4, 7, { hi: 'f', mid: 'f', lo: 'd' });
      P.shin = limbG(4, 7, { foot: 2, hi: 'c', mid: 'd', lo: 'd' });
      {
        const g = grid(12, 11);
        for (let y = 0; y < 11; y++) { const w = 8 + Math.floor(y / 3); const x0 = 6 - Math.ceil(w / 2); for (let x = 0; x < w; x++) g[y][x0 + x] = x === 2 ? 'g' : x > w - 4 ? 'f' : 'e'; }
        for (let x = 0; x < 12; x++) if (g[10][x] !== '.') g[10][x] = 'g';
        P.skirt = { g, ax: 5, ay: 0 };
      }
      P.weapon = { g: rows(['...h...', '...o...', '...o...', ...Array(9).fill('...o...'), '...h...', '..lnl..', '.lmmnl.', 'lmmnnnl', '.lmnnl.', '..lnl..', '...l...']), ax: 3, ay: 2 };
      break;
    case 'r': {
      P.head = { g: rows([
        'ab.bb.bc..',
        'abbbbbbcc.',
        'abbbbbbbc.',
        'abbbbxxbc.',
        'abbbbbbbcc',
        'abbkkkkbcc',
        '.bbbbbbcc.',
        '..bbbbcc..']), ax: 4, ay: 6 };
      const t = rows([
        '....abbbbbbc....',
        '..aabbbbbbbbcc..',
        '.aabbbbbbbbbbcc.',
        'aabbbbbbbbbbbccc',
        'abbbbhbbbbbbbccc',
        'abbbbghbbbbbbccd',
        'abbbbbghbbbbcccd',
        'abbbbbbgbbbbcccd',
        '.abbbbbghbbbccd.',
        '.abbbbbbgbbccdd.',
        '.abbbbbbghbccdd.',
        '..abbbbbbgbcdd..',
        '..abbbbbbbhcdd..',
        '..abbbbbbcccdd..',
        '...abbbbcccdd...',
        '...abbbbcccdd...',
        '...abbbccccd....',
        '....bcccddd.....',
        '.....cccdd......']);
      textureG(t, ['b'], 'c', 0.08, 77);
      textureG(t, ['b'], 'a', 0.04, 78);
      P.torso = { g: t, ax: 8, ay: 18 };
      P.upper = limbG(6, 9, { lo: 'd', bands: [4], band: 'g', bandLo: 'h' });
      textureG(P.upper.g, ['b'], 'c', 0.1, 5);
      const fore = limbG(7, 10, { lo: 'd' });
      rectG(fore.g, 0, 6, 7, 5, 'b'); rectG(fore.g, 6, 6, 1, 5, 'd'); rectG(fore.g, 0, 6, 1, 5, 'a');
      fore.g[7][2] = 'c'; fore.g[7][4] = 'c'; fore.g[3][3] = 'g';
      textureG(fore.g, ['b'], 'c', 0.1, 9);
      P.fore = fore;
      P.thigh = limbG(6, 7, { lo: 'd' });
      P.shin = limbG(7, 7, { foot: 1, lo: 'd', bands: [2], band: 'g', bandLo: 'h' });
      textureG(P.shin.g, ['b'], 'c', 0.1, 11);
      break;
    }
    case 'q':
      P.head = { g: rows([
        '...g.g.g..',
        '...ggggg..',
        '..uuuuuuu.',
        '.uuusssxs.',
        '.uuussssss',
        'uuuusssrs.',
        'uuUuttss..',
        'uuU..tt...',
        'uU........',
        'uU........',
        'U.........']), ax: 6, ay: 7 };
      P.torso = { g: rows([
        '.ssssss.',
        'ssssssst',
        '.eeggeef',
        '.eegeeff',
        '.eeeeeff',
        '..eegef.',
        '..eeeef.',
        '..eeeff.',
        '.heeefff',
        '.hhhhhhh',
        'eeeeefff']), ax: 4, ay: 10 };
      P.upper = limbG(3, 6, { hi: 's', mid: 's', lo: 't', bands: [0], band: 'e', bandLo: 'f' });
      P.fore = limbG(3, 6, { hi: 's', mid: 's', lo: 't', bands: [0], band: 'g', bandLo: 'h' });
      P.thigh = limbG(4, 7, { hi: 'e', mid: 'e', lo: 'f' });
      P.shin = limbG(4, 7, { foot: 2, hi: 'e', mid: 'f', lo: 'f' });
      {
        const g = grid(15, 12);
        for (let y = 0; y < 12; y++) { const w = 8 + Math.floor(y * 0.6); const x0 = 7 - Math.ceil(w / 2); for (let x = 0; x < w; x++) g[y][x0 + x] = x > w - 4 ? 'f' : (x === 1 && y > 2 ? 'g' : 'e'); }
        for (let x = 0; x < 15; x++) if (g[11][x] !== '.') g[11][x] = 'g';
        P.skirt = { g, ax: 6, ay: 0 };
      }
      P.weapon = { g: rows(['..g..', ...Array(5).fill('..o..'), '..g..', ...Array(9).fill('..o..'), '..g..', '..o..', '.g.g.', 'g.y.g', 'gyzyg', 'gyzzy', '.yzy.', '..g..']), ax: 2, ay: 10 };
      break;
    case 'k':
      P.head = faction === 'w' ? { g: rows([
        '..g.g.g.g..',
        '..ggggggg..',
        '..hhhhhhh..',
        '.abbbbbbbc.',
        '.abbbxxxxc.',
        '.abbbbbbcc.',
        '.abbbkbkcc.',
        '.abbbbbccc.',
        '..wwwwwww..',
        '..wwwwwwv..',
        '...wwwwv...',
        '....wwv....']), ax: 5, ay: 9 } : { g: rows([
        '..g.g.g.g..',
        '..ggggggg..',
        '..hhhhhhh..',
        '..wwwwwww..',
        '.wwwwwwwwv.',
        '.wwwkxwkxv.',
        '.wwwkkwkkv.',
        '.wwwwwkwwv.',
        '..wwwwwwv..',
        '..wwkwkwv..',
        '..wwwwwv...',
        '...vvvv....']), ax: 5, ay: 10 };
      P.torso = { g: rows([
        '.wwwwwwwww.',
        'wwkwwwwkwww',
        'abbbbbbbbcc',
        'abbgggbbbcc',
        'abbgbgbbbcc',
        'abbgggbbccc',
        'abbbgbbbccc',
        '.abbbbbbcc.',
        '.hhhhghhhh.',
        '.abbbbbbcc.',
        '.aeeeeeeff.',
        '.aeeeeeeff.',
        '..eeeeeff..']), ax: 5, ay: 12 };
      P.upper = limbG(5, 7, { bands: [0, 1], band: 'g', bandLo: 'h', round: true });
      P.fore = limbG(4, 7, { hand: 2, handKey: 'c', handLo: 'd', bands: [1], band: 'g' });
      P.thigh = limbG(5, 8, { bands: [6] });
      P.shin = limbG(5, 7, { foot: 2, bands: [0], band: 'g' });
      {
        const g = grid(11, 25);
        for (let y = 0; y < 25; y++) { const w = 6 + Math.floor(y / 5); const x0 = 5 - Math.floor(w / 2); for (let x = 0; x < w; x++) g[y][x0 + x] = x === 0 ? 'f' : x < 2 ? 'e' : x > w - 3 ? 'f' : 'e'; }
        for (let x = 0; x < 11; x++) if (g[24][x] !== '.') g[24][x] = 'g';
        g[0][2] = 'g'; g[0][8] = 'g';
        P.cape = { g, ax: 5, ay: 0 };
      }
      P.weapon = { g: rows([
        '.....g.....', ...Array(17).fill('.....o.....'),
        '.mn..h..nm.',
        'mnnl.h.lnnm',
        'mnnllhllnnm',
        'mnnllhllnnm',
        'mnnllhllnnm',
        'mnnl.h.lnnm',
        '.mn..h..nm.',
        '.....h.....',
        '.....g.....']), ax: 5, ay: 8 };
      break;
  }
  return P;
}

function skeletonGrids(type) {
  const T = TYPES[type];
  const P = {};
  P.head = { g: rows([
    '.wwwww.',
    'wwwwwwv',
    'wwwkkwv',
    'wwwkkwv',
    'wwwwwkv',
    '.wkwkwv',
    '.wwwwv.',
    '..vvv..']), ax: 3, ay: 7 };
  const tw = Math.max(6, T.tw - 2), th = T.torso;
  const g = grid(tw, th + 1);
  for (let y = 0; y <= th; y++) g[y][1] = 'v';
  for (let y = 1; y < th - 3; y += 2) for (let x = 1; x < tw - 1; x++) g[y][x] = x === tw - 2 ? 'v' : 'w';
  for (let x = 0; x < tw; x++) { g[th][x] = 'w'; g[th - 1][x] = x > 0 && x < tw - 1 ? 'w' : '.'; }
  P.torso = { g, ax: Math.floor(tw / 2), ay: th };
  const bone = len => {
    const b = limbG(2, len, { hi: 'w', mid: 'w', lo: 'v' });
    b.g.forEach(r => r.push('.'));
    b.g[0][2] = 'v'; b.g[len][2] = 'v';
    return b;
  };
  P.upper = bone(T.upper); P.fore = bone(T.fore); P.thigh = bone(T.thigh);
  P.shin = bone(T.shin); P.shin.g[T.shin][3] = 'w'; P.shin.g[T.shin].push('w');
  return P;
}

// ---------- rendering grids to canvases ----------
function makeCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function renderGrid(part, pal) {
  const g = part.g, h = g.length, w = Math.max(...g.map(r => r.length));
  const c = makeCanvas(w + 2, h + 2), x = c.getContext('2d');
  for (let j = 0; j < h; j++) for (let i = 0; i < g[j].length; i++) {
    const k = g[j][i]; if (k === '.') continue;
    x.fillStyle = pal[k] || FIXED[k] || '#f0f';
    x.fillRect(i + 1, j + 1, 1, 1);
  }
  outlineCanvas(c);
  return { c, ax: part.ax + 1, ay: part.ay + 1, v: {} };
}
function outlineCanvas(c, col = OUTLINE) {
  const x = c.getContext('2d'), w = c.width, h = c.height;
  const id = x.getImageData(0, 0, w, h), d = id.data;
  const op = (i, j) => i >= 0 && j >= 0 && i < w && j < h && d[(j * w + i) * 4 + 3] > 0;
  const add = [];
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (!op(i, j) && (op(i - 1, j) || op(i + 1, j) || op(i, j - 1) || op(i, j + 1))) add.push([i, j]);
  x.fillStyle = col;
  for (const [i, j] of add) x.fillRect(i, j, 1, 1);
}
function hexToRgb(h) { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
const OUTLINE_RGB = hexToRgb(OUTLINE);

// Sprite variants: back (shaded far limbs), flash (white), char (burnt), blood1..3, remains (baked corpse)
function variant(spr, name) {
  if (spr.v[name]) return spr.v[name];
  const src = spr.c, w = src.width, h = src.height;
  const c = makeCanvas(w, h), x = c.getContext('2d');
  x.drawImage(src, 0, 0);
  const id = x.getImageData(0, 0, w, h), d = id.data;
  const rnd = seeded(w * 131 + h * 17 + name.length * 7);
  const isOutline = i => d[i] === OUTLINE_RGB[0] && d[i + 1] === OUTLINE_RGB[1] && d[i + 2] === OUTLINE_RGB[2];
  for (let i = 0; i < d.length; i += 4) {
    if (!d[i + 3]) continue;
    const lum = (d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11) / 255;
    if (name === 'back') { d[i] *= 0.68; d[i + 1] *= 0.66; d[i + 2] *= 0.74; }
    else if (name === 'flash') { d[i] = d[i + 1] = d[i + 2] = 255; }
    else if (name === 'char') {
      if (isOutline(i)) continue;
      const r = rnd();
      if (r < 0.06) { d[i] = 255; d[i + 1] = 110 + rnd() * 80; d[i + 2] = 20; }
      else { const v = 14 + lum * 40 + rnd() * 10; d[i] = v * 1.2; d[i + 1] = v * 0.85; d[i + 2] = v * 0.7; }
    } else if (name.startsWith('blood')) {
      if (isOutline(i)) continue;
      const lvl = +name.slice(5);
      if (rnd() < [0, 0.1, 0.2, 0.34][lvl]) {
        const cols = [[138, 10, 20], [176, 16, 28], [106, 6, 16]];
        const cc = cols[Math.floor(rnd() * 3)];
        d[i] = cc[0]; d[i + 1] = cc[1]; d[i + 2] = cc[2];
      }
    } else if (name === 'remains') {
      const v = lum;
      d[i] = 40 + v * 70 + (rnd() < 0.25 ? 30 : 0); d[i + 1] = 8 + v * 22; d[i + 2] = 12 + v * 22; d[i + 3] = 225;
    } else if (name === 'gore') { // meat-side view of a severed chunk, for gibs
      if (!isOutline(i) && rnd() < 0.3) { d[i] = 150; d[i + 1] = 14; d[i + 2] = 24; }
    }
  }
  x.putImageData(id, 0, 0);
  const out = { c, ax: spr.ax, ay: spr.ay, v: {} };
  spr.v[name] = out;
  return out;
}

// cache of rendered part sprites: SPRITES[type+faction][part]
const SPRITES = {};
function spritesFor(type, faction) {
  const key = type + faction;
  if (SPRITES[key]) return SPRITES[key];
  const pal = Object.assign({}, PALS[faction], type === 'r' ? ROOK_PALS[faction] : {});
  const grids = partGrids(type, faction), skel = skeletonGrids(type);
  const out = { skel: {} };
  for (const k in grids) out[k] = renderGrid(grids[k], pal);
  const bonePal = { w: '#e8e0c8', v: '#a09478', k: '#1a1014' };
  for (const k in skel) out.skel[k] = renderGrid(skel[k], bonePal);
  SPRITES[key] = out;
  return out;
}

// ---------- gib chunk sprites ----------
const CHUNKS = {};
function buildChunks() {
  const pal = FIXED;
  const blob = (seed, w, h, keys) => {
    const rnd = seeded(seed), g = grid(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const dx = (x - (w - 1) / 2) / (w / 2), dy = (y - (h - 1) / 2) / (h / 2);
      if (dx * dx + dy * dy < 0.9 + rnd() * 0.5) g[y][x] = keys[Math.floor(rnd() * keys.length)];
    }
    return renderGrid({ g, ax: w >> 1, ay: h >> 1 }, pal);
  };
  CHUNKS.meat = []; CHUNKS.bone = []; CHUNKS.brain = []; CHUNKS.organ = [];
  for (let i = 0; i < 10; i++) CHUNKS.meat.push(blob(i + 3, 2 + (i % 3), 2 + ((i >> 1) % 3), ['r', 'r', 'M', 'q', 'P']));
  for (let i = 0; i < 6; i++) CHUNKS.bone.push(blob(i + 40, 1 + (i % 2), 2 + (i % 3), ['w', 'w', 'v']));
  for (let i = 0; i < 6; i++) CHUNKS.brain.push(blob(i + 90, 2 + (i % 2), 2 + (i % 2), ['Q', 'P', 'Q', 'r']));
  for (let i = 0; i < 4; i++) CHUNKS.organ.push(blob(i + 120, 4 + (i % 2), 3 + (i % 2), ['M', 'r', 'P', 'M', 'q']));
  CHUNKS.eye = renderGrid({ g: rows(['.WW.', 'WWkW', 'WrWW', '.Wr.', '..r.']), ax: 2, ay: 1 }, pal);
  CHUNKS.skull = renderGrid(skeletonGrids('p').head, { w: '#e8e0c8', v: '#a09478', k: '#1a1014' });
  CHUNKS.jaw = renderGrid({ g: rows(['w.....', 'wwwwwv', '.vkvkv']), ax: 3, ay: 1 }, { w: '#e8e0c8', v: '#a09478', k: '#1a1014' });
  CHUNKS.shard = {}; CHUNKS.rock = {};
  for (const f of ['w', 'b']) {
    CHUNKS.shard[f] = []; CHUNKS.rock[f] = [];
    for (let i = 0; i < 6; i++) {
      const sw = 2 + (i % 3), sg = grid(sw, 2);
      rectG(sg, 0, 0, sw, 1, 'a'); rectG(sg, 0, 1, sw, 1, 'c');
      if (i % 2) sg[1][0] = '.';
      CHUNKS.shard[f].push(renderGrid({ g: sg, ax: 1, ay: 1 }, PALS[f]));
      const rnd = seeded(i + 900), rw = 3 + (i % 3), rh = 2 + (i % 3), rg = grid(rw, rh);
      for (let y = 0; y < rh; y++) for (let x = 0; x < rw; x++) if (rnd() < 0.85) rg[y][x] = y === 0 ? 'a' : rnd() < 0.2 ? 'g' : x === rw - 1 ? 'c' : 'b';
      CHUNKS.rock[f].push(renderGrid({ g: rg, ax: rw >> 1, ay: rh >> 1 }, ROOK_PALS[f]));
    }
  }
}

// ---------- environment ----------
function sqCenter(sq) { const r = sq >> 3, f = sq & 7; return { x: BX + f * SQ_W + SQ_W / 2, y: BY + r * SQ_H + SQ_H / 2 + 4 }; }

function buildBackground() {
  const c = makeCanvas(W, H), x = c.getContext('2d');
  const rnd = seeded(1337);
  const R = (a, b) => a + rnd() * (b - a);
  // wall
  x.fillStyle = '#17121b'; x.fillRect(0, 0, W, 60);
  for (let row = 0; row < 8; row++) {
    const y = row * 8, off = (row % 2) * 8;
    for (let bx = -16 + off; bx < W; bx += 16) {
      const v = R(0, 1);
      x.fillStyle = v < 0.15 ? '#241c2a' : v < 0.5 ? '#2c2332' : v < 0.85 ? '#31283a' : '#3a2f42';
      x.fillRect(bx + 1, y + 1, 15, 7);
      x.fillStyle = '#3f3448'; x.fillRect(bx + 1, y + 1, 15, 1);
      x.fillStyle = '#1b1520'; x.fillRect(bx + 1, y + 7, 15, 1);
      if (rnd() < 0.12) { x.fillStyle = '#2f4a2a'; x.fillRect(bx + R(2, 12), y + 6, R(2, 5), 2); } // moss
    }
  }
  // old blood runs down the wall
  for (let i = 0; i < 14; i++) {
    const bx = Math.floor(R(0, W)), len = Math.floor(R(6, 40)), y0 = Math.floor(R(0, 25));
    x.fillStyle = '#3e0a12'; x.fillRect(bx, y0, 2, len); x.fillRect(bx - 1, y0, 4, 2);
    x.fillStyle = '#58101a'; x.fillRect(bx, y0 + len, 2, 2);
  }
  // wall base ledge
  x.fillStyle = '#0e0a10'; x.fillRect(0, 56, W, 4);
  x.fillStyle = '#3a3040'; x.fillRect(0, 54, W, 2);
  // floor flagstones
  x.fillStyle = '#141016'; x.fillRect(0, 60, W, H - 60);
  for (let y = 60; y < H; y += 14) {
    const off = ((y / 14) % 2) * 13;
    for (let fx = -26 + off; fx < W; fx += 26) {
      const v = R(0, 1);
      x.fillStyle = v < 0.3 ? '#1d1820' : v < 0.7 ? '#221c26' : '#28212c';
      x.fillRect(fx + 1, y + 1, 25, 13);
      x.fillStyle = '#2e2632'; x.fillRect(fx + 1, y + 1, 25, 1);
      if (rnd() < 0.2) { x.fillStyle = '#120e14'; let cx = fx + R(4, 20), cy = y + 3; for (let k = 0; k < 6; k++) { x.fillRect(Math.floor(cx), Math.floor(cy), 1, 1); cx += R(-1, 2); cy += 1; } }
    }
  }
  // scattered old bones and skulls on the floor
  for (let i = 0; i < 18; i++) {
    let px = R(8, W - 8), py = R(64, H - 6);
    if (px > BX - 16 && px < BX + 8 * SQ_W + 16 && py < BY + 8 * SQ_H + 26) continue;
    x.fillStyle = '#6a6254'; x.fillRect(Math.floor(px), Math.floor(py), Math.floor(R(3, 7)), 1);
    x.fillStyle = '#4a4438'; x.fillRect(Math.floor(px), Math.floor(py) + 1, 2, 1);
  }
  // board frame (raised slab)
  const bw = 8 * SQ_W, bh = 8 * SQ_H, fr = 8;
  x.fillStyle = '#08060a'; x.fillRect(BX - fr - 2, BY - fr - 2, bw + fr * 2 + 4, bh + fr * 2 + 18);
  x.fillStyle = '#2a2026'; x.fillRect(BX - fr, BY - fr, bw + fr * 2, bh + fr * 2);
  x.fillStyle = '#3a2e36'; x.fillRect(BX - fr, BY - fr, bw + fr * 2, 2);
  x.fillStyle = '#1a1418'; x.fillRect(BX - fr, BY + bh + fr - 2, bw + fr * 2, 2);
  // front face of slab
  x.fillStyle = '#181216'; x.fillRect(BX - fr, BY + bh + fr, bw + fr * 2, 12);
  x.fillStyle = '#221a20';
  for (let i = BX - fr; i < BX + bw + fr; i += 12) x.fillRect(i, BY + bh + fr + 2, 10, 8);
  x.fillStyle = '#5a1018';
  for (let i = BX - fr + 6; i < BX + bw + fr; i += 24) { x.fillRect(i, BY + bh + fr + 4, 2, 4); }
  // gold inlay
  x.fillStyle = '#6a5020'; x.strokeStyle = '#6a5020';
  x.fillRect(BX - 3, BY - 3, bw + 6, 1); x.fillRect(BX - 3, BY + bh + 2, bw + 6, 1);
  x.fillRect(BX - 3, BY - 3, 1, bh + 6); x.fillRect(BX + bw + 2, BY - 3, 1, bh + 6);
  // squares
  for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) {
    const light = (r + f) % 2 === 0;
    const sx = BX + f * SQ_W, sy = BY + r * SQ_H;
    const base = light ? ['#b3a58c', '#a89a80', '#bcae96'] : ['#4e3c44', '#46363e', '#56444c'];
    x.fillStyle = base[0]; x.fillRect(sx, sy, SQ_W, SQ_H);
    for (let k = 0; k < 70; k++) { x.fillStyle = base[1 + (rnd() < 0.5 ? 0 : 1)]; x.fillRect(sx + Math.floor(R(1, SQ_W - 2)), sy + Math.floor(R(1, SQ_H - 2)), rnd() < 0.3 ? 2 : 1, 1); }
    x.fillStyle = light ? '#cfc3aa' : '#665058'; x.fillRect(sx, sy, SQ_W, 1); x.fillRect(sx, sy, 1, SQ_H);
    x.fillStyle = light ? '#7e725e' : '#2c2026'; x.fillRect(sx, sy + SQ_H - 1, SQ_W, 1); x.fillRect(sx + SQ_W - 1, sy, 1, SQ_H);
    if (rnd() < 0.35) { // crack
      x.fillStyle = light ? '#857860' : '#30242a';
      let cx = sx + R(4, SQ_W - 4), cy = sy + R(3, 8);
      for (let k = 0; k < 10; k++) { x.fillRect(Math.floor(cx), Math.floor(cy), 1, 1); cx += R(-1, 1.6); cy += R(0.3, 1.2); if (cy > sy + SQ_H - 2) break; }
    }
  }
  // coordinates
  for (let f = 0; f < 8; f++) FONT.draw(x, 'ABCDEFGH'[f], BX + f * SQ_W + SQ_W / 2, BY + bh + 1, { color: '#8a7040', shadow: null, align: 'center' });
  for (let r = 0; r < 8; r++) FONT.draw(x, String(8 - r), BX - 7, BY + r * SQ_H + 8, { color: '#8a7040', shadow: null, align: 'center' });
  // banners
  const banner = (bx, col, dark, trim) => {
    x.fillStyle = '#3a2a1a'; x.fillRect(bx - 12, 2, 26, 2);
    for (let y = 4; y < 46; y++) {
      const w = y > 40 ? 22 - (y - 40) * 3 : 22;
      x.fillStyle = col; x.fillRect(bx - Math.floor(w / 2), y, w, 1);
      x.fillStyle = dark; x.fillRect(bx + Math.floor(w / 2) - 3, y, 3, 1);
      x.fillStyle = trim; x.fillRect(bx - 11, y, 1, 1); x.fillRect(bx + 10, y, 1, 1);
    }
  };
  banner(34, '#2e56b4', '#1c3478', '#ffd24a');
  banner(446, '#7a1030', '#420818', '#ff3a2e');
  // emblems
  x.fillStyle = '#ffd24a'; x.fillRect(33, 12, 3, 20); x.fillRect(26, 18, 17, 3);
  x.fillStyle = '#e8e0cc'; x.fillRect(441, 14, 11, 9); x.fillRect(443, 23, 7, 3);
  x.fillStyle = '#140c14'; x.fillRect(443, 17, 3, 3); x.fillRect(448, 17, 3, 3); x.fillRect(446, 21, 1, 2); x.fillRect(444, 24, 1, 2); x.fillRect(446, 24, 1, 2); x.fillRect(448, 24, 1, 2);
  // torch sconces
  for (const tx of TORCHES) {
    x.fillStyle = '#0a080c'; x.fillRect(tx - 3, 24, 7, 8);
    x.fillStyle = '#4a3a2a'; x.fillRect(tx - 2, 24, 5, 3);
    x.fillStyle = '#6a5a4a'; x.fillRect(tx - 3, 22, 7, 2);
    x.fillStyle = '#2a1e14'; x.fillRect(tx - 1, 26, 3, 10);
  }
  // spiked skulls at the wall base
  for (const sx of [70, 410]) {
    x.fillStyle = '#3a3036'; x.fillRect(sx, 18, 1, 38);
    x.fillStyle = '#d8d0bc'; x.fillRect(sx - 3, 14, 7, 6); x.fillRect(sx - 2, 20, 5, 2);
    x.fillStyle = '#140c14'; x.fillRect(sx - 2, 16, 2, 2); x.fillRect(sx + 1, 16, 2, 2);
    x.fillStyle = '#5a0a14'; x.fillRect(sx, 22, 1, 8);
  }
  return c;
}
const TORCHES = [150, 330];
