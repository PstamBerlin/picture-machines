# The two looks side by side: Chalkboard's frosted look (the default) and Glass (the switch, top right).
import asyncio, os
from playwright.async_api import async_playwright
OUT = os.path.expanduser('~/picture-machines/tests/out'); URL = 'http://127.0.0.1:8791/docs/index.html'
UA = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36"
DONE = "!document.getElementById('result').hidden && document.getElementById('busy').hidden && window.pm.state.last && window.pm.state.last.id === window.pm.state.id"
async def main():
    async with async_playwright() as pw:
        b = await pw.chromium.launch(channel='chrome', headless=True)
        for glass in (False, True):
            tag = 'glass' if glass else 'frost'
            p = await b.new_page(viewport={'width': 1360, 'height': 900})
            await p.add_init_script("localStorage.setItem('picture-machines-v1', JSON.stringify({ id: 'comic', glass: %s }))" % ('true' if glass else 'false'))
            await p.goto(URL); await p.wait_for_timeout(1300); await p.screenshot(path=f'{OUT}/look-{tag}-empty.png')
            await p.click('#sampleBtn'); await p.wait_for_function(DONE, timeout=30000); await p.wait_for_function("document.querySelectorAll('.card canvas').length === 11", timeout=40000); await p.wait_for_timeout(900)
            await p.screenshot(path=f'{OUT}/look-{tag}.png'); await p.close()
            ctx = await b.new_context(viewport={'width': 390, 'height': 800}, device_scale_factor=2, has_touch=True, is_mobile=True, user_agent=UA); q = await ctx.new_page()
            await q.add_init_script("localStorage.setItem('picture-machines-v1', JSON.stringify({ id: 'glass', glass: %s }))" % ('true' if glass else 'false'))
            await q.goto(URL); await q.wait_for_timeout(900); await q.tap('#sampleBtn'); await q.wait_for_function(DONE, timeout=30000); await q.wait_for_timeout(2500)
            await q.screenshot(path=f'{OUT}/look-{tag}-phone.png'); await ctx.close()
        await b.close()
asyncio.run(main())
