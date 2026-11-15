// Picture Machines: the page. It holds the photo, builds the machine cards and the controls from
// machines.js, and asks the worker to run a machine whenever something changes. A small preview is
// made while you play with the settings; the full-size picture is only made when you save.
import { MACHINES, BY_ID, defaults } from './machines.js?v=55c5dab7';

const $ = (s) => document.querySelector(s);
const el = { drop: $('#drop'), result: $('#result'), view: $('#view'), before: $('#before'), after: $('#after'), wipe: $('#wipe'), busy: $('#busy'), busyText: $('#busyText'), busyBar: $('#busyBar'), stats: $('#stats'),
  pic: $('#picCards'), print: $('#printCards'), name: $('#machineName'), blurb: $('#machineBlurb'), controls: $('#controls'), save: $('#saveBtn'), save2: $('#save2Btn'), share: $('#shareBtn'), note: $('#note'),
  reset: $('#resetBtn'), newBtn: $('#newBtn'), pick: $('#pickBtn'), camBtn: $('#camBtn'), sample: $('#sampleBtn'), file: $('#file'), cam: $('#cam'), toast: $('#toast') };
const coarse = matchMedia('(pointer: coarse)').matches, still = matchMedia('(prefers-reduced-motion: reduce)').matches;
// how big the picture is at each step: small while you play, big when you save (phones get a little less)
const SIZE = { preview: coarse ? 440 : 600, full: coarse ? 1280 : 1600, print: 900, thumb: 132, keep: 2400 };
const LS = 'picture-machines-v1';
const saved = (() => { try { return JSON.parse(localStorage.getItem(LS)) || {}; } catch (e) { return {}; } })();
const state = { id: BY_ID[saved.id] ? saved.id : 'paint', opts: saved.opts && typeof saved.opts === 'object' ? saved.opts : {}, photo: null, last: null };
const remember = () => { try { localStorage.setItem(LS, JSON.stringify({ id: state.id, opts: state.opts })); } catch (e) { /* private window: nothing is remembered */ } };
const optsOf = (id) => { const o = defaults(id), mine = state.opts[id] || {}; for (const c of BY_ID[id].controls) if (c.id in mine) o[c.id] = mine[c.id]; return o; };

/* ---------- the worker ---------- */
// One runner = one worker. A newer request throws the running one away (the worker is restarted), so a
// slider you are dragging never waits for pictures you no longer want.
function runner() {
  let wk = null, job = 0, drop = null;
  return (id, src, opts, onProgress) => new Promise((done, fail) => {
    if (drop) { wk.terminate(); wk = null; drop(new Error('stale')); drop = null; }
    if (!wk) wk = new Worker('worker.js?v=55c5dab7', { type: 'module' });
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
  state.id = id; remember();
  for (const [k, b] of cards) { b.classList.toggle('on', k === id); b.setAttribute('aria-pressed', String(k === id)); }
  const m = BY_ID[id]; el.name.textContent = m.name; el.blurb.textContent = m.blurb;
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
      const paint = () => { out.textContent = (+i.value).toFixed(c.step < 1 ? (c.step < 0.1 ? 2 : 1) : 0) + (c.unit ? ' ' + c.unit : ''); i.style.setProperty('--fill', ((i.value - c.min) / (c.max - c.min) * 100).toFixed(1) + '%'); };
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
// The pill behind the chosen option is pulled across to the new one: its front edge runs ahead, so for a
// moment it is stretched over both and thinner, then its back edge lets go and it snaps together.
function spring(u) { if (u <= 0) return 0; if (u >= 1) return 1; const z = 0.5, wd = Math.sqrt(1 - z * z), w = -Math.log(0.004 * wd) / z; return 1 - Math.exp(-z * w * u) * (Math.cos(wd * w * u) + (z / wd) * Math.sin(wd * w * u)); }
function placePill(seg, animate) {
  const on = seg.querySelector('button.on'), pill = seg.querySelector('.pill'); if (!on) return;
  const to = { x: on.offsetLeft, y: on.offsetTop, w: on.offsetWidth, h: on.offsetHeight }, from = pill.at; pill.at = to;
  pill.style.width = to.w + 'px'; pill.style.height = to.h + 'px'; pill.style.transformOrigin = '0 50%'; pill.style.transform = 'translate(' + to.x + 'px,' + to.y + 'px)';
  if (!animate || !from || still || !pill.animate) return;
  const frames = [], N = 26, fwd = to.x + to.w / 2 > from.x + from.w / 2, far = Math.abs(to.x - from.x) || 1;
  for (let i = 0; i <= N; i++) {
    const t = i / N, lead = 1 - Math.pow(1 - Math.min(1, t / 0.44), 3), trail = spring((t - 0.16) / 0.84);
    const lo = from.x + (to.x - from.x) * (fwd ? trail : lead), hi = from.x + from.w + (to.x + to.w - from.x - from.w) * (fwd ? lead : trail), y = from.y + (to.y - from.y) * lead;
    const thin = from.y === to.y ? 1 - 0.34 * Math.min(1, Math.max(0, (hi - lo) - (from.w + (to.w - from.w) * t)) / far) : 1;
    frames.push({ transform: 'translate(' + lo.toFixed(2) + 'px,' + y.toFixed(2) + 'px) scale(' + (Math.max(4, hi - lo) / to.w).toFixed(4) + ',' + thin.toFixed(3) + ')' });
  }
  frames[N] = { transform: 'translate(' + to.x + 'px,' + to.y + 'px)' };
  pill.animate(frames, { duration: Math.min(700, 440 + far * 0.5), easing: 'linear' });
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

let toastTimer = 0;
function toast(text) { el.toast.textContent = text; el.toast.classList.add('on'); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.toast.classList.remove('on'), 3200); }

choose(state.id, true);
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
window.pm = { state, setPhoto };   // for the tests
