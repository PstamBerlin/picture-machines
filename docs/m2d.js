// Picture Machines: the machines that make a picture. Each one takes a picture { w, h, d } and its
// settings and gives back { out, stats }. They run in the worker; env.canvas(w, h) makes a drawing
// surface and env.progress(0..1) tells the page how far along we are.
import { clamp, lerp, smooth, rng, pic, luma, blur, blurPlane, gradient, inkLines, palette, nearestMaker, resize, saturate, hex, rgb2lab, distance } from './lib.js?v=480fa59c';

const sizeOf = (p) => Math.max(p.w, p.h);
const hash = (x, y, s = 0) => { let n = (x * 374761393 + y * 668265263 + s * 2147483647) | 0; n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };
// how much of a pixel a halftone dot covers: a grid turned by `ang`, one dot per cell, bigger for more ink
function dot(x, y, ang, cell, amount) {
  if (amount <= 0.004) return 0;
  const c = Math.cos(ang), s = Math.sin(ang), u = (x * c + y * s) / cell, v = (-x * s + y * c) / cell;
  const du = u - Math.floor(u) - 0.5, dv = v - Math.floor(v) - 0.5, dist = Math.hypot(du, dv) * cell;
  const r = cell * 0.78 * Math.sqrt(Math.min(1, amount));
  return smooth(r + 0.8, r - 0.8, dist);
}
function frame(p, o, paper = [252, 250, 244]) {       // a comic panel: paper gutter and a black line
  const { w, h, d } = p, m = Math.round(sizeOf(p) * 0.022), ln = Math.max(2, Math.round(sizeOf(p) * 0.006));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const e = Math.min(x, y, w - 1 - x, h - 1 - y); if (e >= m + ln) continue;
    const i = (y * w + x) * 4, c = e < m ? paper : [22, 18, 26]; d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2];
  }
}

/* ------------------------------------------------------------------ paint
   Painterly rendering (Aaron Hertzmann, 1998): repaint the photo with curved brush strokes, big brushes
   first and smaller ones only where the painting still looks wrong. Each stroke runs ALONG the edges in
   the photo, the way a painter's brush follows the shape it paints. */
const BRUSHES = { chunky: [0.032, 0.015], normal: [0.026, 0.012, 0.0055], fine: [0.02, 0.009, 0.0045, 0.0024], ultrafine: [0.016, 0.0075, 0.0038, 0.002] };
export function paint(src, o, env) {
  const { w, h } = src, S = sizeOf(src), rnd = rng(o.seed), stats = [];
  const cv = env.canvas(w, h), g = cv.getContext('2d', { willReadFrequently: true });
  const ground = o.canvas ? [236, 226, 206] : [28, 24, 30];
  g.fillStyle = `rgb(${ground})`; g.fillRect(0, 0, w, h); g.lineCap = 'round'; g.lineJoin = 'round';
  const radii = BRUSHES[o.brush].map((f) => Math.max(1.3, f * S)), tol = 62 - o.detail * 0.42;
  radii.forEach((R, li) => {
    const ref = blur(src, R * 0.45), rd = ref.d, { gx, gy, mag } = gradient(luma(ref), w, h);
    const cd = g.getImageData(0, 0, w, h).data, grid = Math.max(2, Math.round(R)), strokes = [];
    for (let y0 = 0; y0 < h; y0 += grid) for (let x0 = 0; x0 < w; x0 += grid) {
      // where in this patch is the painting most wrong?
      let err = 0, n = 0, bx = x0, by = y0, be = -1;
      for (let y = y0; y < Math.min(h, y0 + grid); y += 2) for (let x = x0; x < Math.min(w, x0 + grid); x += 2) {
        const i = (y * w + x) * 4, e = Math.abs(cd[i] - rd[i]) + Math.abs(cd[i + 1] - rd[i + 1]) + Math.abs(cd[i + 2] - rd[i + 2]);
        err += e; n++; if (e > be) { be = e; bx = x; by = y; }
      }
      if (li > 0 && err / n < tol) continue;
      const i0 = (by * w + bx) * 4, jit = li === 0 ? 10 : 5;
      const col = [clamp(rd[i0] + (rnd() - 0.5) * jit * 2), clamp(rd[i0 + 1] + (rnd() - 0.5) * jit * 2), clamp(rd[i0 + 2] + (rnd() - 0.5) * jit * 2)];
      const pts = [[bx, by]], maxLen = li === 0 ? 14 : 9; let x = bx, y = by, dx = 0, dy = 0;
      for (let k = 0; k < maxLen; k++) {
        const i = (Math.round(y) * w + Math.round(x)), i4 = i * 4;
        if (k > 2) {                               // stop where the stroke's colour stops being the better one
          const dCanvas = Math.abs(rd[i4] - cd[i4]) + Math.abs(rd[i4 + 1] - cd[i4 + 1]) + Math.abs(rd[i4 + 2] - cd[i4 + 2]);
          const dStroke = Math.abs(rd[i4] - col[0]) + Math.abs(rd[i4 + 1] - col[1]) + Math.abs(rd[i4 + 2] - col[2]);
          if (dStroke > dCanvas) break;
        }
        let nx, ny;
        if (mag[i] < 0.02) { if (k === 0) { const a = hash(bx, by, o.seed) * 6.283; nx = Math.cos(a); ny = Math.sin(a); } else { nx = dx; ny = dy; } }
        else { nx = -gy[i]; ny = gx[i]; const l = Math.hypot(nx, ny); nx /= l; ny /= l; }
        if (dx * nx + dy * ny < 0) { nx = -nx; ny = -ny; }
        dx = dx * 0.4 + nx * 0.6; dy = dy * 0.4 + ny * 0.6; const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
        x += dx * R; y += dy * R; if (x < 0 || y < 0 || x > w - 1 || y > h - 1) break;
        pts.push([x, y]);
        if (mag[i] < 0.02 && k >= 1) break;        // flat colour: a short dab, not a long worm
      }
      strokes.push({ pts, col, wd: R * 2 * (0.8 + rnd() * 0.45) });
    }
    for (let i = strokes.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const t = strokes[i]; strokes[i] = strokes[j]; strokes[j] = t; }
    const path = (pts, ox, oy) => { g.beginPath(); g.moveTo(pts[0][0] + ox, pts[0][1] + oy); if (pts.length === 1) g.lineTo(pts[0][0] + ox + 0.01, pts[0][1] + oy); for (let k = 1; k < pts.length; k++) g.lineTo(pts[k][0] + ox, pts[k][1] + oy); g.stroke(); };
    for (const s of strokes) {
      g.globalAlpha = 0.96; g.lineWidth = s.wd; g.strokeStyle = `rgb(${s.col[0] | 0},${s.col[1] | 0},${s.col[2] | 0})`; path(s.pts, 0, 0);
      if (o.bristle && R > 2.6) {                 // bristle marks: a light and a dark hair along the stroke
        const a = s.pts.length > 1 ? Math.atan2(s.pts[1][1] - s.pts[0][1], s.pts[1][0] - s.pts[0][0]) + 1.5708 : 0, ox = Math.cos(a) * R * 0.42, oy = Math.sin(a) * R * 0.42;
        g.lineWidth = Math.max(0.7, R * 0.28);
        g.globalAlpha = 0.17; g.strokeStyle = '#fff'; path(s.pts, -ox, -oy);
        g.globalAlpha = 0.15; g.strokeStyle = '#1a1020'; path(s.pts, ox, oy);
      }
    }
    stats.push(`${strokes.length.toLocaleString('en')} strokes with the ${Math.round(R * 2)} px brush`);
    env.progress((li + 1) / (radii.length + 1));
  });
  g.globalAlpha = 1;
  const out = { w, h, d: g.getImageData(0, 0, w, h).data };
  if (o.canvas) {                                  // thick paint catches the light, and the linen shows through
    const H = blurPlane(luma(out), w, h, 0.8), d = out.d, wv = Math.max(2.2, S / 320);
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const i = y * w + x, lit = (H[i - w - 1] - H[i + w + 1]) * 150;
      const weave = (Math.sin(x * 6.283 / wv) + Math.sin(y * 6.283 / wv)) * 2.2 + (hash(x, y, 7) - 0.5) * 5;
      for (let c = 0; c < 3; c++) d[i * 4 + c] = clamp(d[i * 4 + c] + lit + weave);
    }
  }
  return { out, stats };
}

/* ------------------------------------------------------------------ comic
   Flat colours, black ink lines and printing dots. "Press" really separates the picture into the four
   printing inks (cyan, magenta, yellow, black) and prints each as its own screen of dots. */
const SCREEN = { c: 15, m: 75, y: 0, k: 45 };
export function comic(src, o, env) {
  const { w, h } = src, S = sizeOf(src), u = S / 1000, stats = [];
  const style = o.style, base = saturate(blur(src, 1.3 * u), style === 'manga' ? 0 : o.punch, 1.08), L = luma(src);
  const ncol = style === 'poster' ? Math.min(o.colors, 6) : o.colors;
  const pal = palette(base, ncol, 3, style === 'poster' ? 1.25 : 1.05), near = nearestMaker(pal);
  const lines = inkLines(L, w, h, { sigma: (0.7 + o.ink * 0.55) * u, eps: 0.006 + 0.004 * o.ink, phi: 70 });
  env.progress(0.35);
  const out = pic(w, h), d = out.d, b = base.d, cell = Math.max(3, o.dots * u * 5.5), rad = Math.PI / 180;
  const paper = style === 'manga' ? [250, 250, 248] : style === 'retro' ? [248, 240, 220] : [252, 250, 244];
  const slip = o.slip ? Math.max(1, Math.round(1.6 * u)) : 0, used = new Uint32Array(pal.length), plate = [0, 0, 0, 0];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const q = y * w + x, i = q * 4; let r, g, bl;
      if (style === 'press') {
        // the four plates, each read a hair off its place when the press slips
        const at = (dx, dy) => (Math.min(h - 1, Math.max(0, y + dy)) * w + Math.min(w - 1, Math.max(0, x + dx))) * 4;
        const ic = at(slip, 0), im = at(-slip, slip), iy = at(0, -slip);
        const C0 = 1 - b[ic] / 255, M0 = 1 - b[im + 1] / 255, Y0 = 1 - b[iy + 2] / 255, K0 = Math.min(1 - b[i] / 255, 1 - b[i + 1] / 255, 1 - b[i + 2] / 255) * 0.85;
        const C = clamp((C0 - K0) / (1 - K0 + 1e-6), 0, 1), M = clamp((M0 - K0) / (1 - K0 + 1e-6), 0, 1), Y = clamp((Y0 - K0) / (1 - K0 + 1e-6), 0, 1), K = K0 * K0;
        const cc = dot(x + slip, y, SCREEN.c * rad, cell, C), cm = dot(x - slip, y + slip, SCREEN.m * rad, cell, M), cy = dot(x, y - slip, SCREEN.y * rad, cell, Y), ck = dot(x, y, SCREEN.k * rad, cell, K);
        plate[0] += cc; plate[1] += cm; plate[2] += cy; plate[3] += ck;
        r = paper[0] * (1 - cc * 0.94) * (1 - cm * 0.12) * (1 - ck * 0.9); g = paper[1] * (1 - cc * 0.32) * (1 - cm * 0.9) * (1 - cy * 0.07) * (1 - ck * 0.9); bl = paper[2] * (1 - cc * 0.06) * (1 - cm * 0.42) * (1 - cy * 0.95) * (1 - ck * 0.88);
      } else if (style === 'manga') {
        const v = blurLum(L, q), tone = v < 0.2 ? 1 : v > 0.66 ? 0 : (0.66 - v) / 0.46 * 0.85;
        const cov = v < 0.2 ? 1 : dot(x, y, 45 * rad, cell * 0.8, tone);
        r = g = bl = lerp(paper[0], 26, cov);
      } else {
        const j = near(b[i], b[i + 1], b[i + 2]); used[j]++; const c = pal[j]; r = c[0]; g = c[1]; bl = c[2];
        if (style === 'retro') {                 // Ben-Day dots: the shadows are the same colour, printed again in dots
          const v = L[q], cov = dot(x, y, 45 * rad, cell, clamp((0.72 - v) * 1.5, 0, 0.9));
          r = lerp(lerp(paper[0], r, 0.9), r * 0.62, cov); g = lerp(lerp(paper[1], g, 0.9), g * 0.6, cov); bl = lerp(lerp(paper[2], bl, 0.9), bl * 0.66, cov);
        }
        if (style === 'poster' && L[q] < 0.2) { r = 24; g = 18; bl = 30; }
      }
      const ink = lines[q], dark = style === 'poster' ? Math.min(1, ink * 0.92) : ink;
      d[i] = r * dark + 20 * (1 - dark); d[i + 1] = g * dark + 16 * (1 - dark); d[i + 2] = bl * dark + 24 * (1 - dark); d[i + 3] = 255;
    }
    if ((y & 63) === 0) env.progress(0.35 + 0.6 * y / h);
  }
  if (o.frame) frame(out, o, paper);
  let inkPx = 0; for (let q = 0; q < lines.length; q++) if (lines[q] < 0.5) inkPx++;
  stats.push(`${inkPx.toLocaleString('en')} pixels of black ink`);
  if (style === 'press') stats.push('plates: ' + ['cyan', 'magenta', 'yellow', 'black'].map((n, k) => `${n} ${Math.round(plate[k] / (w * h) * 100)}%`).join(', '));
  else if (style !== 'manga') stats.push(`${pal.length} flat colours`);
  return { out, stats };
  function blurLum(Lp, q) { return Lp[q]; }
}

/* ------------------------------------------------------------------ pixel
   Big square pixels and only a handful of colours, like an old game. */
export const PALETTES = {
  gameboy: ['#0f380f', '#306230', '#8bac0f', '#9bbc0f'],
  pico: ['#000000', '#1D2B53', '#7E2553', '#008751', '#AB5236', '#5F574F', '#C2C3C7', '#FFF1E8', '#FF004D', '#FFA300', '#FFEC27', '#00E436', '#29ADFF', '#83769C', '#FF77A8', '#FFCCAA'],
  console: ['#000000', '#fcfcfc', '#f8f8f8', '#bcbcbc', '#7c7c7c', '#a4e4fc', '#3cbcfc', '#0078f8', '#0000fc', '#b8b8f8', '#6888fc', '#0058f8', '#d8b8f8', '#9878f8', '#6844fc', '#f8b8f8', '#f878f8', '#d800cc', '#f8a4c0', '#f85898', '#e40058', '#f0d0b0', '#f87858', '#f83800', '#fce0a8', '#fca044', '#e45c10', '#f8d878', '#f8b800', '#ac7c00', '#d8f878', '#b8f818', '#00b800', '#b8f8b8', '#58d854', '#00a800', '#b8f8d8', '#58f898', '#00a844', '#00fcfc', '#00e8d8', '#008888'],
  press: ['#ffffff', '#00b7eb', '#ff2e97', '#ffe600', '#141414', '#7b2bd9', '#ff5a2a', '#17b26a'],
  mono: ['#16121c', '#4b4458', '#a59fb2', '#f4f1f8'],
};
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
export function pixel(src, o, env) {
  const cols = Math.round(o.size), rows = Math.max(1, Math.round(cols * src.h / src.w));
  const small = saturate(resize(src, cols, rows), 1.12, 1.06);
  const pal = o.palette === 'auto' ? palette(small, o.colors, 5, 1.1) : PALETTES[o.palette].map(hex), near = nearestMaker(pal);
  const idx = new Uint16Array(cols * rows), f = new Float32Array(cols * rows * 3), s = small.d, used = new Set();
  for (let q = 0; q < cols * rows; q++) { f[q * 3] = s[q * 4]; f[q * 3 + 1] = s[q * 4 + 1]; f[q * 3 + 2] = s[q * 4 + 2]; }
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    const q = y * cols + x; let r = f[q * 3], g = f[q * 3 + 1], b = f[q * 3 + 2];
    if (o.dither === 'pattern') { const t = (BAYER[(y & 3) * 4 + (x & 3)] / 16 - 0.47) * 46; r += t; g += t; b += t; }
    const j = near(clamp(r) | 0, clamp(g) | 0, clamp(b) | 0); idx[q] = j; used.add(j);
    if (o.dither === 'smooth') {                 // Floyd-Steinberg: push the mistake onto the neighbours
      const e = [r - pal[j][0], g - pal[j][1], b - pal[j][2]];
      const give = (xx, yy, k) => { if (xx < 0 || xx >= cols || yy >= rows) return; const t = (yy * cols + xx) * 3; f[t] += e[0] * k; f[t + 1] += e[1] * k; f[t + 2] += e[2] * k; };
      give(x + 1, y, 7 / 16); give(x - 1, y + 1, 3 / 16); give(x, y + 1, 5 / 16); give(x + 1, y + 1, 1 / 16);
    }
  }
  const k = Math.max(2, Math.floor(Math.max(src.w, src.h) / Math.max(cols, rows))), w = cols * k, h = rows * k, out = pic(w, h), d = out.d;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const c = pal[idx[Math.floor(y / k) * cols + Math.floor(x / k)]], i = (y * w + x) * 4, edge = o.grid && k >= 5 && (x % k === k - 1 || y % k === k - 1) ? 0.8 : 1;
    d[i] = c[0] * edge; d[i + 1] = c[1] * edge; d[i + 2] = c[2] * edge; d[i + 3] = 255;
  }
  env.progress(1);
  return { out, stats: [`${cols} × ${rows} pixels`, `${used.size} colours used`] };
}

/* ------------------------------------------------------------------ sketch
   A pencil drawing: the photo divided by a blurred copy of its own negative leaves only the edges and the
   soft shading; then the pencil's hatching is laid over the dark parts. */
export function sketch(src, o, env) {
  const { w, h } = src, S = sizeOf(src), u = S / 1000, L = luma(src), out = pic(w, h), d = out.d, s = src.d;
  const paper = [247, 243, 232];
  if (o.style === 'ink') {
    const lines = inkLines(L, w, h, { sigma: (0.8 + o.weight * 0.5) * u, eps: 0.008, phi: 80 }), soft = blurPlane(L, w, h, 2 * u), gap = Math.max(4, 7 * u);
    const hatch = (x, y, ang, wob) => { const t = (x * Math.cos(ang) + y * Math.sin(ang) + Math.sin((x * Math.sin(ang) - y * Math.cos(ang)) / (40 * u)) * wob) / gap; return Math.abs(t - Math.floor(t) - 0.5) < 0.13 * o.weight + 0.05; };
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const q = y * w + x, dk = 1 - soft[q] + (o.dark - 50) / 120;
      let ink = lines[q] < 0.5;
      if (dk > 0.38 && hatch(x, y, 0.79, 1.5)) ink = true;
      if (dk > 0.58 && hatch(x, y, -0.79, 1.2)) ink = true;
      if (dk > 0.76 && hatch(x, y, 0.15, 1)) ink = true;
      if (dk > 0.9) ink = true;
      const i = q * 4, g = (hash(x, y, 3) - 0.5) * 6;
      d[i] = ink ? 28 : paper[0] + g; d[i + 1] = ink ? 24 : paper[1] + g; d[i + 2] = ink ? 40 : paper[2] + g; d[i + 3] = 255;
    }
    return { out, stats: ['ink lines and three layers of hatching'] };
  }
  const inv = new Float32Array(w * h); for (let q = 0; q < inv.length; q++) inv[q] = 1 - L[q];
  const soft = blurPlane(inv, w, h, S / (70 + (100 - o.detail) * 1.6)), colour = o.style === 'colour';
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const q = y * w + x, i = q * 4;
      const lineDraw = 1 - Math.min(1, L[q] / (1 - soft[q] + 0.02));           // colour dodge: what is left are the lines
      const shade = Math.pow(1 - L[q], 1.35);                                  // and the pencil shades the dark parts
      const grain = 0.5 + 0.5 * Math.sin((x + y) * (1.9 / u) + hash(x >> 1, y >> 1, 5) * 5) * (0.6 + 0.4 * hash(x, y, 9));
      let lead = lineDraw * 3.2 * o.weight + shade * (0.25 + o.dark / 90) * (0.55 + 0.75 * grain); lead = clamp(lead, 0, 1);
      const pg = (hash(x, y, 2) - 0.5) * 7;
      if (colour) {
        const a = (s[i] + s[i + 1] + s[i + 2]) / 3;
        for (let c = 0; c < 3; c++) { const pc = clamp(a + (s[i + c] - a) * 1.5) * 0.8; d[i + c] = clamp(lerp(paper[c], pc, lead * 1.15) + pg); }
      } else { d[i] = clamp(lerp(paper[0], 52, lead) + pg); d[i + 1] = clamp(lerp(paper[1], 50, lead) + pg); d[i + 2] = clamp(lerp(paper[2], 62, lead) + pg); }
      d[i + 3] = 255;
    }
    if ((y & 127) === 0) env.progress(y / h);
  }
  return { out, stats: [colour ? 'coloured pencils on cream paper' : 'graphite pencil on cream paper'] };
}

/* ------------------------------------------------------------------ stained glass
   The picture is cut into pieces of glass (every pixel belongs to the nearest of many scattered points),
   each piece gets one colour, and dark lead runs between them. */
export function glass(src, o, env) {
  const { w, h } = src, S = sizeOf(src), cell = Math.max(6, S / o.pieces), gw = Math.ceil(w / cell) + 1, gh = Math.ceil(h / cell) + 1, rnd = rng(o.seed);
  const edges = gradient(blurPlane(luma(src), w, h, cell * 0.12), w, h).mag;
  const sx = new Float32Array(gw * gh), sy = new Float32Array(gw * gh);
  for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
    // a point somewhere in its square; with "follow the picture" it picks the calmest of a few spots, so cuts land on edges
    let bx = 0, by = 0, be = 1e9;
    for (let t = 0; t < (o.follow ? 6 : 1); t++) { const x = (i + 0.1 + rnd() * 0.8) * cell, y = (j + 0.1 + rnd() * 0.8) * cell, e = edges[clamp(Math.round(y), 0, h - 1) * w + clamp(Math.round(x), 0, w - 1)]; if (e < be) { be = e; bx = x; by = y; } }
    sx[j * gw + i] = bx; sy[j * gw + i] = by;
  }
  const id = new Int32Array(w * h), d2 = new Float32Array(w * h), n = gw * gh, sum = new Float64Array(n * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const ci = Math.floor(x / cell), cj = Math.floor(y / cell); let best = 1e12, second = 1e12, bid = 0;
    for (let j = Math.max(0, cj - 2); j <= Math.min(gh - 1, cj + 2); j++) for (let i = Math.max(0, ci - 2); i <= Math.min(gw - 1, ci + 2); i++) {
      const k = j * gw + i, dd = (x - sx[k]) ** 2 + (y - sy[k]) ** 2;
      if (dd < best) { second = best; best = dd; bid = k; } else if (dd < second) second = dd;
    }
    const q = y * w + x; id[q] = bid; d2[q] = Math.sqrt(second) - Math.sqrt(best);   // 0 on a cut line, growing into the piece
    const i4 = q * 4, t = bid * 4; sum[t] += src.d[i4]; sum[t + 1] += src.d[i4 + 1]; sum[t + 2] += src.d[i4 + 2]; sum[t + 3]++;
  }
  env.progress(0.6);
  const out = pic(w, h), d = out.d, lead = Math.max(1.2, o.lead * S / 700), tint = new Float32Array(n);
  for (let k = 0; k < n; k++) tint[k] = 0.9 + hash(k, 11, o.seed) * 0.22;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const q = y * w + x, k = id[q], t = k * 4, c = sum[t + 3] || 1, i = q * 4;
    let r = sum[t] / c, g = sum[t + 1] / c, b = sum[t + 2] / c; const a = (r + g + b) / 3;
    const sat = o.glow / 50, light = tint[k] * (1 + ((sx[k] - x) + (sy[k] - y)) / cell * 0.1) * (0.82 + 0.18 * smooth(0, cell * 0.35, d2[q]));
    r = clamp((a + (r - a) * (1 + sat)) * light + 8); g = clamp((a + (g - a) * (1 + sat)) * light + 8); b = clamp((a + (b - a) * (1 + sat)) * light + 8);
    const ld = smooth(lead, lead * 0.45, d2[q] * 0.5), shine = smooth(lead * 1.6, lead, d2[q] * 0.5) * (1 - ld) * 26;
    d[i] = lerp(r + shine, 26, ld); d[i + 1] = lerp(g + shine, 22, ld); d[i + 2] = lerp(b + shine, 34, ld); d[i + 3] = 255;
  }
  const m = Math.round(lead * 2.2);   // the lead frame round the window
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (Math.min(x, y, w - 1 - x, h - 1 - y) < m) { const i = (y * w + x) * 4; d[i] = 26; d[i + 1] = 22; d[i + 2] = 34; }
  let pieces = 0; for (let k = 0; k < n; k++) if (sum[k * 4 + 3] > 0) pieces++;
  return { out, stats: [`${pieces.toLocaleString('en')} pieces of glass`] };
}

/* ------------------------------------------------------------------ bricks
   The picture built from toy bricks, seen from above: one stud per pixel, in real brick colours. */
export const BRICKS = [['White', '#F4F4F4'], ['Light grey', '#A0A5A9'], ['Dark grey', '#6C6E68'], ['Black', '#1B2A34'], ['Red', '#C91A09'], ['Dark red', '#720E0F'], ['Orange', '#FE8A18'], ['Yellow', '#F2CD37'], ['Bright light yellow', '#FFF03A'], ['Lime', '#BBE90B'], ['Green', '#237841'], ['Bright green', '#4B9F4A'], ['Dark green', '#184632'], ['Blue', '#0055BF'], ['Medium blue', '#5A93DB'], ['Light blue', '#B4D2E3'], ['Dark blue', '#0A3463'], ['Azure', '#36AEBF'], ['Purple', '#81007B'], ['Lavender', '#E1D5ED'], ['Pink', '#E4ADC8'], ['Magenta', '#923978'], ['Tan', '#E4CD9E'], ['Dark tan', '#958A73'], ['Brown', '#582A12'], ['Nougat', '#D09168'], ['Light nougat', '#F6D7B3'], ['Dark orange', '#A95500'], ['Sand blue', '#6074A1'], ['Olive', '#9B9A5A']];
export function bricks(src, o, env) {
  const cols = Math.round(o.size), rows = Math.max(1, Math.round(cols * src.h / src.w)), small = saturate(resize(src, cols, rows), 1.18, 1.08);
  const pal = BRICKS.map((b) => hex(b[1])), near = nearestMaker(pal), idx = new Uint8Array(cols * rows), count = new Uint32Array(pal.length);
  for (let q = 0; q < cols * rows; q++) { const j = near(small.d[q * 4], small.d[q * 4 + 1], small.d[q * 4 + 2]); idx[q] = j; count[j]++; }
  const k = Math.max(6, Math.floor(Math.max(src.w, src.h) / Math.max(cols, rows))), w = cols * k, h = rows * k, out = pic(w, h), d = out.d, R = k * 0.31;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = pal[idx[Math.floor(y / k) * cols + Math.floor(x / k)]], lx = x % k, ly = y % k, dx = lx - k / 2 + 0.5, dy = ly - k / 2 + 0.5, dist = Math.hypot(dx, dy);
      let f = 1;
      if (lx === 0 || ly === 0) f = 1.12; else if (lx === k - 1 || ly === k - 1) f = 0.76;                 // the brick's own edges
      const stud = smooth(R + 0.7, R - 0.7, dist);
      if (stud > 0) f = lerp(f, 1.06 - (dx + dy) / (R * 2) * 0.2, stud);                                    // the stud: lit from the top left
      else { const sh = smooth(R + k * 0.16, R, Math.hypot(dx - k * 0.07, dy - k * 0.07)); f *= 1 - sh * 0.2; }   // and its shadow
      const i = (y * w + x) * 4; d[i] = clamp(c[0] * f); d[i + 1] = clamp(c[1] * f); d[i + 2] = clamp(c[2] * f); d[i + 3] = 255;
    }
    if ((y & 127) === 0) env.progress(y / h);
  }
  const list = [...count].map((n, j) => [n, BRICKS[j][0]]).filter((e) => e[0]).sort((a, b) => b[0] - a[0]);
  return { out, stats: [`${(cols * rows).toLocaleString('en')} bricks, ${cols} × ${rows} studs`, `${(cols * 0.8).toFixed(1)} × ${(rows * 0.8).toFixed(1)} cm when built`, `${list.length} colours: ` + list.slice(0, 6).map((e) => `${e[1]} ×${e[0]}`).join(', ') + (list.length > 6 ? ', …' : '')], parts: list };
}

/* ------------------------------------------------------------------ poster print
   Two or three spot inks on paper, like a risograph: the machine works out how much of each ink every
   spot needs, prints each ink as its own gritty layer, and never lines them up perfectly. */
export const INKS = {
  sunset: [['Bright red', '#F15060'], ['Blue', '#0078BF']],
  candy: [['Fluorescent pink', '#FF48B0'], ['Teal', '#00838A']],
  trio: [['Yellow', '#FFE800'], ['Fluorescent pink', '#FF48B0'], ['Blue', '#0078BF']],
  noir: [['Orange', '#FF6C2F'], ['Black', '#1D1D1B']],
  forest: [['Sunflower', '#FFB511'], ['Green', '#00A95C'], ['Purple', '#765BA7']],
};
export function poster(src, o, env) {
  const { w, h } = src, S = sizeOf(src), u = S / 1000, inks = INKS[o.inks].map((e) => hex(e[1])), n = inks.length;
  const A = inks.map((c) => [1 - c[0] / 255, 1 - c[1] / 255, 1 - c[2] / 255]), AA = A.map((a) => a[0] * a[0] + a[1] * a[1] + a[2] * a[2]);
  const base = saturate(blur(src, 0.8 * u), 1.15, 1.12).d, amt = Array.from({ length: n }, () => new Float32Array(w * h)), a = new Float32Array(n);
  for (let q = 0; q < w * h; q++) {
    const T = [1 - base[q * 4] / 255, 1 - base[q * 4 + 1] / 255, 1 - base[q * 4 + 2] / 255]; a.fill(0);
    for (let it = 0; it < 6; it++) for (let k = 0; k < n; k++) {    // how much of each ink gets closest to this colour
      let r0 = T[0], r1 = T[1], r2 = T[2];
      for (let m = 0; m < n; m++) if (m !== k) { r0 -= a[m] * A[m][0]; r1 -= a[m] * A[m][1]; r2 -= a[m] * A[m][2]; }
      a[k] = clamp((r0 * A[k][0] + r1 * A[k][1] + r2 * A[k][2]) / AA[k], 0, 1);
    }
    for (let k = 0; k < n; k++) amt[k][q] = a[k];
  }
  env.progress(0.5);
  const out = pic(w, h), d = out.d, paper = [246, 240, 226], slip = Math.round(o.slip * u * 1.4), cell = Math.max(2.5, o.grain * u * 1.1), cover = new Float64Array(n);
  const offs = [[slip, 0], [-slip, slip], [0, -slip]];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4, pg = (hash(x, y, 1) - 0.5) * 9; let r = paper[0] + pg, g = paper[1] + pg, b = paper[2] + pg;
    for (let k = 0; k < n; k++) {
      const xx = clamp(x + offs[k][0], 0, w - 1), yy = clamp(y + offs[k][1], 0, h - 1), v = Math.pow(amt[k][yy * w + xx], 0.85);
      // gritty ink: dots where there is little, nearly solid where there is a lot, with holes that never print
      const cov = o.screen === 'dots' ? dot(x + offs[k][0], y + offs[k][1], (22 + k * 31) * Math.PI / 180, cell * 2.2, v) : smooth(0.08, -0.08, hash(Math.floor(xx / cell * 1.6), Math.floor(yy / cell * 1.6), 20 + k) * 0.94 + 0.03 - v);
      const c = cov * (0.9 + hash(xx, yy, 40 + k) * 0.1); cover[k] += c;
      r *= 1 - c * A[k][0]; g *= 1 - c * A[k][1]; b *= 1 - c * A[k][2];
    }
    d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255;
  }
  return { out, stats: INKS[o.inks].map((e, k) => `${e[0]}: ${Math.round(cover[k] / (w * h) * 100)}% of the sheet`) };
}
