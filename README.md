# Picture Machines

One photo in. Art, bricks or a 3D print out. A website by Peter Stam: drop a photo, pick a machine,
save what it made. Everything runs in your own browser; no photo is ever uploaded, and there are no
accounts, ads or tracking.

## The machines

Make a picture: **Paint** (real brush strokes), **Comic** (flat colours, ink, printing dots, a true
four-ink press), **Pixel**, **Sketch**, **Stained glass**, **Bricks** (with a parts list), **Poster print**.

Make a 3D print (each saves a watertight STL): **Lithophane**, **Cookie cutter**, **Stamp**, **Keychain tag**.

## How it is built

A plain static site in `docs/`, no build step.

| File | What it is |
|---|---|
| `index.html`, `style.css` | the page and its looks: **Poster** (the default since 18 Nov 2026, the block at the end of `style.css`, `html[data-style="poster"]`), the frosted **Old look** (switch in the top bar), and **Glass** for either one |
| `app.js` | the page: the photo, the cards, the controls, saving |
| `machines.js` | the list of machines and the knobs each one has |
| `worker.js` | runs a machine off the page's thread |
| `m2d.js`, `m3d.js` | the machines themselves |
| `lib.js` | the picture maths they share |

A new machine is one entry in `machines.js` and one function in `m2d.js` or `m3d.js`.

## Working on it

```bash
python3 -m http.server 8791 --bind 127.0.0.1 --directory .
```

Then open http://127.0.0.1:8791/docs/index.html. The tests need that server:

```bash
python3 tests/machines_test.py     # every machine on test pictures, and every STL checked for being watertight
python3 tests/site_test.py         # the site in a real browser, desktop and phone
python3 tests/shots.py             # screenshots into tests/out/
```

Before every commit that touches `docs/`, stamp the version so no browser runs a new page with an old script:

```bash
python3 tools/stamp.py
```
