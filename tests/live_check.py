# The live site, checked in a real browser: it loads over https, the sample goes in, machines run, a 3D file is built.
import asyncio, sys
from playwright.async_api import async_playwright
URL = 'https://pictures.peterstam.eu/'
DONE = "!document.getElementById('result').hidden && document.getElementById('busy').hidden && window.pm.state.last && window.pm.state.last.id === window.pm.state.id"
async def main():
    async with async_playwright() as pw:
        b = await pw.chromium.launch(channel='chrome', headless=True, args=['--host-resolver-rules=MAP pictures.peterstam.eu 185.199.108.153'])
        p = await b.new_page(viewport={'width': 1360, 'height': 860}); errs = []; p.on('pageerror', lambda e: errs.append(str(e))); p.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
        await p.goto(URL); await p.wait_for_timeout(1500)
        print('title:', await p.title(), '| secure:', await p.evaluate('isSecureContext'), '| cards:', await p.evaluate("document.querySelectorAll('.card').length"))
        await p.click('#sampleBtn'); await p.wait_for_function(DONE, timeout=40000)
        print('paint:', await p.evaluate("window.pm.state.last.stats[0]"))
        await p.click('.card[data-id="cutter"]'); await p.wait_for_timeout(300); await p.wait_for_function(DONE, timeout=40000)
        print('cutter:', await p.evaluate("window.pm.state.last.stats[0] + ' | 3D file bytes ' + window.pm.state.last.stl.byteLength"))
        await p.wait_for_timeout(2500)
        print('offline worker:', await p.evaluate("navigator.serviceWorker.getRegistration().then((r) => !!r)"))
        print('errors:', errs[:3]); await b.close()
asyncio.run(main())
