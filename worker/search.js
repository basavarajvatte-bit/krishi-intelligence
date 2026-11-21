// ===================== WEB SEARCH PROVIDERS (fallback ke saath) =====================
// Har provider ek "adapter" hai: same input (query, {domains, max, raw}) -> same output {results:[{title,url,content,raw_content,favicon}]}.
// Kram: jiski chaabi (secret) Worker me ho, wahi chalta hai. Ek ki free limit khatam / error -> agla.
// Sab free tier, bina card. Koi paid service apne aap nahi.
//   TAVILY_API_KEY  -> Tavily (1,000 free / mahina)
//   SERPER_API_KEY  -> Serper.dev Google results (2,500 free, ek baar)
//   EXA_API_KEY     -> Exa (free mahina credit)
//   (koi chaabi nahi) -> Tavily keyless (bahut kam limit)
const T = (ms) => new Promise(r => setTimeout(r, ms));
async function fj(url, opt, ms = 15000) {
  const c = new AbortController(); const t = setTimeout(() => c.abort(), ms);
  try { const r = await fetch(url, { ...opt, signal: c.signal }); const txt = await r.text(); let j = null; try { j = JSON.parse(txt); } catch (e) {} return { status: r.status, j, txt }; }
  finally { clearTimeout(t); }
}
const LIMIT = s => s === 401 || s === 402 || s === 403 || s === 429 || s === 432 || s === 433;
export const PROVIDERS = [
  { id: 'tavily', key: 'TAVILY_API_KEY', async run(env, q, o) {
      const body = { query: q, search_depth: 'basic', max_results: Math.min(20, o.max || 5), include_raw_content: o.raw ? 'text' : false, include_favicon: true };
      if (o.domains) body.include_domains = o.domains;
      const r = await fj('https://api.tavily.com/search', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + env.TAVILY_API_KEY }, body: JSON.stringify(body) });
      if (LIMIT(r.status)) return { limit: true }; if (!r.j || !Array.isArray(r.j.results)) return { error: 'tavily ' + r.status };
      return { results: r.j.results };
    } },
  { id: 'serper', key: 'SERPER_API_KEY', async run(env, q, o) {
      // Google me "site:" filter; 16 site ek query me lambi ho jaati hai, isliye 2 hisse
      const doms = o.domains || [null]; const parts = o.domains ? [doms.slice(0, Math.ceil(doms.length / 2)), doms.slice(Math.ceil(doms.length / 2))] : [null];
      const out = [];
      for (const p of parts) {
        const qq = p ? `${q} (${p.map(d => 'site:' + d).join(' OR ')})` : q;
        const r = await fj('https://google.serper.dev/search', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-API-KEY': env.SERPER_API_KEY }, body: JSON.stringify({ q: qq, gl: 'in', hl: 'en', num: 10 }) });
        if (LIMIT(r.status)) { if (!out.length) return { limit: true }; break; }
        if (!r.j) return out.length ? { results: out } : { error: 'serper ' + r.status };
        (r.j.organic || []).forEach(x => out.push({ title: x.title, url: x.link, content: [x.snippet, x.price ? '₹' + x.price : '', (x.attributes ? Object.values(x.attributes).join(' ') : '')].filter(Boolean).join(' ') }));
      }
      return { results: out };
    } },
  { id: 'exa', key: 'EXA_API_KEY', async run(env, q, o) {
      const body = { query: q, numResults: Math.min(20, o.max || 5), contents: { text: { maxCharacters: o.raw ? 4000 : 600 } } };
      if (o.domains) body.includeDomains = o.domains;
      const r = await fj('https://api.exa.ai/search', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': env.EXA_API_KEY }, body: JSON.stringify(body) });
      if (LIMIT(r.status)) return { limit: true }; if (!r.j || !Array.isArray(r.j.results)) return { error: 'exa ' + r.status };
      return { results: r.j.results.map(x => ({ title: x.title || '', url: x.url, content: String(x.text || '').slice(0, 600), raw_content: o.raw ? x.text : '', favicon: x.favicon || null })) };
    } },
  { id: 'tavily_keyless', key: null, async run(env, q, o) {
      const body = { query: q, search_depth: 'basic', max_results: Math.min(20, o.max || 5), include_raw_content: o.raw ? 'text' : false, include_favicon: true };
      if (o.domains) body.include_domains = o.domains;
      const r = await fj('https://api.tavily.com/search', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Tavily-Access-Mode': 'keyless' }, body: JSON.stringify(body) });
      if (LIMIT(r.status)) return { limit: true }; if (!r.j || !Array.isArray(r.j.results)) return { error: 'keyless ' + r.status };
      return { results: r.j.results };
    } },
];
// Is Worker instance me kis provider ki limit khatam hui (thodi der yaad) aur kitni baar use hua
const DOWN = {}; export const USAGE = {};
export function available(env) { return PROVIDERS.filter(p => (!p.key || env[p.key]) && !(DOWN[p.id] > Date.now())); }
export async function multiSearch(env, q, o = {}, providers = PROVIDERS) {
  const tried = [];
  for (const p of providers) {
    if (p.key && !env[p.key]) continue;
    if (DOWN[p.id] > Date.now()) { tried.push(p.id + ':cooldown'); continue; }
    for (let attempt = 0; attempt < 2; attempt++) {           // ek baar dobara (thoda ruk kar)
      let r; try { r = await p.run(env, q, o); } catch (e) { r = { error: String(e).slice(0, 60) }; }
      USAGE[p.id] = (USAGE[p.id] || 0) + 1;
      if (r.results) return { results: r.results, provider: p.id, tried };
      if (r.limit) { DOWN[p.id] = Date.now() + 10 * 60 * 1000; tried.push(p.id + ':limit'); break; }
      tried.push(p.id + ':' + r.error); if (attempt === 0) await T(700);
    }
  }
  const allLimit = tried.length && tried.every(t => /limit|cooldown/.test(t));
  return { results: [], limit: allLimit, error: allLimit ? '' : tried.join(', '), tried };
}
