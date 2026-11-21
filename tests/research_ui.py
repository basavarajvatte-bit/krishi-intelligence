# Saral scanner result ka offline test (Playwright, nakli worker; kimat asli price-engine se). Chalao: python3 tests/research_ui.py
import json, threading, http.server, functools, os, sys, subprocess
from PIL import Image
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
Image.new('RGB', (600, 400), (40, 120, 60)).save('/tmp/lab.jpg')
srv = http.server.ThreadingHTTPServer(('127.0.0.1', 8767), functools.partial(http.server.SimpleHTTPRequestHandler, directory=ROOT))
threading.Thread(target=srv.serve_forever, daemon=True).start()
VIS = {'ok': True, 'model': 1, 'ms': 900, 'data': {'is_product': True, 'product_name': 'Actara', 'company': 'Syngenta', 'category': 'insecticide',
  'active_ingredients': [{'name': 'Thiamethoxam', 'concentration': '25%'}], 'formulation': 'WG', 'approved_crops': ['कापूस', 'भात'], 'target_pests': ['मावा', 'तुडतुडे'],
  'dosage': '0.5 ग्रॅम प्रति लिटर', 'application_method': 'पाण्यात मिसळून फवारणी', 'cir_reg_no': 'CIR-123', 'phi': '7 दिवस', 'confidence': 80}}
PXJS = r'''import {searchPrices} from '__P__';
const R=(url,title,content)=>({url,title,content});
const out=await searchPrices({name:'Actara',company:'Syngenta',formulation:'WG',ais:[{name:'Thiamethoxam',concentration:'25%'}]},async()=>({results:[
R('https://bighaat.com/products/actara-100','Actara Thiamethoxam 25% WG 100 gm','MRP ₹ 520 ₹ 450 Free delivery'),
R('https://agrostar.in/products/actara-250','Actara Thiamethoxam 25% WG 250 gm','₹ 1,000 Delivery charges ₹ 50'),
R('https://www.amazon.in/Syngenta-Actara/dp/B0A1','Syngenta Actara 25% WG 100g','₹ 420'),
R('https://gramophone.in/products/actara-100','Actara 25 WG 100 gm','₹ 430 Delivery charges ₹ 40'),
R('https://kisanshop.in/products/actara-100','Actara 25 WG 100 gm','₹ 455'),
R('https://cheap-unknown-shop.xyz/products/actara','Actara 25% WG 100 gm','₹ 199'),
R('https://jiomart.com/products/areva','Areva Thiamethoxam 25% WG 100 gm','₹ 300')]}),'2026-11-21T10:00:00Z');
console.log(JSON.stringify(out));'''
open('/tmp/px.mjs', 'w').write(PXJS.replace('__P__', ROOT + '/worker/prices.js'))
PX = json.loads(subprocess.check_output(['node', '/tmp/px.mjs']))
def sse(evs): return ''.join('data: ' + json.dumps(e, ensure_ascii=False) + '\n\n' for e in evs)
GOOD = sse([{'type': 'start', 'web': 'tavily'}, {'type': 'step', 'id': 'reg', 'status': 'ok'},
  {'type': 'section', 'id': 'how', 'items': [{'field': 'how', 'label_mr': 'x', 'text_mr': 'WIKI मजकूर', 'source': {'title': 'Wikipedia', 'url': 'https://en.wikipedia.org/wiki/T', 'source_type': 'encyclopedia'}}]},
  dict({'type': 'prices'}, **PX), {'type': 'step', 'id': 'price', 'status': 'ok'}, {'type': 'done'}])
LIMIT = sse([{'type': 'start', 'web': ''}, {'type': 'step', 'id': 'price', 'status': 'limit'}, {'type': 'done'}])
mode = {'r': 'good', 'n': 0}
def vision(route): route.fulfill(status=200, content_type='application/json', headers={'Access-Control-Allow-Origin': '*'}, body=json.dumps(VIS))
def research(route):
    mode['n'] += 1
    if mode['r'] == 'slow': return
    route.fulfill(status=200, content_type='text/event-stream', headers={'Access-Control-Allow-Origin': '*'}, body=GOOD if mode['r'] == 'good' else LIMIT)
fails = 0
def ok(c, m):
    global fails; print(('PASS ' if c else 'FAIL ') + m); fails += 0 if c else 1
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={'width': 390, 'height': 800})
    errs = []; pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('dialog', lambda d: d.accept())
    pg.route('**/vision', vision); pg.route('**/research', research)
    pg.goto('http://127.0.0.1:8767/index.html'); pg.evaluate("localStorage.clear()"); pg.reload(); pg.evaluate("show('scan')")
    # 1. dhimi kimat: naam turant, kimat par loader
    mode['r'] = 'slow'; pg.set_input_files('#scUp', '/tmp/lab.jpg'); pg.wait_for_selector('#scBest .spin', timeout=20000)
    ok('Actara – Syngenta' in pg.inner_text('#scOut') and 'कीटकनाशक' in pg.inner_text('#scOut'), 'naam + company + prakar turant')
    RES = "for(const k in RES_MEM)delete RES_MEM[k];localStorage.removeItem('rescache')"
    # 2. sahi nateeja
    mode['r'] = 'good'; pg.evaluate(RES + ";scShow(scHist()[0])"); pg.wait_for_selector('#scBest:has-text("सर्वात स्वस्त पर्याय")', timeout=8000)
    t = pg.inner_text('#scOut')
    ok('या उत्पादनाची सर्वात स्वस्त किंमत' in t and '🏆' in t, 'heading + 🏆')
    order = pg.evaluate("(()=>{const o=document.getElementById('scOut');const a=o.querySelector('#scBest'),u=o.querySelector('#scUse');return !!(a&&u&&(a.compareDocumentPosition(u)&4))})()")
    ok(order, 'kram: naam -> kimat -> upyog')
    hrefs = pg.eval_on_selector_all('#scBest a.btn', 'e=>e.map(x=>[x.href,x.target,x.textContent])')
    ok(len(hrefs) == 4 and all(h[1] == '_blank' and 'BUY NOW' in h[2] for h in hrefs), '4 BUY NOW, naye tab me')
    ok([h[0].split('/')[2].replace('www.', '') for h in hrefs] == ['amazon.in', 'bighaat.com', 'kisanshop.in', 'gramophone.in'], 'kram kul kimat se: ' + ','.join(h[0].split('/')[2] for h in hrefs))
    ok(hrefs[0][0] == 'https://www.amazon.in/Syngenta-Actara/dp/B0A1', 'BUY NOW = asli product page')
    ok('₹470' in t and 'डिलिव्हरी ₹40' in t, 'delivery jod kar total (₹430 + ₹40 = ₹470)')
    ok('cheap-unknown' not in ''.join(h[0] for h in hrefs) and 'jiomart' not in ''.join(h[0] for h in hrefs), 'anjaan / dusra brand nahi')
    u = pg.inner_text('#scUse')
    ok('कापूस' in u and 'मावा' in u and '0.5 ग्रॅम' in u and 'पाण्यात मिसळून' in u, 'upyog: pik, kide, padhat, praman')
    bad = ['CIR', 'PHI', 'Wikipedia', 'WIKI', 'बंदी यादी', 'Thiamethoxam', '25%', 'WG', 'मॉडेल', 'जतन केलेले', 'संशोधन', 'लेबलवर वाचता आले नाही']
    vis = pg.evaluate("document.getElementById('scOut').innerText")
    ok(not [w for w in bad if w in vis], 'faltu jaankari nahi dikhti: ' + ','.join(w for w in bad if w in vis))
    ok(pg.locator('#scOut #scRes').is_hidden(), 'research log chhupa hai')
    pg.click('#scBest [data-pall]'); ok(pg.locator('#scBest [data-ptab] table tr').count() >= 6, 'सर्व किंमती पहा -> table')
    pg.check('#scBest [data-pf=free]'); ok('agrostar' not in pg.inner_text('#scBest [data-ptab] table').lower(), 'filter chalta hai'); pg.uncheck('#scBest [data-pf=free]')
    # 3. sab provider limit -> pichhli sahi kimat (tareekh ke saath)
    mode['r'] = 'limit'; pg.evaluate(RES + ";scShow(scHist()[0])"); pg.wait_for_selector('#scBest:has-text("आत्ताची मिळाली नाही")', timeout=8000)
    ok('सर्वात स्वस्त पर्याय' in pg.inner_text('#scBest') and 'मर्यादा' not in pg.inner_text('#scOut'), 'limit -> pichhli kimat tareekh ke saath, "limit" sandesh nahi')
    # 4. kabhi kimat nahi mili
    pg.evaluate("localStorage.removeItem('prlast');" + RES + ";scShow(scHist()[0])"); pg.wait_for_selector('#scBest:has-text("सध्या ऑनलाइन किंमत उपलब्ध नाही.")', timeout=8000)
    ok(True, 'kimat nahi -> "सध्या ऑनलाइन किंमत उपलब्ध नाही."')
    # 5. desktop + mobile
    mode['r'] = 'good'; pg.evaluate(RES + ";scShow(scHist()[0])"); pg.wait_for_selector('#scBest:has-text("सर्वात स्वस्त पर्याय")')
    pg.locator('#scOut .card').first.screenshot(path='/tmp/simple.png')
    pg.set_viewport_size({'width': 1280, 'height': 900}); pg.wait_for_timeout(200); ok(pg.evaluate("document.documentElement.scrollWidth<=1290"), 'desktop theek')
    pg.set_viewport_size({'width': 360, 'height': 780}); pg.wait_for_timeout(200); ok(pg.evaluate("document.documentElement.scrollWidth<=362"), 'mobile 360px theek')
    # 6. crop doctor price (ghatak se) abhi bhi chalta hai
    pg.evaluate("""show('doctor');const d=document.getElementById('drOut');d.innerHTML='<div id="drBuy"><div data-pbox></div><div data-pres></div></div>';research(d.querySelector('[data-pres]'),'prices',{name:'',ais:[{name:'Thiamethoxam'}]},false)""")
    pg.wait_for_selector('[data-pbox]:has-text("पर्याय 1")', timeout=8000); ok(True, 'crop doctor kimat')
    ok(not errs, 'JS error nahi ' + ';'.join(errs))
    b.close()
srv.shutdown(); print('SAB PASS' if not fails else f'{fails} FAIL'); sys.exit(1 if fails else 0)
