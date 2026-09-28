// 5x7 bitmap font, proportional spacing, cached renders.
const FONT = (() => {
  const G = {
    A: '.###.|#...#|#...#|#####|#...#|#...#|#...#', B: '####.|#...#|#...#|####.|#...#|#...#|####.',
    C: '.###.|#...#|#....|#....|#....|#...#|.###.', D: '####.|#...#|#...#|#...#|#...#|#...#|####.',
    E: '#####|#....|#....|####.|#....|#....|#####', F: '#####|#....|#....|####.|#....|#....|#....',
    G: '.###.|#...#|#....|#.###|#...#|#...#|.####', H: '#...#|#...#|#...#|#####|#...#|#...#|#...#',
    I: '###|.#.|.#.|.#.|.#.|.#.|###', J: '..###|...#.|...#.|...#.|...#.|#..#.|.##..',
    K: '#...#|#..#.|#.#..|##...|#.#..|#..#.|#...#', L: '#....|#....|#....|#....|#....|#....|#####',
    M: '#...#|##.##|#.#.#|#.#.#|#...#|#...#|#...#', N: '#...#|#...#|##..#|#.#.#|#..##|#...#|#...#',
    O: '.###.|#...#|#...#|#...#|#...#|#...#|.###.', P: '####.|#...#|#...#|####.|#....|#....|#....',
    Q: '.###.|#...#|#...#|#...#|#.#.#|#..#.|.##.#', R: '####.|#...#|#...#|####.|#.#..|#..#.|#...#',
    S: '.####|#....|#....|.###.|....#|....#|####.', T: '#####|..#..|..#..|..#..|..#..|..#..|..#..',
    U: '#...#|#...#|#...#|#...#|#...#|#...#|.###.', V: '#...#|#...#|#...#|#...#|#...#|.#.#.|..#..',
    W: '#...#|#...#|#...#|#.#.#|#.#.#|#.#.#|.#.#.', X: '#...#|#...#|.#.#.|..#..|.#.#.|#...#|#...#',
    Y: '#...#|#...#|.#.#.|..#..|..#..|..#..|..#..', Z: '#####|....#|...#.|..#..|.#...|#....|#####',
    0: '.###.|#...#|#..##|#.#.#|##..#|#...#|.###.', 1: '.#.|##.|.#.|.#.|.#.|.#.|###',
    2: '.###.|#...#|....#|...#.|..#..|.#...|#####', 3: '####.|....#|....#|.###.|....#|....#|####.',
    4: '...#.|..##.|.#.#.|#..#.|#####|...#.|...#.', 5: '#####|#....|####.|....#|....#|#...#|.###.',
    6: '.###.|#....|#....|####.|#...#|#...#|.###.', 7: '#####|....#|...#.|..#..|.#...|.#...|.#...',
    8: '.###.|#...#|#...#|.###.|#...#|#...#|.###.', 9: '.###.|#...#|#...#|.####|....#|....#|.###.',
    '.': '.|.|.|.|.|#|#', ',': '..|..|..|..|.#|.#|#.', '!': '#|#|#|#|#|.|#', '?': '.###.|#...#|....#|...#.|..#..|.....|..#..',
    ':': '.|#|#|.|#|#|.', '-': '....|....|....|####|....|....|....', '+': '.....|..#..|..#..|#####|..#..|..#..|.....',
    '/': '....#|...#.|...#.|..#..|.#...|.#...|#....', '(': '..#|.#.|#..|#..|#..|.#.|..#', ')': '#..|.#.|..#|..#|..#|.#.|#..',
    '#': '.#.#.|.#.#.|#####|.#.#.|#####|.#.#.|.#.#.', "'": '#|#|.|.|.|.|.', '=': '....|....|####|....|####|....|....',
    '>': '#...|.#..|..#.|...#|..#.|.#..|#...', '<': '...#|..#.|.#..|#...|.#..|..#.|...#', '*': '.....|#.#.#|.###.|#####|.###.|#.#.#|.....',
    '[': '##|#.|#.|#.|#.|#.|##', ']': '##|.#|.#|.#|.#|.#|##', '_': '.....|.....|.....|.....|.....|.....|#####',
  };
  const glyphs = {};
  for (const k in G) {
    const rows = G[k].split('|');
    glyphs[k] = { w: rows[0].length, rows };
  }
  const cache = new Map();

  function measure(str) {
    let w = 0;
    for (const ch of str.toUpperCase()) w += ch === ' ' ? 3 : (glyphs[ch] ? glyphs[ch].w + 1 : 4);
    return Math.max(0, w - 1);
  }

  function render(str, color, shadow) {
    const key = str + '|' + color + '|' + shadow;
    let c = cache.get(key);
    if (c) return c;
    const s = str.toUpperCase();
    const w = measure(s) + 2, h = 9;
    c = document.createElement('canvas');
    c.width = w; c.height = h;
    const x = c.getContext('2d');
    const paint = (ox, oy, col) => {
      x.fillStyle = col;
      let cx = ox;
      for (const ch of s) {
        if (ch === ' ') { cx += 3; continue; }
        const g = glyphs[ch];
        if (!g) { cx += 4; continue; }
        for (let r = 0; r < 7; r++) for (let q = 0; q < g.w; q++) if (g.rows[r][q] === '#') x.fillRect(cx + q, oy + r, 1, 1);
        cx += g.w + 1;
      }
    };
    if (shadow) { paint(1, 1, shadow); paint(2, 1, shadow); paint(1, 2, shadow); paint(2, 2, shadow); }
    paint(0, 0, color);
    if (cache.size > 600) cache.clear();
    cache.set(key, c);
    return c;
  }

  // draw(ctx, text, x, y, {color, scale, align, shadow})
  function draw(ctx, str, x, y, o = {}) {
    const scale = o.scale || 1;
    const c = render(String(str), o.color || '#fff', o.shadow === undefined ? '#000' : o.shadow);
    let dx = x;
    const w = (c.width - 2) * scale;
    if (o.align === 'center') dx = x - w / 2;
    else if (o.align === 'right') dx = x - w;
    ctx.drawImage(c, Math.round(dx), Math.round(y), c.width * scale, c.height * scale);
    return w;
  }

  // Big dripping-blood headline text.
  const dripCache = new Map();
  function bloodTitle(ctx, str, x, y, scale, time, seed = 1) {
    const s = str.toUpperCase();
    const w = measure(s) * scale;
    const ox = Math.round(x - w / 2), oy = Math.round(y);
    // rows get darker toward the bottom
    const rowCols = ['#ff5a4a', '#f02a2a', '#d81a22', '#c0121c', '#a80c18', '#900a14', '#780810'];
    let cx = ox;
    const bottoms = [];
    // outline
    ctx.fillStyle = '#100204';
    for (const pass of [0, 1]) {
      cx = ox;
      for (const ch of s) {
        if (ch === ' ') { cx += 3 * scale; continue; }
        const g = glyphs[ch]; if (!g) { cx += 4 * scale; continue; }
        for (let r = 0; r < 7; r++) for (let q = 0; q < g.w; q++) {
          if (g.rows[r][q] !== '#') continue;
          if (pass === 0) ctx.fillRect(cx + q * scale - 1, oy + r * scale - 1, scale + 2, scale + 3);
          else {
            ctx.fillStyle = rowCols[r];
            ctx.fillRect(cx + q * scale, oy + r * scale, scale, scale);
            if (r === 0 || g.rows[r - 1][q] !== '#') { ctx.fillStyle = '#ff9a8a'; ctx.fillRect(cx + q * scale, oy + r * scale, scale, 1); }
            let lowest = true;
            for (let rr = r + 1; rr < 7; rr++) if (g.rows[rr][q] === '#') lowest = false;
            if (lowest) bottoms.push([cx + q * scale, oy + (r + 1) * scale]);
          }
        }
        cx += (g.w + 1) * scale;
      }
    }
    // drips
    const key = s + scale + seed;
    let drips = dripCache.get(key);
    if (!drips) {
      let rnd = seed * 9301 + 49297;
      const rand = () => ((rnd = (rnd * 9301 + 49297) % 233280) / 233280);
      drips = bottoms.filter(() => rand() < 0.28).map(([bx, by]) => ({
        bx: bx - ox + Math.floor(rand() * scale), by: by - oy, len: 3 + rand() * scale * 5, speed: 0.15 + rand() * 0.5, ph: rand() * 10,
      }));
      dripCache.set(key, drips);
    }
    for (const d of drips) {
      const k = ((time * d.speed + d.ph) % 3) / 3;
      const L = Math.floor(d.len * Math.min(1, k * 1.6));
      const px = ox + d.bx, py = oy + d.by;
      ctx.fillStyle = '#100204'; ctx.fillRect(px - 1, py, 3, L + 2);
      ctx.fillStyle = '#8a0a14'; ctx.fillRect(px, py, 1, L);
      ctx.fillStyle = '#b0101c'; ctx.fillRect(px - (L > 3 ? 1 : 0), py + L - 1, L > 3 ? 2 : 1, 2);
      if (k > 0.62) { // falling droplet
        const fy = py + d.len + (k - 0.62) * 120;
        ctx.fillStyle = '#b0101c'; ctx.fillRect(px, Math.round(fy), 1, 2);
      }
    }
    return w;
  }

  return { draw, measure, bloodTitle };
})();
