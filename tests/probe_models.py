# Teeno models ko seedha Worker par asli jaisi photo se jaancho: samay + sahi JSON
import base64, io, json, time, urllib.request
from PIL import Image, ImageDraw, ImageFont
W = 'https://krishi-mandi.basavarajvatte.workers.dev/vision'
f = lambda n: ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', n)
im = Image.new('RGB', (1280, 960), (235, 235, 225)); d = ImageDraw.Draw(im)
for i, t in enumerate(['REGENT GOLD', 'Fipronil 5% SC', 'INSECTICIDE', 'Crops: Onion, Chilli', 'Pest: Thrips', 'Dose: 400 ml/acre', 'CIR: 1234/2019', 'Exp 02/2028']): d.text((60, 40 + i * 110), t, fill=(20, 20, 20), font=f(70 if i == 0 else 48))
def enc(img): b = io.BytesIO(); img.save(b, 'JPEG', quality=82); return 'data:image/jpeg;base64,' + base64.b64encode(b.getvalue()).decode()
leaf = Image.new('RGB', (960, 1280), (70, 140, 60)); d = ImageDraw.Draw(leaf)
for x, y in [(200, 300), (500, 700), (300, 1000)]: d.ellipse([x, y, x + 120, y + 60], fill=(110, 50, 100))
for task, img in [('label', enc(im)), ('crop', enc(leaf))]:
    for m in (1, 2, 3):
        t0 = time.time()
        try:
            r = json.loads(urllib.request.urlopen(urllib.request.Request(W, data=json.dumps({'task': task, 'model': m, 'crop': 'onion', 'part': 'leaf', 'image': img}).encode(), headers={'Content-Type': 'application/json', 'User-Agent': 'probe'}), timeout=90).read())
        except Exception as e: r = {'ok': False, 'msg': str(e)}
        print(f'{task} model{m} {time.time()-t0:.1f}s ok={r.get("ok")} {r.get("model","")} fixed={r.get("fixed")} code={r.get("code")} msg={str(r.get("msg",""))[:160]}')
        if r.get('ok'): print('   ', json.dumps(r['data'], ensure_ascii=False)[:420])
