# Website research panel ka offline test (Playwright, nakli worker). Chalao: python3 tests/research_ui.py
import json, time, threading, http.server, functools, os, sys
from PIL import Image
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
Image.new('RGB', (600, 400), (40, 120, 60)).save('/tmp/lab.jpg')
srv = http.server.ThreadingHTTPServer(('127.0.0.1', 8767), functools.partial(http.server.SimpleHTTPRequestHandler, directory=ROOT))
threading.Thread(target=srv.serve_forever, daemon=True).start()
VIS = {'ok': True, 'model': 1, 'ms': 900, 'data': {'is_product': True, 'product_name': 'Actara', 'company': 'Syngenta', 'category': 'insecticide', 'active_ingredients': [{'name': 'Thiamethoxam', 'concentration': '25%'}], 'formulation': 'WG', 'approved_crops': ['onion'], 'target_pests': ['thrips'], 'dosage': '0.5 g/L', 'confidence': 80}}
import subprocess
# asli price engine se nakli search results par prices event banao
PXJS = r'''import {searchPrices} from '__P__';
const R=(url,title,content)=>({url,title,content});
const out=await searchPrices({name:'Actara',company:'Syngenta',formulation:'WG',ais:[{name:'Thiamethoxam',concentration:'25%'}]},async(q,o)=>({results:[
R('https://bighaat.com/a','Actara Thiamethoxam 25% WG 100 gm','MRP ₹ 520 ₹ 450 Free delivery'),R('https://agrostar.in/a','Actara Thiamethoxam 25% WG 250 gm','₹ 1,000 Delivery charges ₹ 50'),
R('https://www.amazon.in/dp/X1','Syngenta Actara 25% WG 100g','₹ 420'),R('https://gramophone.in/a','Actara 25 WG 100 gm','₹ 480 Free delivery'),R('https://kisanshop.in/b','Actara 25 WG 100 gm','₹ 455'),
R('https://cheap-unknown-shop.xyz/a','Actara 25% WG 100 gm','₹ 199'),R('https://jiomart.com/a','Areva Thiamethoxam 25% WG 100 gm','₹ 300')]}),'2026-11-21T10:00:00Z');
console.log(JSON.stringify(out));'''
open('/tmp/px.mjs','w').write(PXJS.replace('__P__', ROOT + '/worker/prices.js'))
PX = json.loads(subprocess.check_output(['node', '/tmp/px.mjs']))
def sse(evs): return ''.join('data: ' + json.dumps(e, ensure_ascii=False) + '\n\n' for e in evs)
GOOD = sse([{'type': 'start', 'web': 'keyless'}, {'type': 'step', 'id': 'reg', 'status': 'ok'},
  {'type': 'section', 'id': 'official', 'items': [{'field': 'dosage', 'label_mr': 'अधिकृत प्रमाण (dose)', 'text_mr': '0.5 ग्रॅम प्रति लिटर', 'source': {'title': 'ICAR-DOGR', 'url': 'https://dogr.icar.gov.in/x', 'source_type': 'official', 'retrieved_at': '2026-11-21T00:00:00Z'}}]},
  {'type': 'step', 'id': 'official', 'status': 'ok'}, {'type': 'step', 'id': 'price', 'status': 'ok'},
  dict({'type': 'prices'}, **PX),
  {'type': 'conflict', 'field': 'dosage', 'items': [{'value': '0.5 g/L', 'source': {'title': 'label', 'source_type': 'label_photo'}}, {'value': '1 g/L', 'source': {'title': 'TNAU', 'url': 'https://tnau.ac.in', 'source_type': 'official'}}]},
  {'type': 'done'}])
mode = {'r': 'good', 'n': 0}
def vision(route): route.fulfill(status=200, content_type='application/json', headers={'Access-Control-Allow-Origin': '*'}, body=json.dumps(VIS))
def research(route):
    mode['n'] += 1
    if mode['r'] == 'fail': return route.fulfill(status=500, body='x', headers={'Access-Control-Allow-Origin': '*'})
    if mode['r'] == 'slow': return  # jawab hi nahi — page ko khud thambvana padega
    route.fulfill(status=200, content_type='text/event-stream', headers={'Access-Control-Allow-Origin': '*'}, body=GOOD)
fails = 0
def ok(c, m):
    global fails; print(('PASS ' if c else 'FAIL ') + m); fails += 0 if c else 1
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={'width': 390, 'height': 800})
    errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.route('**/vision', vision); pg.route('**/research', research)
    pg.goto('http://127.0.0.1:8767/index.html'); pg.evaluate("localStorage.clear()"); pg.reload()
    pg.evaluate("show('scan')")
    def scan():
        pg.evaluate("localStorage.removeItem('viscache')")
        pg.set_input_files('#scUp', '/tmp/lab.jpg')
    # 1. sahi research
    scan(); pg.wait_for_selector('#scRes', timeout=20000)
    ok('Actara' in pg.inner_text('#scOut'), 'pehchaan turant dikhi')
    pg.wait_for_selector('#scRes:has-text("पूर्ण")', timeout=10000); t = pg.inner_text('#scRes')
    ok('0.5 ग्रॅम' in t and 'ICAR-DOGR' in t, 'verified dose + source link')
    b4 = pg.inner_text('#scBest')
    ok('सर्वोत्तम ऑनलाइन किंमत' in b4 and b4.count('पर्याय ') >= 4, 'best 4 dikhe')
    order = pg.evaluate("(()=>{const o=document.getElementById('scOut');const a=o.querySelector('#scBest'),f=o.querySelector('#scFields'),q=o.querySelector('.pq');return !!(a&&f&&q&&(a.compareDocumentPosition(f)&4)&&(f.compareDocumentPosition(q)&4))})()")
    ok(order, 'kram: pehchaan -> best 4 -> fields -> label jaankari')
    hrefs = pg.eval_on_selector_all('#scBest a.btn', 'e=>e.map(x=>[x.href,x.target])')
    ok(len(hrefs) == 4 and all(h[1] == '_blank' and h[0].startswith('https://') and h[0].rstrip('/') not in ('https://bighaat.com','https://agrostar.in') for h in hrefs), 'BUY NOW = asli product page, naya tab')
    ok('cheap-unknown-shop' not in ''.join(h[0] for h in hrefs) and 'jiomart' not in ''.join(h[0] for h in hrefs), 'anjaan / dusra brand top 4 me nahi')
    ok('agrostar' in hrefs[0][0], 'pehla: delivery jod kar sabse sasta per kg (AgroStar)')
    ok('अनोळखी/डीलर विक्रेता' in b4, 'sabse sasta anjaan seller ki chetavni')
    pg.click('#scBest [data-pall]'); ok(pg.locator('#scBest [data-ptab] table tr').count() >= 6, 'sab kimat table')
    pg.check('#scBest [data-pf=free]'); rows = pg.inner_text('#scBest [data-ptab] table'); ok('agrostar' not in rows.lower() and 'BigHaat' in rows, 'filter: mufat delivery')
    pg.uncheck('#scBest [data-pf=free]')
    fx = pg.inner_text('#scFields'); ok('📷 लेबल' in fx and '0.5 ग्रॅम' in fx and '✗' in fx, 'har field ki apni sthiti (label / online / nahi mili)')
    ok(pg.evaluate("Object.values(JSON.parse(localStorage.getItem('prhist'))).some(o=>o.rows.length>=4)"), 'kimat itihaas darj')
    pg.fill('#scBest [data-pat]', '5000'); pg.on('dialog', lambda d: d.accept()); pg.click('#scBest [data-pas]'); pg.wait_for_timeout(600)
    ok(pg.evaluate("Object.values(JSON.parse(localStorage.getItem('pralert'))).some(a=>a.hit)"), 'alert: lakshya se kam -> alert')
    ok('माझी निगराणी' in pg.inner_text('#scWatch'), 'nigrani list')
    ok('सरासरी काढत नाही' in t, 'conflict dikhaya')
    # 2. cache
    n = mode['n']; pg.evaluate("scShow(scHist()[0])"); pg.wait_for_selector('#scRes:has-text("जतन केलेले")', timeout=5000)
    ok(mode['n'] == n, 'cache se — dobara network nahi')
    # 3. research fail, pehchaan bani rahe
    pg.evaluate("localStorage.removeItem('rescache');for(const k in RES_MEM)delete RES_MEM[k]"); mode['r'] = 'fail'
    pg.evaluate("scShow(scHist()[0])"); pg.wait_for_selector('#scRes:has-text("संशोधन होऊ शकले नाही")', timeout=8000)
    ok('Actara' in pg.inner_text('#scOut'), 'research fail -> pehchaan dikhti rahi')
    # 4. thambva (cancel)
    mode['r'] = 'slow'; pg.evaluate("scShow(scHist()[0])"); pg.wait_for_selector('#scRes [data-rs]')
    ok(pg.locator('#scFields .spin').count() >= 5 and pg.locator('#scBest .spin').count() == 1, 'shodh chalu: har field par ghoomta loader')
    pg.click('#scRes [data-rs]')
    pg.wait_for_selector('#scRes:has-text("संशोधन थांबवले")', timeout=6000); ok(True, 'cancel kaam karta hai')
    # crop doctor: ghatak se kimat (pakke nidan ke baad ka button jaisa)
    mode['r'] = 'good'
    pg.evaluate("show('doctor');const d=document.getElementById('drOut');d.innerHTML='<div id=\"drBuy\"><div data-pbox></div><div data-pres></div></div>';research(d.querySelector('[data-pres]'),'prices',{name:'',ais:[{name:'Thiamethoxam'}]},false)")
    pg.wait_for_selector('[data-pbox]:has-text("पर्याय 1")', timeout=8000)
    ok('तुमचे पीक व हा रोग/कीड' in pg.inner_text('[data-pbox]'), 'crop doctor: ghatak ki kimat + lebal jaanchne ki chetavni')
    pg.evaluate("show('scan');scShow(scHist()[0])"); pg.wait_for_selector('#scBest:has-text("पर्याय 1")')
    pg.locator('#scBest').screenshot(path='/tmp/best4.png')
    pg.set_viewport_size({'width': 1280, 'height': 900}); pg.wait_for_timeout(300)
    ok(pg.evaluate("document.documentElement.scrollWidth<=1290"), 'desktop: bahar nahi failta')
    pg.set_viewport_size({'width': 360, 'height': 780}); pg.wait_for_timeout(300)
    ok(pg.evaluate("document.querySelector('#scBest').scrollWidth<=document.querySelector('#scBest').clientWidth+2"), 'mobile 360px: best-4 box fit')
    pg.screenshot(path='/tmp/res_ui.png', full_page=True)
    ok(not errs, 'JS error nahi ' + ';'.join(errs))
    b.close()
srv.shutdown(); print('SAB PASS' if not fails else f'{fails} FAIL'); sys.exit(1 if fails else 0)
