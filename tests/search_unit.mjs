// Search provider fallback ka test. Chalao: node tests/search_unit.mjs
import { multiSearch, PROVIDERS } from '../worker/search.js';
let fail = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail++; };
const J = (o, st = 200) => new Response(JSON.stringify(o), { status: st });
let mode = {}; const hits = [];
globalThis.fetch = async (url, opt) => { url = String(url); hits.push(url);
  if (url.includes('tavily')) { const kl = opt.headers['X-Tavily-Access-Mode']; const m = kl ? mode.keyless : mode.tavily;
    if (m === 'limit') return J({}, 432); if (m === 'err') return J({}, 500); return J({ results: [{ title: kl ? 'K' : 'T', url: 'https://a.in/p-x' }] }); }
  if (url.includes('serper')) { if (mode.serper === 'limit') return J({}, 403); const b = JSON.parse(opt.body); return J({ organic: [{ title: 'S ' + b.q.slice(0, 20), link: 'https://bighaat.com/products/x', snippet: '₹ 450' }] }); }
  if (url.includes('exa')) { if (mode.exa === 'limit') return J({}, 402); return J({ results: [{ title: 'E', url: 'https://e.in/p-y', text: 'x' }] }); }
};
const fresh = async () => { const m = await import('../worker/search.js?' + Math.random()); return m.multiSearch; };   // naya instance (cooldown saaf)
const ENV = { TAVILY_API_KEY: 't', SERPER_API_KEY: 's', EXA_API_KEY: 'e' };
let ms = await fresh(); mode = {}; let r = await ms(ENV, 'actara');
ok(r.provider === 'tavily' && r.results[0].title === 'T', 'pehla provider Tavily');
ms = await fresh(); mode = { tavily: 'limit' }; r = await ms(ENV, 'actara', { domains: ['bighaat.com', 'agrostar.in', 'dehaat.in'] });
ok(r.provider === 'serper' && r.results.length === 2, 'Tavily limit -> Serper (site: filter ke 2 hisse)');
ms = await fresh(); mode = { tavily: 'limit', serper: 'limit' }; r = await ms(ENV, 'actara');
ok(r.provider === 'exa', 'Tavily + Serper limit -> Exa');
ms = await fresh(); mode = { tavily: 'limit', serper: 'limit', exa: 'limit', keyless: 'limit' }; r = await ms(ENV, 'actara');
ok(r.results.length === 0 && r.limit === true, 'sab limit -> khali + limit (koi paid nahi)');
ms = await fresh(); mode = { tavily: 'err' }; hits.length = 0; r = await ms(ENV, 'actara');
ok(r.provider === 'serper' && hits.filter(h => h.includes('tavily')).length === 2, 'error -> ek baar dobara, phir agla');
ms = await fresh(); mode = {}; r = await ms({}, 'actara');
ok(r.provider === 'tavily_keyless', 'koi chaabi nahi -> keyless');
ms = await fresh(); mode = { tavily: 'limit' }; await ms(ENV, 'a'); hits.length = 0; r = await ms(ENV, 'b');
ok(!hits.some(h => h.includes('tavily.com')) || r.provider !== 'tavily', 'limit wala provider kuch der chhoda (cooldown)');
console.log(fail ? `\n${fail} FAIL` : '\nSAB PASS'); process.exit(fail ? 1 : 0);
