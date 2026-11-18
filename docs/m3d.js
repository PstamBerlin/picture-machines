// Picture Machines: the machines that make something you can 3D print. Each one turns the picture into
// a grid of little columns (how tall the plastic is at every spot), and one mesh builder turns any such
// grid into a watertight STL file. They give back { out (a preview picture), stats, stl, file }.
import { clamp, lerp, smooth, pic, luma, blurPlane, resize, flatten, rgb2lab, distance } from './lib.js?v=480fa59c';

/* ---- the mesh builder -------------------------------------------------------------------------
   nx × ny cells of `res` mm. inside[q] says whether a cell is plastic, H[q] how tall it is (mm).
   The top is a smooth surface through the cells' corners, the bottom is flat on the print bed, and a
   wall closes every edge where plastic meets air. Row 0 of the picture is the far edge of the model,
   so the print is not mirrored. */
export function solid(nx, ny, res, inside, H) {
  const vx = nx + 1, V = new Float32Array(vx * (ny + 1));
  for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) {       // a corner is as tall as the plastic cells around it, on average
    let s = 0, n = 0;
    for (let dj = -1; dj <= 0; dj++) for (let di = -1; di <= 0; di++) { const a = i + di, b = j + dj; if (a >= 0 && b >= 0 && a < nx && b < ny && inside[b * nx + a]) { s += H[b * nx + a]; n++; } }
    V[j * vx + i] = n ? s / n : 0;
  }
  const at = (i, j) => (i >= 0 && j >= 0 && i < nx && j < ny && inside[j * nx + i]) ? 1 : 0;
  let tris = 0, cells = 0;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) if (inside[j * nx + i]) { cells++; tris += 4 + 2 * ((at(i - 1, j) ? 0 : 1) + (at(i + 1, j) ? 0 : 1) + (at(i, j - 1) ? 0 : 1) + (at(i, j + 1) ? 0 : 1)); }
  const buf = new ArrayBuffer(84 + tris * 50), dv = new DataView(buf); let o = 84, vol = 0;
  'Picture Machines by Peter Stam'.split('').forEach((c, k) => dv.setUint8(k, c.charCodeAt(0)));
  dv.setUint32(80, tris, true);
  const X = (i) => i * res, Y = (j) => (ny - j) * res;
  const tri = (ax, ay, az, bx, by, bz, cx, cy, cz) => {
    const ux = bx - ax, uy = by - ay, uz = bz - az, wx = cx - ax, wy = cy - ay, wz = cz - az;
    let nxn = uy * wz - uz * wy, nyn = uz * wx - ux * wz, nzn = ux * wy - uy * wx; const l = Math.hypot(nxn, nyn, nzn) || 1;
    dv.setFloat32(o, nxn / l, true); dv.setFloat32(o + 4, nyn / l, true); dv.setFloat32(o + 8, nzn / l, true);
    dv.setFloat32(o + 12, ax, true); dv.setFloat32(o + 16, ay, true); dv.setFloat32(o + 20, az, true);
    dv.setFloat32(o + 24, bx, true); dv.setFloat32(o + 28, by, true); dv.setFloat32(o + 32, bz, true);
    dv.setFloat32(o + 36, cx, true); dv.setFloat32(o + 40, cy, true); dv.setFloat32(o + 44, cz, true); o += 50;
  };
  const quad = (a, b, c, d) => { tri(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]); tri(a[0], a[1], a[2], c[0], c[1], c[2], d[0], d[1], d[2]); };
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      if (!inside[j * nx + i]) continue;
      // the bottom (cell by cell, so every edge meets exactly one other: a watertight solid, no repairs needed in the slicer)
      quad([X(i), Y(j), 0], [X(i), Y(j + 1), 0], [X(i + 1), Y(j + 1), 0], [X(i + 1), Y(j), 0]);
      const z00 = V[j * vx + i], z10 = V[j * vx + i + 1], z01 = V[(j + 1) * vx + i], z11 = V[(j + 1) * vx + i + 1];
      quad([X(i), Y(j), z00], [X(i + 1), Y(j), z10], [X(i + 1), Y(j + 1), z11], [X(i), Y(j + 1), z01]);                                   // the top
      vol += (z00 + z10 + z01 + z11) / 4 * res * res;
      if (!at(i, j - 1)) quad([X(i), Y(j), 0], [X(i + 1), Y(j), 0], [X(i + 1), Y(j), z10], [X(i), Y(j), z00]);
      if (!at(i, j + 1)) quad([X(i + 1), Y(j + 1), 0], [X(i), Y(j + 1), 0], [X(i), Y(j + 1), z01], [X(i + 1), Y(j + 1), z11]);
      if (!at(i - 1, j)) quad([X(i), Y(j + 1), 0], [X(i), Y(j), 0], [X(i), Y(j), z00], [X(i), Y(j + 1), z01]);
      if (!at(i + 1, j)) quad([X(i + 1), Y(j), 0], [X(i + 1), Y(j + 1), 0], [X(i + 1), Y(j + 1), z11], [X(i + 1), Y(j), z10]);
    }
  }
  return { stl: buf, tris, cells, grams: vol / 1000 * 1.25 };
}

// how the print will look lying on the bed, lit from the top left; tone(q) gives each cell its plastic colour
function render(nx, ny, inside, H, tone, top) {
  const out = pic(nx, ny), d = out.d, h = (i, j) => (i >= 0 && j >= 0 && i < nx && j < ny && inside[j * nx + i]) ? H[j * nx + i] : 0;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const q = j * nx + i, k = q * 4;
    if (!inside[q]) {                     // the print bed: dark, with a faint grid and the model's shadow
      const sh = Math.min(1, (h(i - 2, j - 2) + h(i - 4, j - 4)) / (top * 2)) * 0.5, grid = (i % 40 === 0 || j % 40 === 0) ? 10 : 0;
      d[k] = (17 + grid) * (1 - sh); d[k + 1] = (22 + grid) * (1 - sh); d[k + 2] = (44 + grid) * (1 - sh); d[k + 3] = 255; continue;
    }
    const gx = h(i + 1, j) - h(i - 1, j), gy = h(i, j + 1) - h(i, j - 1), lit = clamp(0.86 + (gx + gy) * -0.42 + (H[q] / top) * 0.16, 0.35, 1.25), c = tone(q);
    d[k] = clamp(c[0] * lit); d[k + 1] = clamp(c[1] * lit); d[k + 2] = clamp(c[2] * lit); d[k + 3] = 255;
  }
  return out;
}
// the shape a flat part is cut to: is this spot (in mm, from the middle) inside it?
function shapeTest(shape, wmm, hmm) {
  const hw = wmm / 2, hh = hmm / 2, r = Math.min(hw, hh);
  if (shape === 'circle') return (x, y) => x * x + y * y <= r * r;
  if (shape === 'hex') return (x, y) => { const ax = Math.abs(x), ay = Math.abs(y); return ax <= r * 0.866 && ay <= r - ax * 0.5774; };
  const cr = shape === 'rounded' ? Math.min(hw, hh) * 0.22 : 0;
  return (x, y) => { const qx = Math.abs(x) - (hw - cr), qy = Math.abs(y) - (hh - cr); return qx <= 0 || qy <= 0 ? Math.abs(x) <= hw && Math.abs(y) <= hh : qx * qx + qy * qy <= cr * cr; };
}
// the thing in the picture, cut out from its background: 1 = thing, 0 = background
export function subject(src, sense, soften) {
  const { w, h, d } = src, n = w * h, m = new Uint8Array(n);
  let clear = 0; for (let q = 0; q < n; q++) if (d[q * 4 + 3] < 128) clear++;
  if (clear > n * 0.02) { for (let q = 0; q < n; q++) m[q] = d[q * 4 + 3] >= 128 ? 1 : 0; }
  else {
    // the background is whatever the picture's edge looks like. Everything that does not look like it is "something";
    // further down the biggest piece is kept (a thin frame round the picture loses to the thing in the middle) and its
    // holes are filled (a white tummy on a white background still belongs to the dragon).
    const edge = []; for (let x = 0; x < w; x += 2) { edge.push(x, (h - 1) * w + x); } for (let y = 0; y < h; y += 2) { edge.push(y * w, y * w + w - 1); }
    let sr = 0, sg = 0, sb = 0; for (const q of edge) { sr += d[q * 4]; sg += d[q * 4 + 1]; sb += d[q * 4 + 2]; }
    const bg = rgb2lab(sr / edge.length, sg / edge.length, sb / edge.length), thr = (12 + (100 - sense) * 0.55) ** 2;
    for (let q = 0; q < n; q++) { const l = rgb2lab(d[q * 4], d[q * 4 + 1], d[q * 4 + 2]); m[q] = (l[0] - bg[0]) ** 2 + (l[1] - bg[1]) ** 2 + (l[2] - bg[2]) ** 2 < thr ? 0 : 1; }
  }
  const f = new Float32Array(n); for (let q = 0; q < n; q++) f[q] = m[q];
  const s = blurPlane(f, w, h, Math.max(0.6, soften * Math.max(w, h) / 400)); for (let q = 0; q < n; q++) m[q] = s[q] > 0.5 ? 1 : 0;
  // keep the biggest piece only, and fill its holes
  const lab = new Int32Array(n).fill(-1), sizes = []; let best = -1;
  for (let q0 = 0; q0 < n; q0++) if (m[q0] && lab[q0] < 0) {
    const id = sizes.length, st = [q0]; lab[q0] = id; let c = 0, ax = w, ay = h, bx = 0, by = 0;
    while (st.length) { const q = st.pop(), x = q % w, y = (q - x) / w; c++; if (x < ax) ax = x; if (x > bx) bx = x; if (y < ay) ay = y; if (y > by) by = y; for (const t of [x > 0 ? q - 1 : -1, x < w - 1 ? q + 1 : -1, q - w, q + w]) if (t >= 0 && t < n && m[t] && lab[t] < 0) { lab[t] = id; st.push(t); } }
    const fillsBox = c / ((bx - ax + 1) * (by - ay + 1)), score = c * (fillsBox < 0.12 ? 0.05 : 1);   // a frame is mostly empty inside its own box
    sizes.push(score); if (best < 0 || score > sizes[best]) best = id;
  }
  for (let q = 0; q < n; q++) m[q] = lab[q] === best && best >= 0 ? 1 : 0;
  const out = new Uint8Array(n), st = []; for (let x = 0; x < w; x++) { st.push(x, (h - 1) * w + x); } for (let y = 0; y < h; y++) { st.push(y * w, y * w + w - 1); }
  while (st.length) { const q = st.pop(); if (m[q] || out[q]) continue; out[q] = 1; const x = q % w; if (x > 0) st.push(q - 1); if (x < w - 1) st.push(q + 1); if (q >= w) st.push(q - w); if (q < n - w) st.push(q + w); }
  for (let q = 0; q < n; q++) m[q] = out[q] ? 0 : 1;
  let x0 = w, y0 = h, x1 = -1, y1 = -1, area = 0; for (let q = 0; q < n; q++) if (m[q]) { const x = q % w, y = (q - x) / w; area++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return { m, w, h, box: [x0, y0, x1, y1], area };
}
const white = (p) => flatten(p, [255, 255, 255]);
const ink = (L, w, h, cut, soften) => { const s = blurPlane(L, w, h, soften), m = new Uint8Array(w * h), t = cut / 100; for (let q = 0; q < m.length; q++) m[q] = s[q] < t ? 1 : 0; return m; };
const RES = { draft: 0.45, normal: 0.32, fine: 0.24 };

/* ------------------------------------------------------------------ lithophane
   A thin plate that shows the picture when light shines through it: dark parts are thick plastic,
   bright parts thin. */
export function litho(src, o, env) {
  const res = RES[o.quality], round = o.shape === 'circle' || o.shape === 'hex', wmm = o.width, hmm = round ? o.width : o.width * src.h / src.w;
  const nx = Math.round(wmm / res), ny0 = Math.round(hmm / res), tab = o.hole ? Math.round(7 / res) : 0, ny = ny0 + tab;
  let p = white(src);
  if (round) { const s = Math.min(p.w, p.h), cx = (p.w - s) >> 1, cy = (p.h - s) >> 1, c = pic(s, s); for (let y = 0; y < s; y++) c.d.set(p.d.subarray(((y + cy) * p.w + cx) * 4, ((y + cy) * p.w + cx + s) * 4), y * s * 4); p = c; }
  const L = blurPlane(luma(resize(p, nx, ny0)), nx, ny0, 0.6), inside = new Uint8Array(nx * ny), H = new Float32Array(nx * ny), test = shapeTest(o.shape, wmm, hmm), thick = o.max + 0.4;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const q = j * nx + i, x = (i + 0.5) * res - wmm / 2, y = (j - tab + 0.5) * res - hmm / 2;
    if (o.hole) { const hx = x, hy = y + hmm / 2 + 1.5, rr = hx * hx + hy * hy; if (rr <= 25 && j < tab + 4 / res) { if (rr > 1.75 * 1.75) { inside[q] = 1; H[q] = thick; } continue; } }
    if (j < tab || !test(x, y)) continue;
    inside[q] = 1;
    const v = L[(j - tab) * nx + i], t = o.invert ? v : 1 - v, edge = !test(x + Math.sign(x) * o.border, y) || !test(x, y + Math.sign(y) * o.border) || !test(x + Math.sign(x) * o.border * 0.71, y + Math.sign(y) * o.border * 0.71);
    H[q] = o.border > 0 && edge ? thick : o.min + (o.max - o.min) * Math.pow(t, 0.9);
  }
  env.progress(0.4);
  const { stl, tris, grams } = solid(nx, ny, res, inside, H); env.progress(0.9);
  // held up to a lamp: thin plastic glows, thick plastic stays dark
  const out = pic(nx, ny), d = out.d;
  for (let q = 0; q < nx * ny; q++) {
    const k = q * 4; if (!inside[q]) { d[k] = 10; d[k + 1] = 12; d[k + 2] = 26; d[k + 3] = 255; continue; }
    const tr = Math.pow(Math.exp(-(H[q] - o.min) * 1.15), 0.62); d[k] = clamp(28 + 227 * tr); d[k + 1] = clamp(22 + 214 * tr); d[k + 2] = clamp(16 + 176 * tr); d[k + 3] = 255;
  }
  return { out, stl, file: 'lithophane', stats: [`${wmm.toFixed(0)} × ${hmm.toFixed(0)} mm, ${o.min.toFixed(1)} to ${thick.toFixed(1)} mm thick`, `${tris.toLocaleString('en')} triangles, about ${grams.toFixed(1)} g of filament`, 'Print it standing up, in white, 100% infill'] };
}

/* ------------------------------------------------------------------ cookie cutter
   Finds the outline of the thing in the picture and builds a wall round it: a thin blade that cuts,
   standing on a wider rim you press on. */
export function cutter(src, o, env) {
  const res = 0.25, s = subject(resize(src, ...fit(src, 520)), o.sense, o.smooth);
  if (!s.area) return blank('No shape found. Try a picture of one thing on a plain background.');
  const [x0, y0, x1, y1] = s.box, bw = x1 - x0 + 1, bh = y1 - y0 + 1, mm = o.size / Math.max(bw, bh), pad = o.rim + 1.5;
  const nx = Math.round((bw * mm + pad * 2) / res), ny = Math.round((bh * mm + pad * 2) / res), mask = new Uint8Array(nx * ny);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const sx = Math.round(x0 + ((i + 0.5) * res - pad) / mm), sy = Math.round(y0 + ((j + 0.5) * res - pad) / mm); mask[j * nx + i] = sx >= 0 && sy >= 0 && sx < s.w && sy < s.h && s.m[sy * s.w + sx] ? 1 : 0; }
  const soft = new Float32Array(nx * ny); for (let q = 0; q < soft.length; q++) soft[q] = mask[q];
  const sm = blurPlane(soft, nx, ny, 1.6); for (let q = 0; q < soft.length; q++) mask[q] = sm[q] > 0.5 ? 1 : 0;
  env.progress(0.3);
  const dist = distance(mask, nx, ny), inside = new Uint8Array(nx * ny), H = new Float32Array(nx * ny); let blade = 0;
  for (let q = 0; q < nx * ny; q++) { const dm = dist[q] * res; if (dm > 0 && dm <= o.rim) { inside[q] = 1; if (dm <= o.blade) { H[q] = o.height; if (dm <= res * 1.01) blade++; } else H[q] = 1.6; } }
  const { stl, tris, grams } = solid(nx, ny, res, inside, H); env.progress(0.9);
  const out = render(nx, ny, inside, H, (q) => (H[q] > 2 ? [0, 196, 232] : [0, 140, 178]), o.height);
  for (let q = 0; q < nx * ny; q++) if (mask[q]) { const k = q * 4; out.d[k] = lerp(out.d[k], 255, 0.1); out.d[k + 1] = lerp(out.d[k + 1], 46, 0.1); out.d[k + 2] = lerp(out.d[k + 2], 151, 0.1); }
  return { out, stl, file: 'cookie-cutter', stats: [`${(bw * mm).toFixed(0)} × ${(bh * mm).toFixed(0)} mm cookie, cutter ${(nx * res).toFixed(0)} × ${(ny * res).toFixed(0)} mm`, `blade ${o.blade.toFixed(1)} mm wide, ${o.height} mm tall, about ${(blade * res).toFixed(0)} mm of cutting edge`, `${tris.toLocaleString('en')} triangles, about ${grams.toFixed(1)} g of filament`, 'Print it rim down. Use food-safe filament and wash it by hand.'] };
}
const fit = (p, max) => { const k = Math.min(1, max / Math.max(p.w, p.h)); return [Math.round(p.w * k), Math.round(p.h * k)]; };
function blank(msg) { const out = pic(320, 200, [17, 22, 44]); return { out, stats: [msg] }; }

/* ------------------------------------------------------------------ stamp
   A block with the dark parts of the picture standing up from it, mirrored, so the print it leaves
   reads the right way round. */
export function stamp(src, o, env) {
  const res = 0.25, wmm = o.width, hmm = o.width * src.h / src.w, m = 2.5, nx = Math.round((wmm + m * 2) / res), ny = Math.round((hmm + m * 2) / res);
  const pw = Math.round(wmm / res), ph = Math.round(hmm / res), L = luma(resize(white(src), pw, ph)), inkm = ink(L, pw, ph, o.cut, 0.5 + o.smooth * 0.8);
  const inside = new Uint8Array(nx * ny), H = new Float32Array(nx * ny), test = shapeTest('rounded', wmm + m * 2, hmm + m * 2), off = Math.round(m / res); let raised = 0;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const q = j * nx + i; if (!test((i + 0.5) * res - (wmm + m * 2) / 2, (j + 0.5) * res - (hmm + m * 2) / 2)) continue;
    inside[q] = 1; const pi = pw - 1 - (i - off), pj = j - off, on = pi >= 0 && pj >= 0 && pi < pw && pj < ph && inkm[pj * pw + pi];   // mirrored left to right
    H[q] = o.block + (on ? o.relief : 0); if (on) raised++;
  }
  env.progress(0.4);
  const { stl, tris, grams } = solid(nx, ny, res, inside, H); env.progress(0.9);
  const out = render(nx, ny, inside, H, (q) => (H[q] > o.block + 0.1 ? [255, 46, 151] : [226, 222, 236]), o.block + o.relief);
  return { out, stl, file: 'stamp', stats: [`${(nx * res).toFixed(0)} × ${(ny * res).toFixed(0)} mm block, ${o.block} mm thick, picture raised ${o.relief.toFixed(1)} mm`, `${Math.round(raised / (pw * ph) * 100)}% of the face prints ink (it is mirrored on the stamp)`, `${tris.toLocaleString('en')} triangles, about ${grams.toFixed(1)} g of filament`, 'Print it face up. Soft TPU stamps best.'] };
}

/* ------------------------------------------------------------------ keychain tag
   A small flat tag with the picture standing up from it in a second layer, and a hole for a ring.
   Change the filament where the raised layer starts and it prints in two colours. */
export function tag(src, o, env) {
  const res = 0.2, wmm = o.width, round = o.shape === 'circle', hmm = round ? wmm : wmm * src.h / src.w, top = 6.5, nx = Math.round(wmm / res), ny = Math.round((hmm + top) / res);
  let p = white(src); const edge = 2.2, pw = Math.round((wmm - edge * 2) / res), ph = Math.round((hmm - edge * 2) / res);
  const L = luma(resize(p, pw, ph)), inkm = ink(L, pw, ph, o.cut, 0.5 + o.smooth * 0.8), test = shapeTest(o.shape, wmm, hmm), inside = new Uint8Array(nx * ny), H = new Float32Array(nx * ny);
  const body = new Uint8Array(nx * ny);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const x = (i + 0.5) * res - wmm / 2, y = (j + 0.5) * res - top - hmm / 2, ex = x, ey = (j + 0.5) * res - 4.2, er = ex * ex + ey * ey;
    if (test(x, y) || (er <= 4.2 * 4.2)) body[j * nx + i] = 1;                                        // the tag and the ear the ring goes through
    if (er <= 1.9 * 1.9) body[j * nx + i] = 0;
  }
  const far0 = distance(body.map((v) => 1 - v), nx, ny), far = far0.map((v, q) => { const i = q % nx, j = (q - i) / nx; return Math.min(v, i + 0.5, nx - i - 0.5, j + 0.5, ny - j - 0.5); }), offx = Math.round(edge / res), offy = Math.round((top + edge) / res); let raised = 0;
  for (let q = 0; q < nx * ny; q++) {
    if (!body[q]) continue; inside[q] = 1; const i = q % nx, j = (q - i) / nx, pi = i - offx, pj = j - offy, ey = (j + 0.5) * res - 4.2, ex = (i + 0.5) * res - wmm / 2;
    const rim = o.rim && far[q] * res <= 1.2, on = pi >= 0 && pj >= 0 && pi < pw && pj < ph && inkm[pj * pw + pi] && far[q] * res > 1.6 && ex * ex + ey * ey > 3.6 * 3.6;
    H[q] = o.base + (rim || on ? o.raise : 0); if (on) raised++;
  }
  env.progress(0.4);
  const { stl, tris, grams } = solid(nx, ny, res, inside, H); env.progress(0.9);
  const out = render(nx, ny, inside, H, (q) => (H[q] > o.base + 0.05 ? [255, 230, 0] : [18, 24, 58]), o.base + o.raise);
  return { out, stl, file: 'keychain-tag', stats: [`${wmm.toFixed(0)} × ${(hmm + top).toFixed(0)} mm, ${(o.base + o.raise).toFixed(1)} mm thick, 3.8 mm hole`, `Two colours: change the filament at ${o.base.toFixed(1)} mm`, `${tris.toLocaleString('en')} triangles, about ${grams.toFixed(1)} g of filament`] };
}
