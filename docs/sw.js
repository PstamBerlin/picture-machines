/* Picture Machines works without a connection once it has been opened. The network is asked first, so a new
   version always wins; the stored copy is only used when there is no network.
   VERSION is written by tools/stamp.py from the site's contents, so every deploy renews the offline copy. */
const VERSION = "pictures-55c5dab7";
const FILES = ["./", "index.html", "style.css", "app.js", "machines.js", "worker.js", "lib.js", "m2d.js", "m3d.js", "sample.jpg", "icon.svg", "icon-192.png", "manifest.webmanifest",
  "fonts/Manrope-500.woff2", "fonts/Manrope-700.woff2", "fonts/Manrope-800.woff2", "fonts/Unbounded-800.woff2"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener("activate", (e) => { e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET" || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(fetch(e.request)
    .then((res) => { if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); } return res; })
    .catch(() => caches.match(e.request).then((hit) => hit || caches.match(e.request, { ignoreSearch: true }))));
});
