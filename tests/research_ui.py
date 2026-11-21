# Website research panel ka offline test (Playwright, nakli worker). Chalao: python3 tests/research_ui.py
import json, time, threading, http.server, functools, os, sys
from PIL import Image
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
Image.new('RGB', (600, 400), (40, 120, 60)).save('/tmp/lab.jpg')
srv = http.server.ThreadingHTTPServer(('127.0.0.1', 8767), functools.partial(http.server.SimpleHTTPRequestHandler, directory=ROOT))
threading.Thread(target=srv.serve_forever, daemon=True).start()
VIS = {'ok': True, 'model': 1, 'ms': 900, 'data': {'is_product': True, 'product_name': 'Actara', 'company': 'Syngenta', 'category': 'insecticide', 'active_ingredients': [{'name': 'Thiamethoxam', 'concentration': '25%'}], 'formulation': 'WG', 'approved_crops': ['onion'], 'target_pests': ['thrips'], 'dosage': '0.5 g/L', 'confidence': 80}}
def sse(evs): return ''.join('data: ' + json.dumps(e, ensure_ascii=False) + '\n\n' for e in evs)
GOOD = sse([{'type': 'start', 'web': 'keyless'}, {'type': 'step', 'id': 'reg', 'status': 'ok'},
  {'type': 'section', 'id': 'official', 'items': [{'field': 'dosage', 'label_mr': 'अधिकृत प्रमाण (dose)', 'text_mr': '0.5 ग्रॅम प्रति लिटर', 'source': {'title': 'ICAR-DOGR', 'url': 'https://dogr.icar.gov.in/x', 'source_type': 'official', 'retrieved_at': '2026-11-21T00:00:00Z'}}]},
  {'type': 'step', 'id': 'official', 'status': 'ok'}, {'type': 'step', 'id': 'price', 'status': 'ok'},
  {'type': 'prices', 'items': [{'seller': 'bighaat.com', 'price': '450', 'pack': '100 gm', 'url': 'https://bighaat.com/a', 'kind': 'online_listing', 'checked_at': '2026-11-21T00:00:00Z', 'same_product': True}]},
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
    ok('₹450' in t and 'आजची खात्रीशीर किंमत नाही' in t, 'kimat chetavni ke saath')
    ok('सरासरी काढत नाही' in t, 'conflict dikhaya')
    # 2. cache
    n = mode['n']; pg.evaluate("scShow(scHist()[0])"); pg.wait_for_selector('#scRes:has-text("जतन केलेले")', timeout=5000)
    ok(mode['n'] == n, 'cache se — dobara network nahi')
    # 3. research fail, pehchaan bani rahe
    pg.evaluate("localStorage.removeItem('rescache');for(const k in RES_MEM)delete RES_MEM[k]"); mode['r'] = 'fail'
    pg.evaluate("scShow(scHist()[0])"); pg.wait_for_selector('#scRes:has-text("संशोधन होऊ शकले नाही")', timeout=8000)
    ok('Actara' in pg.inner_text('#scOut'), 'research fail -> pehchaan dikhti rahi')
    # 4. thambva (cancel)
    mode['r'] = 'slow'; pg.evaluate("scShow(scHist()[0])"); pg.wait_for_selector('#scRes [data-rs]'); pg.click('#scRes [data-rs]')
    pg.wait_for_selector('#scRes:has-text("संशोधन थांबवले")', timeout=6000); ok(True, 'cancel kaam karta hai')
    pg.screenshot(path='/tmp/res_ui.png', full_page=True)
    ok(not errs, 'JS error nahi ' + ';'.join(errs))
    b.close()
srv.shutdown(); print('SAB PASS' if not fails else f'{fails} FAIL'); sys.exit(1 if fails else 0)
