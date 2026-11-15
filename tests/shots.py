# Screenshots of the site: empty, with the sample, a few machines, and on a phone.
import asyncio, os, sys
from playwright.async_api import async_playwright
OUT = os.path.expanduser('~/picture-machines/tests/out'); os.makedirs(OUT, exist_ok=True)
URL = 'http://127.0.0.1:8791/docs/index.html'
UA = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36"
async def settle(p): await p.wait_for_function("!document.getElementById('result').hidden && document.getElementById('busy').hidden && window.pm.state.last", timeout=30000); await p.wait_for_timeout(700)
async def main():
    errs = []
    async with async_playwright() as pw:
        b = await pw.chromium.launch(channel='chrome', headless=True)
        p = await b.new_page(viewport={'width': 1360, 'height': 860}); p.on('pageerror', lambda e: errs.append(str(e))); p.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
        await p.goto(URL); await p.wait_for_timeout(1400); await p.screenshot(path=OUT + '/site-0-empty.png')
        await p.click('#sampleBtn'); await settle(p); await p.wait_for_timeout(2500); await p.screenshot(path=OUT + '/site-1-paint.png')
        for mid in sys.argv[1:] or ['comic', 'glass', 'cutter']:
            await p.click(f'.card[data-id="{mid}"]'); await p.wait_for_timeout(300); await settle(p); await p.screenshot(path=OUT + f'/site-2-{mid}.png')
        await p.close()
        ctx = await b.new_context(viewport={'width': 390, 'height': 800}, device_scale_factor=2, has_touch=True, is_mobile=True, user_agent=UA); q = await ctx.new_page(); q.on('pageerror', lambda e: errs.append('phone: ' + str(e)))
        await q.goto(URL); await q.wait_for_timeout(1200); await q.screenshot(path=OUT + '/phone-0-empty.png')
        await q.tap('#sampleBtn'); await settle(q); await q.wait_for_timeout(2000); await q.screenshot(path=OUT + '/phone-1-paint.png', full_page=True)
        over = await q.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
        print('phone sideways overflow px:', over)
        await b.close()
    print('errors:', errs[:5])
asyncio.run(main())
