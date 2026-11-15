// Picture Machines: the picture maths every machine shares. Plain functions on typed arrays, so they
// run the same in the page and in the worker. A picture is { w, h, d } with d = RGBA bytes.

export const clamp = (v, a = 0, b = 255) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// a small seeded random number maker: the same seed always paints the same picture
export function rng(seed) {
  let s = (seed | 0) + 0x6D2B79F5;
  return () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export function pic(w, h, fill) {
  const d = new Uint8ClampedArray(w * h * 4);
  if (fill) for (let i = 0; i < d.length; i += 4) { d[i] = fill[0]; d[i + 1] = fill[1]; d[i + 2] = fill[2]; d[i + 3] = 255; }
  return { w, h, d };
}

// brightness 0..1 of every pixel (what the eye sees, not a plain average)
export function luma(p) {
  const L = new Float32Array(p.w * p.h), d = p.d;
  for (let i = 0, q = 0; q < L.length; i += 4, q++) L[q] = (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255;
  return L;
}

// one box blur of a Float32 plane, across then down (running sums, so any radius costs the same)
function boxPlane(src, w, h, r) {
  if (r < 1) return src;
  const tmp = new Float32Array(w * h), out = new Float32Array(w * h), n = 2 * r + 1;
  for (let y = 0; y < h; y++) {
    const o = y * w; let s = src[o] * (r + 1);
    for (let x = 1; x <= r; x++) s += src[o + Math.min(w - 1, x)];
    for (let x = 0; x < w; x++) { tmp[o + x] = s / n; s += src[o + Math.min(w - 1, x + r + 1)] - src[o + Math.max(0, x - r)]; }
  }
  for (let x = 0; x < w; x++) {
    let s = tmp[x] * (r + 1);
    for (let y = 1; y <= r; y++) s += tmp[Math.min(h - 1, y) * w + x];
    for (let y = 0; y < h; y++) { out[y * w + x] = s / n; s += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x]; }
  }
  return out;
}
// a soft (Gaussian-like) blur: three box blurs
export function blurPlane(src, w, h, sigma) {
  if (sigma < 0.35) return src;
  const r = Math.max(1, Math.round(sigma * 0.86));
  return boxPlane(boxPlane(boxPlane(src, w, h, r), w, h, r), w, h, r);
}
export function planes(p) {
  const n = p.w * p.h, R = new Float32Array(n), G = new Float32Array(n), B = new Float32Array(n), d = p.d;
  for (let i = 0, q = 0; q < n; i += 4, q++) { R[q] = d[i]; G[q] = d[i + 1]; B[q] = d[i + 2]; }
  return [R, G, B];
}
export function fromPlanes(R, G, B, w, h) {
  const p = pic(w, h), d = p.d;
  for (let i = 0, q = 0; q < w * h; i += 4, q++) { d[i] = R[q]; d[i + 1] = G[q]; d[i + 2] = B[q]; d[i + 3] = 255; }
  return p;
}
export function blur(p, sigma) {
  const [R, G, B] = planes(p);
  return fromPlanes(blurPlane(R, p.w, p.h, sigma), blurPlane(G, p.w, p.h, sigma), blurPlane(B, p.w, p.h, sigma), p.w, p.h);
}

// how fast the brightness changes, and in which direction (Sobel)
export function gradient(L, w, h) {
  const gx = new Float32Array(w * h), gy = new Float32Array(w * h), mag = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x;
    const a = -L[i - w - 1] - 2 * L[i - 1] - L[i + w - 1] + L[i - w + 1] + 2 * L[i + 1] + L[i + w + 1];
    const b = -L[i - w - 1] - 2 * L[i - w] - L[i - w + 1] + L[i + w - 1] + 2 * L[i + w] + L[i + w + 1];
    gx[i] = a; gy[i] = b; mag[i] = Math.hypot(a, b);
  }
  return { gx, gy, mag };
}

// ink lines the way a comic artist would draw them (XDoG: the difference of two blurs, pushed to black or white).
// Returns 0 (ink) .. 1 (paper) for every pixel.
export function inkLines(L, w, h, { sigma = 1.0, k = 1.6, eps = 0.012, phi = 60 } = {}) {
  const a = blurPlane(L, w, h, sigma), b = blurPlane(L, w, h, sigma * k), out = new Float32Array(w * h);
  for (let i = 0; i < out.length; i++) {
    const dgo = a[i] - 0.98 * b[i];
    out[i] = dgo >= eps ? 1 : Math.max(0, 1 + Math.tanh(phi * (dgo - eps)));
  }
  return out;
}

// colour spaces: Lab is the one where "distance" means "looks different"
function toLin(u) { u /= 255; return u <= 0.04045 ? u / 12.92 : Math.pow((u + 0.055) / 1.055, 2.4); }
const LIN = new Float32Array(256); for (let i = 0; i < 256; i++) LIN[i] = toLin(i);
const cbrtF = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
export function rgb2lab(r, g, b) {
  const R = LIN[r | 0], G = LIN[g | 0], B = LIN[b | 0];
  const x = cbrtF((0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047), y = cbrtF(0.2126 * R + 0.7152 * G + 0.0722 * B), z = cbrtF((0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}
export function hex(s) { const n = parseInt(s.replace('#', ''), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }

// pick the k colours that describe a picture best (k-means in Lab, started from a spread of real pixels)
export function palette(p, k, seed = 1, sat = 1) {
  const r = rng(seed), n = p.w * p.h, step = Math.max(1, Math.floor(n / 6000)), pts = [];
  for (let q = 0; q < n; q += step) { const i = q * 4; pts.push([p.d[i], p.d[i + 1], p.d[i + 2], ...rgb2lab(p.d[i], p.d[i + 1], p.d[i + 2])]); }
  const cen = [pts[Math.floor(r() * pts.length)]];
  while (cen.length < k) {            // k-means++: the next start is far from the ones we have
    let best = 0, bi = 0;
    for (let t = 0; t < 40; t++) { const c = pts[Math.floor(r() * pts.length)]; let dm = 1e9; for (const m of cen) dm = Math.min(dm, (c[3] - m[3]) ** 2 + (c[4] - m[4]) ** 2 + (c[5] - m[5]) ** 2); if (dm > best) { best = dm; bi = c; } }
    cen.push(bi || pts[Math.floor(r() * pts.length)]);
  }
  let C = cen.map((c) => c.slice());
  for (let it = 0; it < 8; it++) {
    const sum = C.map(() => [0, 0, 0, 0, 0, 0, 0]);
    for (const q of pts) { let bi = 0, bd = 1e9; for (let j = 0; j < C.length; j++) { const dd = (q[3] - C[j][3]) ** 2 + (q[4] - C[j][4]) ** 2 + (q[5] - C[j][5]) ** 2; if (dd < bd) { bd = dd; bi = j; } } const s = sum[bi]; for (let t = 0; t < 6; t++) s[t] += q[t]; s[6]++; }
    C = C.map((c, j) => (sum[j][6] ? sum[j].slice(0, 6).map((v) => v / sum[j][6]) : c));
  }
  return C.map((c) => { const a = (c[0] + c[1] + c[2]) / 3; return [clamp(a + (c[0] - a) * sat), clamp(a + (c[1] - a) * sat), clamp(a + (c[2] - a) * sat)].map(Math.round); });
}
// a fast "which palette colour is nearest" for a whole picture (Lab distance, remembered per colour)
export function nearestMaker(pal) {
  const labs = pal.map((c) => rgb2lab(c[0], c[1], c[2])), memo = new Map();
  return (r, g, b) => {
    const key = ((r >> 2) << 12) | ((g >> 2) << 6) | (b >> 2); let v = memo.get(key);
    if (v === undefined) { const l = rgb2lab(r, g, b); let bd = 1e9; v = 0; for (let j = 0; j < labs.length; j++) { const dd = (l[0] - labs[j][0]) ** 2 + (l[1] - labs[j][1]) ** 2 + (l[2] - labs[j][2]) ** 2; if (dd < bd) { bd = dd; v = j; } } memo.set(key, v); }
    return v;
  };
}

// shrink or grow a picture (area average when shrinking, so nothing sparkles)
export function resize(p, w, h) {
  w = Math.max(1, Math.round(w)); h = Math.max(1, Math.round(h));
  if (w === p.w && h === p.h) return p;
  const out = pic(w, h), sx = p.w / w, sy = p.h / h, d = p.d, o = out.d;
  for (let y = 0; y < h; y++) {
    const y0 = Math.floor(y * sy), y1 = Math.max(y0 + 1, Math.min(p.h, Math.floor((y + 1) * sy)));
    for (let x = 0; x < w; x++) {
      const x0 = Math.floor(x * sx), x1 = Math.max(x0 + 1, Math.min(p.w, Math.floor((x + 1) * sx)));
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) { const i = (yy * p.w + xx) * 4; r += d[i]; g += d[i + 1]; b += d[i + 2]; a += d[i + 3]; n++; }
      const j = (y * w + x) * 4; o[j] = r / n; o[j + 1] = g / n; o[j + 2] = b / n; o[j + 3] = a / n;
    }
  }
  return out;
}
// a see-through picture laid on a plain colour (photos with holes in them, like a logo)
export function flatten(p, bg = [255, 255, 255]) {
  const out = pic(p.w, p.h), d = p.d, o = out.d;
  for (let i = 0; i < d.length; i += 4) { const a = d[i + 3] / 255; o[i] = d[i] * a + bg[0] * (1 - a); o[i + 1] = d[i + 1] * a + bg[1] * (1 - a); o[i + 2] = d[i + 2] * a + bg[2] * (1 - a); o[i + 3] = 255; }
  return out;
}
export function saturate(p, f, contrast = 1) {
  const d = p.d;
  for (let i = 0; i < d.length; i += 4) { const a = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]; for (let c = 0; c < 3; c++) d[i + c] = clamp(((a + (d[i + c] - a) * f) - 128) * contrast + 128); }
  return p;
}
// how far every pixel is from the nearest "on" pixel, exactly (Felzenszwalb's two-pass method), in pixels
export function distance(mask, w, h) {
  const INF = 1e20, f = new Float64Array(Math.max(w, h)), dd = new Float64Array(Math.max(w, h)), v = new Int32Array(Math.max(w, h)), z = new Float64Array(Math.max(w, h) + 1), out = new Float32Array(w * h);
  const pass = (n) => { let k = 0; v[0] = 0; z[0] = -INF; z[1] = INF;
    for (let q = 1; q < n; q++) { let s; do { const p0 = v[k]; s = ((f[q] + q * q) - (f[p0] + p0 * p0)) / (2 * q - 2 * p0); } while (s <= z[k] && --k >= 0); k++; v[k] = q; z[k] = s; z[k + 1] = INF; }
    k = 0; for (let q = 0; q < n; q++) { while (z[k + 1] < q) k++; const p0 = v[k]; dd[q] = (q - p0) * (q - p0) + f[p0]; } };
  for (let x = 0; x < w; x++) { for (let y = 0; y < h; y++) f[y] = mask[y * w + x] ? 0 : INF; pass(h); for (let y = 0; y < h; y++) out[y * w + x] = dd[y]; }
  for (let y = 0; y < h; y++) { for (let x = 0; x < w; x++) f[x] = out[y * w + x]; pass(w); for (let x = 0; x < w; x++) out[y * w + x] = Math.sqrt(dd[x]); }
  return out;
}
