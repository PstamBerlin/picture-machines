// Picture Machines: the page. It holds the photo, builds the machine cards and the controls from
// machines.js, and asks the worker to run a machine whenever something changes. A small preview is
// made while you play with the settings; the full-size picture is only made when you save.
import { MACHINES, BY_ID, defaults } from './machines.js?v=480fa59c';

const $ = (s) => document.querySelector(s);
const el = { drop: $('#drop'), result: $('#result'), view: $('#view'), before: $('#before'), after: $('#after'), wipe: $('#wipe'), busy: $('#busy'), busyText: $('#busyText'), busyBar: $('#busyBar'), stats: $('#stats'),
  pic: $('#picCards'), print: $('#printCards'), panel: $('#panel'), cardpill: $('#cardpill'), ico: $('#machineIco'), name: $('#machineName'), blurb: $('#machineBlurb'), controls: $('#controls'), save: $('#saveBtn'), save2: $('#save2Btn'), share: $('#shareBtn'), note: $('#note'),
  reset: $('#resetBtn'), newBtn: $('#newBtn'), pick: $('#pickBtn'), camBtn: $('#camBtn'), sample: $('#sampleBtn'), file: $('#file'), cam: $('#cam'), toast: $('#toast') };
const coarse = matchMedia('(pointer: coarse)').matches, still = matchMedia('(prefers-reduced-motion: reduce)').matches;
// how big the picture is at each step: small while you play, big when you save (phones get a little less)
const SIZE = { preview: coarse ? 440 : 600, full: coarse ? 1280 : 1600, print: 900, thumb: 132, keep: 2400 };
const LS = 'picture-machines-v1';
const saved = (() => { try { return JSON.parse(localStorage.getItem(LS)) || {}; } catch (e) { return {}; } })();
const state = { id: BY_ID[saved.id] ? saved.id : 'paint', opts: saved.opts && typeof saved.opts === 'object' ? saved.opts : {}, glass: !!saved.glass, spring: !!saved.spring, photo: null, last: null };
const remember = () => { try { localStorage.setItem(LS, JSON.stringify({ id: state.id, opts: state.opts, glass: state.glass, spring: state.spring })); } catch (e) { /* private window: nothing is remembered */ } };
const optsOf = (id) => { const o = defaults(id), mine = state.opts[id] || {}; for (const c of BY_ID[id].controls) if (c.id in mine) o[c.id] = mine[c.id]; return o; };

/* ---------- the worker ---------- */
// One runner = one worker. A newer request throws the running one away (the worker is restarted), so a
// slider you are dragging never waits for pictures you no longer want.
function runner() {
  let wk = null, job = 0, drop = null;
  return (id, src, opts, onProgress) => new Promise((done, fail) => {
    if (drop) { wk.terminate(); wk = null; drop(new Error('stale')); drop = null; }
    if (!wk) wk = new Worker('worker.js?v=480fa59c', { type: 'module' });
    const mine = ++job; drop = fail;
    wk.onmessage = (e) => { const m = e.data; if (m.job !== mine) return; if (m.progress !== undefined) { if (onProgress) onProgress(m.progress); return; } drop = null; if (m.ok) done(m); else fail(new Error(m.error)); };
    wk.onerror = (e) => { drop = null; wk = null; fail(new Error(e.message || 'the worker stopped')); };
    wk.postMessage({ job: mine, id, w: src.width, h: src.height, d: src.data.buffer, opts }, [src.data.buffer]);
  });
}
const runMain = runner(), runThumb = runner();

/* ---------- the photo ---------- */
function sourceData(max) {
  const p = state.photo, k = Math.min(1, max / Math.max(p.width, p.height)), c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(p.width * k)); c.height = Math.max(1, Math.round(p.height * k));
  const g = c.getContext('2d', { willReadFrequently: true }); g.imageSmoothingQuality = 'high'; g.drawImage(p, 0, 0, c.width, c.height);
  return g.getImageData(0, 0, c.width, c.height);
}
async function setPhoto(src) {
  let bmp;
  try {
    const blob = typeof src === 'string' ? await (await fetch(src)).blob() : src;
    bmp = await createImageBitmap(blob, { imageOrientation: 'from-image' });
  } catch (e) { toast('That is not a picture I can read. Try a JPG or PNG.'); return; }
  const k = Math.min(1, SIZE.keep / Math.max(bmp.width, bmp.height)), c = document.createElement('canvas');
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k); c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  if (bmp.close) bmp.close();
  state.photo = c; state.last = null;
  el.drop.hidden = true; el.result.hidden = false; el.newBtn.hidden = false;
  el.before.width = c.width > 1200 ? Math.round(c.width * 1200 / Math.max(c.width, c.height)) : c.width; el.before.height = Math.round(el.before.width * c.height / c.width);
  el.before.getContext('2d').drawImage(c, 0, 0, el.before.width, el.before.height);
  shape(c.width, c.height); fresh(); render(0); thumbs();
}
// the frame takes the picture's shape, and never grows taller than the window
function shape(w, h) { el.view.style.aspectRatio = w + ' / ' + h; el.view.style.maxWidth = 'calc((100dvh - ' + (coarse ? 320 : 150) + 'px) * ' + (w / h).toFixed(4) + ')'; }
function fresh() { el.view.classList.remove('fresh'); void el.view.offsetWidth; el.view.classList.add('fresh'); }

/* ---------- running the chosen machine ---------- */
let renderTimer = 0, renderNo = 0;
function render(delay = 110) { clearTimeout(renderTimer); renderTimer = setTimeout(doRender, delay); }
async function doRender() {
  if (!state.photo) return;
  const id = state.id, m = BY_ID[id], no = ++renderNo;
  busy('Working');
  try {
    const r = await runMain(id, sourceData(m.kind === 'print' ? SIZE.print : SIZE.preview), optsOf(id), bar);
    if (no !== renderNo) return;
    show(r);
  } catch (e) { if (e.message !== 'stale') { console.error(e); toast('That did not work. Try other settings.'); } }
  finally { if (no === renderNo) busy(null); }
}
function show(r) {
  const m = BY_ID[r.id];
  el.after.width = r.w; el.after.height = r.h; el.after.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(r.d), r.w, r.h), 0, 0);
  el.view.classList.toggle('print', m.kind === 'print');
  if (m.kind === 'print') shape(r.w, r.h); else shape(state.photo.width, state.photo.height);
  el.stats.textContent = ''; for (const s of r.stats) { const li = document.createElement('li'); li.textContent = s; el.stats.append(li); }
  state.last = r; el.save.disabled = m.kind === 'print' && !r.stl;
  thumbFrom(r.id, el.after);
}
function busy(text) { el.busy.hidden = !text; if (text) { el.busyText.textContent = text; el.busyBar.style.width = '4%'; } }
function bar(f) { el.busyBar.style.width = Math.round(4 + f * 96) + '%'; }

/* ---------- the machine cards ---------- */
const ICON = { brush: 'M15 4l5 5-9 9H6v-5zM4 20h4', comic: 'M4 5h16v11H11l-5 4v-4H4z', pixel: 'M5 5h5v5H5zM14 5h5v5h-5zM5 14h5v5H5zM14 14h5v5h-5z', pencil: 'M4 20l1-5L16 4l4 4L9 19zM13 7l4 4', glass: 'M12 3l8 6-3 11H7L4 9zM12 3v17M4 9h16',
  brick: 'M4 9h16v10H4zM8 9V6h3v3M13 9V6h3v3', poster: 'M5 4h10v13H5zM9 8h10v12H9z', lamp: 'M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.500c.700.700 1 1.500 1 2.500h6c0-1 .300-1.800 1-2.500A6 6 0 0 0 12 3z', cutter: 'M12 3l2.600 5.600 6 .700-4.500 4.100 1.200 6-5.300-3-5.300 3 1.200-6L3.400 9.300l6-.700z', stamp: 'M9 4h6v5l2 4v3H7v-3l2-4zM5 20h14', tag: 'M4 12l8-8h8v8l-8 8zM16 8h.010' };
const cards = new Map();
MACHINES.forEach((m, n) => {
  const b = document.createElement('button'); b.type = 'button'; b.className = 'card'; b.dataset.id = m.id; b.style.setProperty('--n', n); b.setAttribute('aria-pressed', 'false'); b.title = m.blurb;
  b.innerHTML = '<span class="thumb"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="' + ICON[m.icon] + '"/></svg></span><span></span>';
  b.lastChild.textContent = m.name;
  b.addEventListener('click', () => choose(m.id));
  (m.kind === 'print' ? el.print : el.pic).append(b); cards.set(m.id, b);
});
function thumbFrom(id, canvas) {            // a card shows what its machine makes of YOUR photo
  const t = cards.get(id).firstChild; let c = t.querySelector('canvas');
  if (!c) { c = document.createElement('canvas'); c.width = c.height = 160; t.append(c); }
  const g = c.getContext('2d'), s = Math.min(canvas.width, canvas.height);
  g.drawImage(canvas, (canvas.width - s) / 2, (canvas.height - s) / 2, s, s, 0, 0, 160, 160);
}
async function thumbs() {                   // one after another, on a worker of their own, so the big picture never waits
  const photo = state.photo, tmp = document.createElement('canvas');
  for (const m of MACHINES) {
    if (state.photo !== photo) return;
    if (m.id === state.id) continue;         // the chosen one gets its thumb from the big picture
    try {
      const r = await runThumb(m.id, sourceData(m.kind === 'print' ? 260 : SIZE.thumb * 2), optsOf(m.id));
      if (state.photo !== photo) return;
      tmp.width = r.w; tmp.height = r.h; tmp.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(r.d), r.w, r.h), 0, 0); thumbFrom(m.id, tmp);
    } catch (e) { if (e.message === 'stale') return; }
  }
}
function choose(id, quiet) {
  const was = cards.get(state.id), now = cards.get(id), from = quiet || was === now ? null : boxIn(was, el.panel);
  state.id = id; remember();
  for (const [k, b] of cards) { b.classList.toggle('on', k === id); b.setAttribute('aria-pressed', String(k === id)); }
  if (from) glideCard(from, now);
  const m = BY_ID[id]; el.name.textContent = m.name; el.blurb.textContent = m.blurb;
  el.ico.innerHTML = '<svg viewBox="0 0 24 24"><path d="' + ICON[m.icon] + '"/></svg>'; el.ico.classList.remove('popped'); void el.ico.offsetWidth; el.ico.classList.add('popped');
  el.save.textContent = m.kind === 'print' ? 'Save the 3D file' : 'Save the picture'; el.save2.hidden = m.kind !== 'print';
  el.note.textContent = m.kind === 'print' ? 'The 3D file is an STL. Open it in your slicer and print it.' : 'Saving makes a full-size version first, so it can take a moment.';
  buildControls();
  if (!quiet && state.photo) { fresh(); render(0); cards.get(id).scrollIntoView({ block: 'nearest', inline: 'center', behavior: still ? 'auto' : 'smooth' }); }
}

/* ---------- the controls, built from the machine's list ---------- */
function buildControls() {
  const m = BY_ID[state.id], o = optsOf(m.id); el.controls.textContent = ''; let n = 0;
  const set = (c, v) => { (state.opts[m.id] = state.opts[m.id] || {})[c.id] = v; remember(); if (m.controls.some((x) => x.when)) showHide(); render(); };
  const showHide = () => { const now = optsOf(m.id); for (const c of m.controls) if (c.when) el.controls.querySelector('[data-c="' + c.id + '"]').hidden = !c.when(now); };
  for (const c of m.controls) {
    let node;
    if (c.type === 'toggle') {
      node = document.createElement('label'); node.className = 'tog'; node.innerHTML = '<span></span><input type="checkbox">'; node.firstChild.textContent = c.label;
      const i = node.lastChild; i.checked = !!o[c.id]; i.addEventListener('change', () => set(c, i.checked));
    } else if (c.type === 'range') {
      node = document.createElement('label'); node.className = 'ctl'; node.innerHTML = '<span class="lbl"><span></span><output></output></span><input type="range">';
      node.querySelector('.lbl span').textContent = c.label; const i = node.lastChild, out = node.querySelector('output');
      i.min = c.min; i.max = c.max; i.step = c.step; i.value = o[c.id];
      const paint = () => { out.textContent = (+i.value).toFixed(c.step < 1 ? (c.step < 0.1 ? 2 : 1) : 0) + (c.unit ? ' ' + c.unit : ''); i.style.setProperty('--fill-to', ((i.value - c.min) / (c.max - c.min) * 100).toFixed(1) + '%'); };
      i.addEventListener('input', () => { paint(); set(c, +i.value); }); paint();
    } else {
      node = document.createElement('div'); node.className = 'ctl'; node.innerHTML = '<span class="lbl"><span></span></span><div class="seg" role="group"><i class="pill"></i></div>';
      node.querySelector('.lbl span').textContent = c.label; const seg = node.lastChild; seg.setAttribute('aria-label', c.label);
      for (const [val, label] of c.opts) {
        const b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.classList.toggle('on', o[c.id] === val); b.setAttribute('aria-pressed', String(o[c.id] === val));
        b.addEventListener('click', () => { for (const x of seg.querySelectorAll('button')) { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', String(x === b)); } placePill(seg, true); set(c, val); });
        seg.append(b);
      }
    }
    node.dataset.c = c.id; node.style.setProperty('--n', n++); el.controls.append(node);
  }
  showHide(); requestAnimationFrame(() => el.controls.querySelectorAll('.seg').forEach((s) => placePill(s, false)));
}
// Pull and stretch. A pill (behind a chosen option, or round the chosen machine) is pulled across to the
// new place: its front edge runs ahead, so for a moment it is stretched over both and thinner, like
// something soft, then its back edge lets go and catches up on a spring. Each edge has its own timing,
// which one easing curve cannot do, so the frames are worked out here.
function spring(u) { if (u <= 0) return 0; if (u >= 1) return 1; const z = 0.5, wd = Math.sqrt(1 - z * z), w = -Math.log(0.004 * wd) / z; return 1 - Math.exp(-z * w * u) * (Math.cos(wd * w * u) + (z / wd) * Math.sin(wd * w * u)); }
function pullFrames(from, to) {
  const frames = [], N = 30, fx = to.x + to.w / 2 >= from.x + from.w / 2, fy = to.y + to.h / 2 >= from.y + from.h / 2;
  const dx = Math.abs(to.x - from.x), dy = Math.abs(to.y - from.y), far = Math.hypot(dx, dy) || 1;
  for (let i = 0; i <= N; i++) {
    const t = i / N, lead = 1 - Math.pow(1 - Math.min(1, t / 0.44), 3), trail = spring((t - 0.16) / 0.84);
    let x0 = from.x + (to.x - from.x) * (fx ? trail : lead), x1 = from.x + from.w + (to.x + to.w - from.x - from.w) * (fx ? lead : trail);
    let y0 = from.y + (to.y - from.y) * (fy ? trail : lead), y1 = from.y + from.h + (to.y + to.h - from.y - from.h) * (fy ? lead : trail);
    // thinner while it is long: across its length when it travels along a row, or along a column
    const longX = Math.max(0, (x1 - x0) - (from.w + (to.w - from.w) * t)), longY = Math.max(0, (y1 - y0) - (from.h + (to.h - from.h) * t));
    if (dy < 2 && dx > 2) { const k = 0.34 * Math.min(1, longX / far) * (y1 - y0) / 2; y0 += k; y1 -= k; }
    if (dx < 2 && dy > 2) { const k = 0.34 * Math.min(1, longY / far) * (x1 - x0) / 2; x0 += k; x1 -= k; }
    frames.push({ left: x0.toFixed(2) + 'px', top: y0.toFixed(2) + 'px', width: Math.max(4, x1 - x0).toFixed(2) + 'px', height: Math.max(4, y1 - y0).toFixed(2) + 'px' });
  }
  frames[N] = { left: to.x + 'px', top: to.y + 'px', width: to.w + 'px', height: to.h + 'px' };
  return { frames, opts: { duration: Math.min(760, 460 + far * 0.45), easing: 'linear' } };
}
const boxIn = (node, box) => { const a = node.getBoundingClientRect(), b = box.getBoundingClientRect(); return { x: a.left - b.left - box.clientLeft, y: a.top - b.top - box.clientTop, w: a.width, h: a.height }; };
function placePill(seg, animate) {
  const on = seg.querySelector('button.on'), pill = seg.querySelector('.pill'); if (!on) return;
  const to = { x: on.offsetLeft, y: on.offsetTop, w: on.offsetWidth, h: on.offsetHeight }, from = pill.at; pill.at = to;
  Object.assign(pill.style, { left: to.x + 'px', top: to.y + 'px', width: to.w + 'px', height: to.h + 'px' });
  if (!animate || !from || still || !pill.animate) return;
  if (pill.run) pill.run.cancel();                    // a move that is still on its way is dropped for the new one
  if (pill.lift) pill.lift.cancel();
  const f = pullFrames(pill.now || from, to); pill.run = pill.animate(f.frames, f.opts); pill.run.onfinish = () => { pill.run = null; };
  pill.lift = lift(pill, f.opts.duration);
}
// Glass look only: the bubble swells while it travels and settles back to its normal size when it lands,
// like Apple's. At rest it is never bigger. A transform only, so the pull and stretch above are untouched.
function lift(node, duration, sx = 1.1, sy = 1.62) {
  if (still || !node.animate || !document.documentElement.hasAttribute('data-glass')) return null;
  return node.animate([{ transform: 'none' }, { transform: `scale(${sx}, ${sy})`, offset: 0.3 }, { transform: `scale(${(1 + (sx - 1) * 0.4).toFixed(3)}, ${(1 + (sy - 1) * 0.4).toFixed(3)})`, offset: 0.7 }, { transform: 'none' }],
    { duration, easing: 'cubic-bezier(.3,.7,.4,1)' });
}
// the chosen machine's pill travels from card to card (not on a phone, where the cards are in rows you swipe)
let cardRun = null;
function glideCard(from, card) {
  if (still || !el.cardpill.animate || getComputedStyle(card.parentNode).display !== 'grid') return;
  const f = pullFrames(from, boxIn(card, el.panel));
  if (cardRun) { cardRun.onfinish = null; cardRun.cancel(); }
  el.panel.classList.add('gliding');
  cardRun = el.cardpill.animate(f.frames, Object.assign({ fill: 'forwards' }, f.opts));
  lift(el.cardpill, f.opts.duration, 1.08, 1.14);
  cardRun.onfinish = () => { el.panel.classList.remove('gliding'); cardRun.cancel(); cardRun = null; };   // landed: the card paints its own pill again
}
addEventListener('resize', () => el.controls.querySelectorAll('.seg').forEach((s) => placePill(s, false)));

/* ---------- pull to see your photo ---------- */
// The handle sits at the left edge. Pull it to the right and your own photo shows from under the
// result; the knob stretches the further you pull. Let go and it snaps back.
{
  let drag = null;
  const setSplit = (v) => { el.view.style.setProperty('--split', v.toFixed(4)); el.view.style.setProperty('--pull', Math.min(1, v * 2.2).toFixed(3)); el.wipe.setAttribute('aria-valuenow', Math.round(v * 100)); };
  const back = () => { el.wipe.classList.add('back'); el.view.classList.add('back'); setSplit(0); setTimeout(() => { el.wipe.classList.remove('back'); el.view.classList.remove('back'); }, 560); };
  el.wipe.addEventListener('pointerdown', (e) => { drag = { id: e.pointerId }; el.wipe.classList.add('dragging'); el.wipe.classList.remove('back'); el.view.classList.remove('back'); try { el.wipe.setPointerCapture(e.pointerId); } catch (err) { /* gone */ } e.preventDefault(); });
  el.wipe.addEventListener('pointermove', (e) => { if (!drag) return; const r = el.view.getBoundingClientRect(); setSplit(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width))); });
  const end = () => { if (!drag) return; drag = null; el.wipe.classList.remove('dragging'); back(); };
  el.wipe.addEventListener('pointerup', end); el.wipe.addEventListener('pointercancel', end);
  el.wipe.addEventListener('keydown', (e) => { if (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowRight') { e.preventDefault(); setSplit(1); } });
  el.wipe.addEventListener('keyup', back); el.wipe.addEventListener('blur', back);
  setSplit(0);
}

/* ---------- saving and sharing ---------- */
const canvasOf = (r) => { const c = document.createElement('canvas'); c.width = r.w; c.height = r.h; c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(r.d), r.w, r.h), 0, 0); return c; };
const pngOf = (r) => new Promise((ok) => canvasOf(r).toBlob(ok, 'image/png'));
function download(blob, name) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }
async function fullPicture() {              // the picture machines are run once more, big, for saving
  const id = state.id; busy('Making it full size');
  try { return await runMain(id, sourceData(SIZE.full), optsOf(id), bar); } finally { busy(null); }
}
el.save.addEventListener('click', async () => {
  const m = BY_ID[state.id]; if (!state.photo) return;
  try {
    if (m.kind === 'print') { if (!state.last || !state.last.stl) return; download(new Blob([state.last.stl], { type: 'model/stl' }), 'picture-machines-' + state.last.file + '.stl'); toast('Saved the 3D file. Open it in your slicer.'); return; }
    const r = await fullPicture(); download(await pngOf(r), 'picture-machines-' + m.id + '.png'); toast('Saved, ' + r.w + ' × ' + r.h + ' pixels.');
  } catch (e) { if (e.message !== 'stale') toast('Saving did not work. Try again.'); }
});
el.save2.addEventListener('click', async () => { if (state.last) { download(await pngOf(state.last), 'picture-machines-' + state.last.file + '-preview.png'); toast('Saved the preview picture.'); } });
if (navigator.canShare && navigator.share) {
  el.share.hidden = false;
  el.share.addEventListener('click', async () => {
    if (!state.photo) return;
    try {
      const m = BY_ID[state.id], r = m.kind === 'print' ? state.last : await fullPicture(), file = new File([await pngOf(r)], 'picture-machines-' + m.id + '.png', { type: 'image/png' });
      if (navigator.canShare({ files: [file] })) await navigator.share({ files: [file], title: 'Made with Picture Machines' }); else toast('This device cannot share pictures from here.');
    } catch (e) { /* closed the share sheet */ }
  });
}
el.reset.addEventListener('click', () => { delete state.opts[state.id]; remember(); buildControls(); render(0); });

/* ---------- getting a photo in ---------- */
el.pick.addEventListener('click', () => el.file.click());
el.newBtn.addEventListener('click', () => el.file.click());
el.camBtn.hidden = !coarse; el.camBtn.addEventListener('click', () => el.cam.click());
el.sample.addEventListener('click', () => setPhoto('sample.jpg'));
for (const input of [el.file, el.cam]) input.addEventListener('change', () => { if (input.files[0]) setPhoto(input.files[0]); input.value = ''; });
addEventListener('dragover', (e) => { e.preventDefault(); el.drop.classList.add('over'); });
addEventListener('dragleave', (e) => { if (!e.relatedTarget) el.drop.classList.remove('over'); });
addEventListener('drop', (e) => { e.preventDefault(); el.drop.classList.remove('over'); const f = [...e.dataTransfer.files].find((x) => x.type.startsWith('image/')); if (f) setPhoto(f); else toast('Drop a picture file.'); });
addEventListener('paste', (e) => { const it = [...(e.clipboardData ? e.clipboardData.items : [])].find((x) => x.type.startsWith('image/')); if (it) setPhoto(it.getAsFile()); });

/* ---------- springy animations: buttons lean toward the pointer ---------- */
// Only with the Springy switch on. A button (or a choice in a row) is pulled toward the pointer while it is over
// it, and stretches the way it is pulled (--mx, --my, --sx, --sy, read by style.css). A mouse only; one write a frame.
{
  let cur = null, at = null, raf = 0;
  const frame = () => {
    raf = 0; const node = at ? at.node : null;
    if (cur && cur !== node) for (const k of ['--mx', '--my', '--sx', '--sy']) cur.style.removeProperty(k);
    cur = node; if (!node) return;
    const r = node.getBoundingClientRect(), nx = Math.max(-1, Math.min(1, (at.x - r.left - r.width / 2) / (r.width / 2))), ny = Math.max(-1, Math.min(1, (at.y - r.top - r.height / 2) / (r.height / 2)));
    const big = node.classList.contains('btn') ? 1 : 0.5;
    node.style.setProperty('--mx', (nx * 7 * big).toFixed(1) + 'px'); node.style.setProperty('--my', (ny * 5 * big).toFixed(1) + 'px');
    node.style.setProperty('--sx', (1 + Math.abs(nx) * 0.07 * big).toFixed(3)); node.style.setProperty('--sy', (1 + Math.abs(ny) * 0.12 * big - Math.abs(nx) * 0.04 * big).toFixed(3));
  };
  if (!still) document.addEventListener('pointermove', (e) => {
    const node = state.spring && e.pointerType === 'mouse' && e.target.closest ? e.target.closest('.btn:not(:disabled), .seg button') : null;
    at = node ? { node, x: e.clientX, y: e.clientY } : null;
    if (!raf && (node || cur)) raf = requestAnimationFrame(frame);
  }, { passive: true });
}

let toastTimer = 0;
function toast(text) { el.toast.textContent = text; el.toast.classList.add('on'); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.toast.classList.remove('on'), 3200); }

/* ---------- springy animations: a slider's knob is really pulled ---------- */
// While you drag a slider, its knob stretches the way it moves and trails a little behind, the faster the more;
// when you stop, it lets go and springs back (style.css). Only with the Springy switch on.
{
  const runs = new WeakMap();
  document.addEventListener('input', (e) => {
    const r = e.target; if (!state.spring || still || r.type !== 'range') return;
    const now = performance.now(), v = +r.value, span = (+r.max - +r.min) || 1, last = runs.get(r) || { v, t: now - 16, idle: 0 };
    const speed = Math.max(-1, Math.min(1, ((v - last.v) / span) / Math.max(8, now - last.t) * 60));   // a full sweep in a second is about 1
    const k = Math.min(1, Math.abs(speed) * 4);
    r.classList.add('pulling');
    r.style.setProperty('--tx', (-Math.sign(speed) * k * 4).toFixed(1) + 'px');
    r.style.setProperty('--tsx', (1 + k * 0.55).toFixed(3)); r.style.setProperty('--tsy', (1 - k * 0.24).toFixed(3));
    clearTimeout(last.idle);
    const idle = setTimeout(() => { r.classList.remove('pulling'); for (const n of ['--tx', '--tsx', '--tsy']) r.style.removeProperty(n); }, 90);
    runs.set(r, { v, t: now, idle });
  });
}

/* ---------- the Springy switch (top right) ---------- */
// Off (the start): calm. When you change something the pill is still pulled across, but nothing leans, squashes,
// overshoots or stretches. On: buttons lean and squash, small things pop, sliders stretch while you pull them.
{
  const box = $('#springTog');
  const apply = () => { document.documentElement.toggleAttribute('data-spring', state.spring); box.checked = state.spring; };
  box.addEventListener('change', () => { state.spring = box.checked; remember(); apply(); });
  apply();
}

/* ---------- the Glass switch (top right) ---------- */
// Two looks for the same page: Chalkboard's frosted look, and glass (round shapes, bright rims, inks in the sliders).
{
  const box = $('#glassTog');
  const apply = () => { document.documentElement.toggleAttribute('data-glass', state.glass); box.checked = state.glass; requestAnimationFrame(() => el.controls.querySelectorAll('.seg').forEach((sg) => placePill(sg, false))); };
  box.addEventListener('change', () => { state.glass = box.checked; remember(); apply(); });
  apply();
}

choose(state.id, true);
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
window.pm = { state, setPhoto };   // for the tests
