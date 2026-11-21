# Live website par asli jaisi badi photo se scanner chalao, sab network/console error pakdo.
import json, sys, time
from PIL import Image, ImageDraw, ImageFont
from playwright.sync_api import sync_playwright
SITE = sys.argv[1] if len(sys.argv) > 1 else 'https://basavarajvatte-bit.github.io/krishi-intelligence/'
f = lambda n: ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', n)
im = Image.new('RGB', (4000, 3000), (235, 235, 225)); d = ImageDraw.Draw(im)
for i, t in enumerate(['REGENT GOLD', 'Fipronil 5% SC', 'INSECTICIDE', 'Crops: Onion, Chilli, Cabbage', 'Pest: Thrips, Aphids', 'Dose: 400 ml per acre in 200 L water', 'CIR: 1234/2019', 'Mfg 03/2026  Exp 02/2028']):
    d.text((200, 200 + i * 320), t, fill=(20, 20, 20), font=f(160 if i == 0 else 110))
im.save('/tmp/label_big.jpg', quality=92)                         # ~4000x3000 jaisa phone camera
im.save('/tmp/label.png'); im.resize((1600, 1200)).save('/tmp/label.webp', 'WEBP')
leaf = Image.new('RGB', (3000, 4000), (70, 140, 60)); d = ImageDraw.Draw(leaf)
for x, y in [(800, 1200), (1600, 2000), (1100, 2900), (2000, 900)]: d.ellipse([x, y, x + 300, y + 160], fill=(110, 50, 100), outline=(200, 200, 120), width=20)
leaf.save('/tmp/leaf_big.jpg', quality=90)
open('/tmp/not_image.jpg', 'w').write('hello this is not an image')
with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={'width': 393, 'height': 851}, is_mobile=True, has_touch=True, user_agent='Mozilla/5.0 (Linux; Android 13; RMX2170) AppleWebKit/537.36 Chrome/131 Mobile Safari/537.36')
    pg = ctx.new_page(); logs = []
    pg.on('console', lambda m: logs.append(f'console.{m.type}: {m.text}'))
    pg.on('pageerror', lambda e: logs.append(f'PAGEERROR: {e}'))
    pg.on('requestfailed', lambda r: logs.append(f'REQFAIL: {r.url[:80]} {r.failure}'))
    def resp(r):
        if '/vision' in r.url:
            try: logs.append(f'VISION {r.status}: {r.text()[:400]}')
            except Exception as e: logs.append(f'VISION {r.status}: (body nahi) {e}')
    pg.on('response', resp)
    pg.goto(SITE + '?t=' + str(time.time()), wait_until='networkidle'); pg.wait_for_timeout(2000)
    def run(sec, inp, out, path, wait=90):
        pg.evaluate(f"show('{sec}')"); t0 = time.time()
        pg.set_input_files(inp, path)
        while time.time() - t0 < wait:
            txt = pg.inner_text(out)
            if txt and '⏳' not in txt and 'ANALYS' not in txt.upper() and 'स्कॅन होत' not in txt: break
            pg.wait_for_timeout(1000)
        print(f'\n=== {sec} {path} ({time.time()-t0:.1f}s)\n' + pg.inner_text(out)[:700].replace('\n', ' | '))
    run('scan', '#scUp', '#scOut', '/tmp/label_big.jpg')
    run('scan', '#scUp', '#scOut', '/tmp/label.png')
    run('scan', '#scUp', '#scOut', '/tmp/label.webp')
    run('scan', '#scUp', '#scOut', '/tmp/not_image.jpg', 20)
    pg.evaluate("document.getElementById('drCrop') && (document.getElementById('drCrop').value='onion')")
    run('doctor', '#drUp', '#drOut', '/tmp/leaf_big.jpg')
    print('\n=== LOGS'); [print(l[:500]) for l in logs]
