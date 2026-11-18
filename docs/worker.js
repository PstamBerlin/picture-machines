// Picture Machines: the worker. The page sends a picture and a machine's settings; the machine runs here,
// off the page's own thread, so the page stays smooth however long a picture takes.
import * as P from './m2d.js?v=e8a36fc0';
import * as T from './m3d.js?v=e8a36fc0';
import { flatten } from './lib.js?v=e8a36fc0';
import { BY_ID } from './machines.js?v=e8a36fc0';

const RUN = { paint: P.paint, comic: P.comic, pixel: P.pixel, sketch: P.sketch, glass: P.glass, bricks: P.bricks, poster: P.poster, litho: T.litho, cutter: T.cutter, stamp: T.stamp, tag: T.tag };
self.onmessage = (e) => {
  const { job, id, w, h, d, opts } = e.data, t0 = performance.now();
  const env = { canvas: (cw, ch) => new OffscreenCanvas(cw, ch), progress: (f) => self.postMessage({ job, progress: Math.max(0, Math.min(1, f)) }) };
  try {
    let src = { w, h, d: new Uint8ClampedArray(d) };
    if (BY_ID[id].kind === 'pic') src = flatten(src);            // a see-through picture is laid on white first
    const r = RUN[id](src, opts, env), out = r.out, send = { job, ok: true, id, w: out.w, h: out.h, d: out.d.buffer, stats: r.stats || [], parts: r.parts || null, stl: r.stl || null, file: r.file || id, ms: Math.round(performance.now() - t0) };
    self.postMessage(send, r.stl ? [out.d.buffer, r.stl] : [out.d.buffer]);
  } catch (err) { self.postMessage({ job, ok: false, error: String(err && err.stack || err) }); }
};
