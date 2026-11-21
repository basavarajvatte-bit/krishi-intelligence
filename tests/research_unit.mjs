// Worker /research ka offline test: fetch aur AI dono nakli (mock). Chalao: node tests/research_unit.mjs
import W from '../worker/worker.js';
const OFFICIAL_TXT = 'Integrated management. Thiamethoxam 25 WG is recommended against thrips in onion. Apply Thiamethoxam 25 WG at 0.5 g per litre of water at 15 days interval. Do not spray within 7 days before harvest. Wear gloves and mask while spraying.';
const OFFICIAL2_TXT = 'Thiamethoxam 25 WG can be used at 1.0 g per litre of water for onion thrips control in nursery and field conditions only.';
let scenario = 'normal';
globalThis.fetch = async (url, opt = {}) => {
  url = String(url);
  const J = (o, st = 200) => new Response(JSON.stringify(o), { status: st });
  if (scenario === 'down') throw new Error('network down');
  if (url.includes('search/title')) return J({ pages: [{ key: 'Thiamethoxam' }] });
  if (url.includes('page/summary')) return J({ title: 'Thiamethoxam', extract: 'Thiamethoxam is a systemic insecticide in the class of neonicotinoids. It acts on the nervous system of insects. It is used on many crops.', content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/Thiamethoxam' } } });
  if (url.includes('tavily')) {
    if (scenario === 'limit') return J({ detail: 'limit' }, 432);
    const b = JSON.parse(opt.body);
    if (b.include_domains && b.include_domains.includes('icar.org.in')) return J({ results: [
      { title: 'ICAR onion IPM', url: 'https://dogr.icar.gov.in/ipm', content: '', raw_content: OFFICIAL_TXT },
      ...(scenario === 'conflict' ? [{ title: 'TNAU onion', url: 'https://agritech.tnau.ac.in/onion', content: '', raw_content: OFFICIAL2_TXT }] : []),
      { title: 'Random blog', url: 'https://blog.example.com/x', content: '', raw_content: OFFICIAL2_TXT } ] });
    if (b.include_domains && b.include_domains.includes('bighaat.com')) return J({ results: [
      { title: 'Actara Thiamethoxam 25% WG 100 gm', url: 'https://www.bighaat.com/actara', content: 'Price ₹ 450 for 100 gm pack' },
      { title: 'Other brand Thiamethoxam 25 WG', url: 'https://agribegri.com/x', content: 'Thiamethoxam insecticide' } ] });
    return J({ results: [{ title: 'Syngenta Actara', url: 'https://www.syngenta.co.in/actara', content: '', raw_content: 'Actara is a Syngenta product. Actara should be stored in a cool dry place away from food.' }] });
  }
  return J({}, 404);
};
// nakli AI: field nikaalne ke liye text se seedha jawab
const AI = { run: async (m, { messages }) => {
  const u = messages[1].content;
  if (u.startsWith('Return {"mr"')) { const lines = u.split('\n').filter(l => /^\d+\. /.test(l)).map(l => 'मराठी: ' + l.replace(/^\d+\. /, '')); return { response: JSON.stringify({ mr: lines }) }; }
  const items = [];
  if (u.includes('0.5 g per litre')) items.push({ field: 'dosage', value: '0.5 g per litre', quote: 'Apply Thiamethoxam 25 WG at 0.5 g per litre of water at 15 days interval' },
    { field: 'phi', value: '7 days before harvest', quote: 'Do not spray within 7 days before harvest' },
    { field: 'dosage', value: '2 g per litre', quote: 'Apply Thiamethoxam at 2 g per litre always' });          // nakli quote -> hatna chahiye
  if (u.includes('1.0 g per litre')) items.push({ field: 'dosage', value: '1.0 g per litre', quote: 'Thiamethoxam 25 WG can be used at 1.0 g per litre of water' });
  if (u.includes('Actara should be stored')) items.push({ field: 'storage', value: 'store in cool dry place', quote: 'Actara should be stored in a cool dry place away from food' });
  return { response: 'Here: ' + JSON.stringify({ items }) };
} };
async function run(body) {
  const ps = []; const ctx = { waitUntil: p => ps.push(p) };
  const r = await W.fetch(new Request('https://x/research', { method: 'POST', body: JSON.stringify(body), headers: { 'cf-connecting-ip': '1' } }), { AI, DATA_GOV_KEY: 'test' }, ctx);
  const txt = await r.text(); await Promise.all(ps);
  return txt.split('\n\n').filter(Boolean).map(l => JSON.parse(l.slice(6)));
}
const prod = { kind: 'product', product: { name: 'Actara', company: 'Syngenta India', formulation: 'WG', ais: [{ name: 'Thiamethoxam', concentration: '25%' }], crops: ['onion'], dosage: '0.5 g/L' } };
let fail = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail++; };
for (const sc of ['normal', 'conflict', 'limit', 'down']) {
  scenario = sc; const ev = await run(prod);
  const sec = ev.filter(e => e.type === 'section').flatMap(e => e.items);
  const steps = Object.fromEntries(ev.filter(e => e.type === 'step').map(e => [e.id, e.status]));
  console.log(`--- ${sc}`, JSON.stringify(steps));
  ok(ev[0].type === 'start' && ev.at(-1).type === 'done', 'start…done');
  ok(sec.some(x => x.field === 'regulatory'), 'CIB&RC check hamesha');
  ok(!sec.some(x => /2 g per litre/.test(x.text_en || '')), 'nakli quote wali dose nahi');
  ok(!sec.some(x => (x.source?.url || '').includes('blog.example')), 'gair-sarkari site official me nahi');
  ok(sec.every(x => x.source && (x.source.url !== undefined)), 'har baat ke saath source');
  if (sc === 'normal') { ok(sec.some(x => x.field === 'dosage' && x.source.url.includes('icar')), 'official dose quote ke saath');
    ok(sec.some(x => x.field === 'storage' && x.source.source_type === 'manufacturer'), 'company page');
    const pr = ev.find(e => e.type === 'prices'); ok(pr && pr.items[0].price === '450' && pr.items[0].kind === 'online_listing', 'kimat ₹450 online_listing');
    ok(ev.some(e => e.type === 'unverified'), 'dusra brand = unverified (alternative nahi)');
    ok(!ev.some(e => e.type === 'conflict'), 'label 0.5 = ICAR 0.5 -> conflict nahi');
    ok(sec.some(x => x.text_mr.startsWith('मराठी')), 'Marathi anuvad'); }
  if (sc === 'conflict') { const c = ev.find(e => e.type === 'conflict'); ok(c && c.items.length >= 2, 'alag dose -> conflict, average nahi'); }
  if (sc === 'limit') ok(steps.official === 'limit' && steps.price === 'limit', 'limit status dikhta hai');
  if (sc === 'down') ok(steps.wiki === 'fail' || steps.wiki === 'none', 'source band -> fail status, crash nahi');
}
scenario = 'normal';
const ev = await run({ kind: 'disease', disease: { problem_en: 'purple blotch', crop: 'onion' } });
ok(ev.some(e => e.type === 'section' && e.id === 'how'), 'rog: Wikipedia');
ok(!ev.some(e => e.type === 'section' && e.items.some(i => i.field === 'dosage')), 'rog: koi dawa/dose nahi');
console.log(fail ? `\n${fail} FAIL` : '\nSAB PASS'); process.exit(fail ? 1 : 0);
