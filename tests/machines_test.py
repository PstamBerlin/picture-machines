# Runs every machine on the test pictures in a real browser, saves what each one made, and checks the 3D files.
#   python3 tests/machines_test.py [max size, default 700] [machine id ...]
# Needs the local server: python3 -m http.server 8791 --bind 127.0.0.1 --directory ~/picture-machines
import asyncio, sys, os, base64, json
from playwright.async_api import async_playwright
ROOT = os.path.expanduser('~/picture-machines'); OUT = ROOT + '/tests/out'; os.makedirs(OUT, exist_ok=True)
MAX = int(sys.argv[1]) if len(sys.argv) > 1 and sys.argv[1].isdigit() else 700
ONLY = [a for a in sys.argv[1:] if not a.isdigit()]
PIC = {'cutter': 'star.png', 'stamp': 'star.png', 'tag': 'star.png'}
fails = []
async def main():
    async with async_playwright() as pw:
        b = await pw.chromium.launch(channel='chrome', headless=True)
        p = await b.new_page(); errs = []; p.on('pageerror', lambda e: errs.append(str(e))); p.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
        await p.goto('http://127.0.0.1:8791/tests/harness.html'); await p.wait_for_function('window.run && window.MACHINES')
        machines = await p.evaluate('MACHINES.map((m) => [m.id, m.kind])')
        for mid, kind in machines:
            if ONLY and mid not in ONLY: continue
            url = '/tests/img/' + PIC.get(mid, 'scene.jpg')
            try:
                r = await p.evaluate('([id, url, max]) => run(id, url, max)', [mid, url, MAX])
            except Exception as e:
                print('FAIL', mid, str(e)[:400]); fails.append(mid); continue
            png = await p.evaluate("document.getElementById('c').toDataURL('image/png')")
            open(f'{OUT}/{mid}.png', 'wb').write(base64.b64decode(png.split(',')[1]))
            line = f"ok   {mid:8s} {r['ms']:5d} ms  {r['w']}x{r['h']}  " + ' | '.join(r['stats'])[:230]
            if kind == 'print':
                c = await p.evaluate('checkStl()')
                good = c['sizeOk'] and c['unmatchedEdges'] == 0 and c['tris'] > 100 and abs(c['zmin']) < 1e-6
                line += f"\n     3D file: {r['stlBytes']/1e6:.1f} MB, {c['tris']} triangles, watertight={c['unmatchedEdges'] == 0}, z {c['zmin']:.1f}..{c['zmax']:.1f} mm"
                if not good: fails.append(mid + ' stl'); line = 'FAIL' + line[4:]
            print(line)
        if errs: print('page errors:', errs[:3]); fails.append('errors')
        await b.close()
    print('\n%d failures' % len(fails)); sys.exit(1 if fails else 0)
asyncio.run(main())
