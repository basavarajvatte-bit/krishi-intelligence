# Ek baar ka test: nakli dawa-label ki photo banao aur Worker /vision ko bhejo.
import base64, io, json, urllib.request
from PIL import Image, ImageDraw, ImageFont
im = Image.new('RGB', (900, 600), 'white'); d = ImageDraw.Draw(im)
try: f = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 34); s = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 24)
except Exception: f = s = ImageFont.load_default()
lines = [('TESTCROP 5% SC', f), ('Fipronil 5% SC', s), ('Insecticide', s), ('Crops: Onion, Chilli', s), ('Target: Thrips', s), ('Dose: 1 ml per litre water', s), ('CIR No: 123456/TEST', s), ('Mfg: 01/2026  Exp: 12/2027', s)]
y = 30
for t, ft in lines: d.text((40, y), t, fill='black', font=ft); y += 60
d.polygon([(700, 450), (850, 450), (775, 580)], fill='yellow')
b = io.BytesIO(); im.save(b, 'JPEG', quality=85)
data = 'data:image/jpeg;base64,' + base64.b64encode(b.getvalue()).decode()
req = urllib.request.Request('https://krishi-mandi.basavarajvatte.workers.dev/vision', data=json.dumps({'task': 'label', 'image': data}).encode(), headers={'Content-Type': 'application/json', 'User-Agent': 'krishi-test'})
print(urllib.request.urlopen(req, timeout=120).read().decode()[:2000])
leaf = Image.new('RGB', (600, 400), (40, 130, 40)); d = ImageDraw.Draw(leaf)
for x, y0 in [(150, 150), (300, 220), (420, 120)]: d.ellipse([x, y0, x + 60, y0 + 30], fill=(120, 40, 110))
b = io.BytesIO(); leaf.save(b, 'JPEG'); data = 'data:image/jpeg;base64,' + base64.b64encode(b.getvalue()).decode()
req = urllib.request.Request('https://krishi-mandi.basavarajvatte.workers.dev/vision', data=json.dumps({'task': 'crop', 'crop': 'onion', 'part': 'leaf', 'image': data}).encode(), headers={'Content-Type': 'application/json', 'User-Agent': 'krishi-test'})
print(urllib.request.urlopen(req, timeout=120).read().decode()[:2000])
