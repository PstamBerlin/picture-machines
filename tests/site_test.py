# The site, checked in a real browser: a photo goes in, every machine makes something, the controls work,
# saving gives a real full-size PNG and a real STL, the pull handle snaps back, and a phone fits.
# Needs the local server: python3 -m http.server 8791 --bind 127.0.0.1 --directory ~/picture-machines
import asyncio, os, sys, struct
from playwright.async_api import async_playwright
URL = 'http://127.0.0.1:8791/docs/index.html'
UA = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36"
fails = []
def check(name, ok, detail=''):
    print(('PASS ' if ok else 'FAIL ') + name + (' ' + str(detail) if detail != '' else ''))
    if not ok: fails.append(name)
DONE = "!document.getElementById('result').hidden && document.getElementById('busy').hidden && window.pm.state.last && window.pm.state.last.id === window.pm.state.id"
async def settle(p): await p.wait_for_timeout(180); await p.wait_for_function(DONE, timeout=40000); await p.wait_for_timeout(120)
SIG = "(() => { const c = document.getElementById('after'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let s = 0; for (let i = 0; i < d.length; i += 97) s = (s * 31 + d[i]) >>> 0; return c.width + 'x' + c.height + ':' + s; })()"
async def main():
    async with async_playwright() as pw:
        b = await pw.chromium.launch(channel='chrome', headless=True)
        ctx = await b.new_context(viewport={'width': 1360, 'height': 860}, accept_downloads=True); p = await ctx.new_page(); errs = []
        p.on('pageerror', lambda e: errs.append(str(e))); p.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
        await p.goto(URL); await p.wait_for_timeout(900)
        st = await p.evaluate("({ drop: !document.getElementById('drop').hidden, cards: document.querySelectorAll('.card').length, on: document.querySelector('.card.on').dataset.id, save: document.getElementById('saveBtn').disabled, title: document.title })")
        check('a fresh visit: the drop zone, eleven machines, Paint chosen, nothing to save yet', st == {'drop': True, 'cards': 11, 'on': 'paint', 'save': True, 'title': 'Picture Machines'}, st)
        await p.click('#sampleBtn'); await settle(p)
        first = await p.evaluate(SIG)
        check('the sample goes in and Paint makes a picture', first.split(':')[1] != '0' and await p.evaluate("document.getElementById('stats').children.length") == 3, first)
        await p.wait_for_function("document.querySelectorAll('.card canvas').length === 11", timeout=40000)
        check('every card shows what its machine makes of this photo', True)
        # every machine
        ids = await p.evaluate("[...document.querySelectorAll('.card')].map((c) => c.dataset.id)"); sigs = {}
        for mid in ids:
            await p.click(f'.card[data-id="{mid}"]'); await settle(p); sigs[mid] = await p.evaluate(SIG)
        check('all eleven machines make something, each different', len(set(sigs.values())) == 11, sigs)
        cut = await p.evaluate("(() => { document.querySelector('.card[data-id=cutter]').click(); return 1; })()"); await settle(p)
        cs = await p.evaluate("window.pm.state.last.stats[0]")
        check('the cookie cutter finds the dragon, not the frame round the picture', 'cookie' in cs and not cs.startswith('80 × 80'), cs)
        # controls: a segment, a slider, a toggle each change the picture; the pill moves
        await p.click('.card[data-id="comic"]'); await settle(p); a = await p.evaluate(SIG)
        await p.click('#controls .seg button:has-text("Press")'); await settle(p); b2 = await p.evaluate(SIG)
        hid = await p.evaluate("[document.querySelector('[data-c=colors]').hidden, document.querySelector('[data-c=slip]').hidden]")
        check('a choice changes the picture and only the knobs that matter are shown', a != b2 and hid == [True, False], hid)
        pill = await p.evaluate("(() => { const s = document.querySelector('#controls .seg'), on = s.querySelector('button.on'), pl = s.querySelector('.pill'); const m = new DOMMatrix(getComputedStyle(pl).transform); return [Math.round(m.e) === on.offsetLeft, pl.offsetWidth === on.offsetWidth, on.textContent]; })()")
        check('the pill sits under the chosen option', pill == [True, True, 'Press'], pill)
        await p.evaluate("(() => { const i = document.querySelector('[data-c=dots] input'); i.value = 2.4; i.dispatchEvent(new Event('input', { bubbles: true })); })()"); await settle(p); c3 = await p.evaluate(SIG)
        await p.click('[data-c=frame] input'); await settle(p); c4 = await p.evaluate(SIG)
        check('a slider and a switch change the picture', b2 != c3 and c3 != c4)
        await p.reload(); await p.wait_for_timeout(700)
        kept = await p.evaluate("[window.pm.state.id, window.pm.state.opts.comic.style, window.pm.state.opts.comic.dots]")
        check('the machine and its settings are remembered', kept == ['comic', 'press', 2.4], kept)
        await p.click('#sampleBtn'); await settle(p); await p.click('#resetBtn'); await settle(p)
        check('Reset puts the machine back to its own settings', await p.evaluate("!window.pm.state.opts.comic && document.querySelector('#controls .seg button.on').textContent") == 'Retro')
        # pull to compare
        box = await p.evaluate("(() => { const r = document.getElementById('view').getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; })()")
        await p.mouse.move(box[0] + 13, box[1] + box[3] / 2); await p.mouse.down(); await p.mouse.move(box[0] + box[2] * 0.6, box[1] + box[3] / 2, steps=6); await p.wait_for_timeout(120)
        mid = await p.evaluate("[parseFloat(document.getElementById('view').style.getPropertyValue('--split')), getComputedStyle(document.getElementById('after')).clipPath]")
        await p.mouse.up(); await p.wait_for_timeout(900)
        end = await p.evaluate("parseFloat(document.getElementById('view').style.getPropertyValue('--split'))")
        check('pulling the handle shows the photo underneath, and it snaps back', 0.5 < mid[0] < 0.7 and 'inset' in mid[1] and end == 0, [mid, end])
        # saving
        await p.click('.card[data-id="pixel"]'); await settle(p)
        async with p.expect_download(timeout=60000) as dl: await p.click('#saveBtn')
        d = await dl.value; path = await d.path(); head = open(path, 'rb').read(32); w, h = struct.unpack('>II', head[16:24])
        check('Save gives a real PNG, bigger than the preview', head[:8] == b'\x89PNG\r\n\x1a\n' and d.suggested_filename == 'picture-machines-pixel.png' and max(w, h) >= 850, [d.suggested_filename, w, h])
        await p.wait_for_function(DONE)
        await p.click('.card[data-id="tag"]'); await settle(p)
        async with p.expect_download(timeout=60000) as dl: await p.click('#saveBtn')
        d = await dl.value; raw = open(await d.path(), 'rb').read(); n = struct.unpack('<I', raw[80:84])[0]
        check('a print machine saves a real STL', d.suggested_filename == 'picture-machines-keychain-tag.stl' and len(raw) == 84 + n * 50 and n > 1000, [d.suggested_filename, n])
        check('print machines offer the preview picture too, picture machines do not', await p.evaluate("!document.getElementById('save2Btn').hidden") and await p.evaluate("(() => { document.querySelector('.card[data-id=paint]').click(); return document.getElementById('save2Btn').hidden; })()"))
        await settle(p)
        # a file that is not a picture
        await p.evaluate("window.pm.setPhoto(new Blob(['not a picture'], { type: 'text/plain' }))"); await p.wait_for_timeout(400)
        check('a file that is not a picture is refused kindly', 'not a picture' in await p.evaluate("document.getElementById('toast').textContent"))
        check('no page errors', not errs, errs[:3])
        await ctx.close()
        # a phone
        ph = await b.new_context(viewport={'width': 390, 'height': 800}, device_scale_factor=2, has_touch=True, is_mobile=True, user_agent=UA); q = await ph.new_page(); perr = []; q.on('pageerror', lambda e: perr.append(str(e)))
        await q.goto(URL); await q.wait_for_timeout(800)
        check('phone: a Take a photo button', await q.evaluate("!document.getElementById('camBtn').hidden && document.getElementById('cam').getAttribute('capture') === 'environment'"))
        await q.tap('#sampleBtn'); await settle(q)
        fit = await q.evaluate("({ over: document.documentElement.scrollWidth - document.documentElement.clientWidth, view: document.getElementById('view').getBoundingClientRect().width, bar: document.querySelector('.bar').getBoundingClientRect().height, w: window.pm.state.last.w })")
        check('phone: nothing sticks out sideways, the header is one line, the picture fills the width', fit['over'] == 0 and fit['view'] > 300 and fit['bar'] < 70 and fit['w'] <= 440, fit)
        await q.tap('.card[data-id="bricks"]'); await settle(q)
        check('phone: a machine runs on a tap', (await q.evaluate("window.pm.state.last.id")) == 'bricks' and not perr, perr)
        await b.close()
    print('\n%d failures' % len(fails)); sys.exit(1 if fails else 0)
asyncio.run(main())
