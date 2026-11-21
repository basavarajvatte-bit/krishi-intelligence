// ===================== PRICE INTELLIGENCE ENGINE =====================
// Kaam: ek krishi utpaad ki online kimat kai websites par dhoondhna, sirf "hubahu wahi" utpaad milana,
// kimat ko pack size ke hisaab se barabar karna, aur sabse achhe 4 vikalp chunna.
// Niyam: kimat, seller, delivery ya link kabhi banaye nahi jaate — jo search result me likha hai wahi.
// Hisaab (arithmetic) aur ranking yahan seedhe code se hota hai, AI se nahi.

// ---- Seller connectors (naya seller jodna = is list me ek line) ----
// type: manufacturer (company ki apni dukaan) | agri (krishi retailer) | marketplace (Amazon jaisa, andar alag-alag seller) | b2b (dealer quote)
export const SELLERS = [
  { id: 'bighaat', name: 'BigHaat', domain: 'bighaat.com', type: 'agri' },
  { id: 'agrostar', name: 'AgroStar', domain: 'agrostar.in', type: 'agri' },
  { id: 'dehaat', name: 'DeHaat', domain: 'dehaat.in', type: 'agri' },
  { id: 'gramophone', name: 'Gramophone', domain: 'gramophone.in', type: 'agri' },
  { id: 'bharatagri', name: 'BharatAgri', domain: 'bharatagri.com', type: 'agri' },
  { id: 'agribegri', name: 'Agribegri', domain: 'agribegri.com', type: 'agri' },
  { id: 'kisanshop', name: 'KisanShop', domain: 'kisanshop.in', type: 'agri' },
  { id: 'krishidukan', name: 'Krishi Dukan', domain: 'krishidukan.com', type: 'agri' },
  { id: 'iffcobazar', name: 'IFFCO Bazar', domain: 'iffcobazar.in', type: 'agri' },
  { id: 'agriplex', name: 'Agriplex', domain: 'agriplex.in', type: 'agri' },
  { id: 'khethari', name: 'Khethari', domain: 'khethari.com', type: 'agri' },
  { id: 'unnati', name: 'Unnati', domain: 'unnatiagri.com', type: 'agri' },
  { id: 'amazon', name: 'Amazon', domain: 'amazon.in', type: 'marketplace' },
  { id: 'flipkart', name: 'Flipkart', domain: 'flipkart.com', type: 'marketplace' },
  { id: 'jiomart', name: 'JioMart', domain: 'jiomart.com', type: 'marketplace' },
  { id: 'indiamart', name: 'IndiaMART', domain: 'indiamart.com', type: 'b2b' },
];
const REL = { manufacturer: 3, agri: 2, marketplace: 1, b2b: 0, unknown: 0 };
const REL_MR = { manufacturer: 'कंपनीची स्वतःची दुकान', agri: 'ओळखीचा कृषी विक्रेता', marketplace: 'मार्केटप्लेस (आत वेगवेगळे विक्रेते)', b2b: 'डीलर कोटेशन (किरकोळ दर नाही)', unknown: 'अनोळखी वेबसाइट' };
// Ye site kabhi dukan nahi (blog, news, video)
const NOT_SHOP = /youtube\.com|wikipedia\.org|facebook\.com|instagram\.com|twitter\.com|x\.com|quora\.com|reddit\.com|\.gov\.in$|\.nic\.in$|icar|tnau|krishijagran|agrifarming|scribd|pinterest|tavily\.com|pricehistory|pricebefore|smartprix|mysmartprice|buyhatke|keepa/;
// Sirf asli product page (search / category / homepage nahi) — BUY NOW hamesha usi utpaad par jaaye
export function isProductPage(url) {
  let u; try { u = new URL(url); } catch (e) { return false; }
  const p = u.pathname.replace(/\/+$/, '').toLowerCase();
  if (!p || p === '/') return false;
  if (/[?&](k|q|s|search|query|keyword)=/i.test(u.search)) return false;
  if (/\/(dp|gp\/product|p|products?|proddetail|item)\//.test(p + '/')) return true;
  if (/(^|\/)(s|search|category|categories|collections?|technical|brands?|tags?|shop|store|catalog)(\/|$)/.test(p)) return false;
  return p.split('/').filter(Boolean).length >= 1 && /[a-z]-[a-z0-9]/.test(p);   // slug jaisa naam
}

export const host = u => { try { return new URL(u).hostname.replace(/^www\./, '').toLowerCase(); } catch (e) { return ''; } };
export function sellerOf(url, company = '') {
  const h = host(url); const s = SELLERS.find(x => h === x.domain || h.endsWith('.' + x.domain));
  if (s) return { ...s, host: h };
  const toks = String(company).toLowerCase().split(/[^a-z]+/).filter(t => t.length >= 4 && !['limited', 'india', 'private', 'crop', 'science', 'sciences', 'agro', 'chemicals', 'industries'].includes(t));
  if (toks.some(t => h.includes(t))) return { id: h, name: h, domain: h, type: 'manufacturer', host: h };
  return { id: h, name: h, domain: h, type: 'unknown', host: h };
}

// ---- Shabd / maap ----
const FORMS = ['WDG', 'WG', 'WP', 'EC', 'SC', 'SL', 'SP', 'GR', 'CS', 'OD', 'ZC', 'DP', 'FS', 'ME', 'EW', 'SG', 'SE', 'DS', 'WS', 'G'];
const lc = s => String(s || '').toLowerCase();
const num = s => +String(s).replace(/,/g, '');
export function formsIn(t) { const u = ' ' + String(t || '').toUpperCase().replace(/[^A-Z0-9%.]+/g, ' ') + ' '; return FORMS.filter(f => new RegExp(`[ \\d%]${f} `).test(u)).map(f => f === 'WDG' ? 'WG' : f); }
export function concsIn(t) { // "25%", "25 WG", "5% EC", "25 % w/w"
  const out = new Set(); const s = String(t || '');
  for (const m of s.matchAll(/(\d+(?:\.\d+)?)\s?%/g)) out.add(+m[1]);
  for (const m of s.matchAll(new RegExp(`(\\d+(?:\\.\\d+)?)\\s?(?:${FORMS.join('|')})\\b`, 'gi'))) out.add(+m[1]);
  return [...out];
}
// Pack: ml/g me
export function packOf(t) {
  const m = String(t || '').match(/(\d+(?:\.\d+)?)\s?(ml|millilit(?:re|er)s?|ltrs?|lit(?:re|er)s?|l|kgs?|kilograms?|gms?|grams?|g)\b/i);
  if (!m) return null; const v = +m[1], u = lc(m[2]);
  if (/^ml|millil/.test(u)) return { qty: v, unit: 'ml', base: v, kind: 'vol', text: m[0] };
  if (/^l|^lit|^ltr/.test(u)) return { qty: v, unit: 'L', base: v * 1000, kind: 'vol', text: m[0] };
  if (/^kg|^kilo/.test(u)) return { qty: v, unit: 'kg', base: v * 1000, kind: 'wt', text: m[0] };
  return { qty: v, unit: 'g', base: v, kind: 'wt', text: m[0] };
}
// Kimat: MRP alag, bechne ki kimat alag
export function pricesIn(t) {
  const s = String(t || ''); let mrp = null; const all = [];
  const mm = s.match(/m\.?r\.?p\.?[^₹\d]{0,12}(?:₹|rs\.?|inr)?\s?([\d,]{2,7}(?:\.\d{1,2})?)/i); if (mm) mrp = num(mm[1]);
  for (const m of s.matchAll(/(?:₹|rs\.?\s|inr\s?)\s?([\d,]{2,7}(?:\.\d{1,2})?)/gi)) { const v = num(m[1]); if (v >= 20 && v <= 200000) all.push(v); }
  const sale = all.find(v => v !== mrp) ?? (mrp ?? null);
  return { price: sale, mrp: mrp && sale && mrp > sale ? mrp : null };
}
export function deliveryIn(t) {
  const s = lc(t);
  if (/free (home )?(delivery|shipping)/.test(s)) return 0;
  const m = s.match(/(?:delivery|shipping)(?: charges?| fee)?[^₹\d]{0,10}(?:₹|rs\.?)\s?([\d,]{1,5})/); return m ? num(m[1]) : null;
}
export function availIn(t) {
  const s = lc(t);
  if (/out of stock|sold out|currently unavailable|notify me when available/.test(s)) return false;
  if (/in stock|add to cart|buy now|available/.test(s)) return true; return null;
}
export function etaIn(t) { const m = lc(t).match(/deliver(?:y|ed)? (?:in|within) (\d+)\s?(?:-|to)?\s?(\d+)?\s?days?/); return m ? { min: +m[1], max: +(m[2] || m[1]) } : null; }

// ---- Milan: hubahu wahi utpaad hai ya nahi ----
// P = { name, company, formulation, ais:[{name, concentration}] }
export function classify(P, text) {
  const t = lc(text), name = lc(P.name).trim();
  const nTok = name.split(/\s+/).filter(w => w.length >= 3);
  const nameHit = !!nTok.length && nTok.every(w => new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(t));
  const ais = (P.ais || []).filter(a => a && a.name);
  const aiHit = ais.length > 0 && ais.every(a => lc(a.name).split(/\s+/).filter(w => w.length >= 4).every(w => t.includes(w.slice(0, Math.max(5, w.length - 2)))));
  const want = ais.map(a => concsIn(a.concentration)[0] ?? concsIn(P.concentration || '')[0]).filter(x => x != null);
  const got = concsIn(text);
  const concOk = !want.length || !got.length || want.every(w => got.includes(w));
  const wf = formsIn(P.formulation)[0] || String(P.formulation || '').toUpperCase().replace(/[^A-Z]/g, '').replace('WDG', 'WG');
  const gf = formsIn(text);
  const formOk = !wf || !gf.length || gf.includes(wf);
  if (nameHit && concOk && formOk) return 'exact';   // naam + % + formulation mile (ghatak ka naam title me na ho to bhi)
  if (nameHit && (!concOk || !formOk)) return 'same_brand_diff';
  if (!nameHit && aiHit && concOk && formOk) return 'same_ai';
  if (aiHit && !concOk) return 'diff_conc';
  return 'unrelated';
}

// ---- Search result -> listing ----
export function toListing(P, r, now) {
  const txt = `${r.title || ''} ${r.content || ''}`, raw = String(r.raw_content || '');
  const sel = sellerOf(r.url, P.company);
  if (!sel.host || NOT_SHOP.test(sel.host) || !isProductPage(r.url)) return null;
  // raw page me utpaad ke naam ke paas ka hissa hi dekho (dusre utpaadon ki kimat na pakde)
  let near = ''; if (raw) { const key = lc(P.name).split(/\s+/)[0] || lc((P.ais || [])[0]?.name || '').split(/\s+/)[0]; const i = key ? lc(raw).indexOf(key) : -1; near = i >= 0 ? raw.slice(i, i + 1500) : ''; }
  let cls = classify(P, `${r.title || ''} ${(r.content || '').slice(0, 400)}`);
  if (P.ingredient_mode && cls === 'same_ai') cls = 'exact';   // crop doctor: ghatak se dhoondh rahe hain
  let p = pricesIn(txt), src = 'snippet'; if (p.price == null && near) { p = pricesIn(near); src = 'page_text'; }
  const pack = packOf(r.title) || packOf(txt) || (near ? packOf(near) : null);
  const delivery = deliveryIn(txt + ' ' + near), avail = availIn(txt + ' ' + near.slice(0, 600));
  return {
    seller_id: sel.id, website: sel.name, host: sel.host, seller_type: sel.type, reliability: REL[sel.type], reliability_mr: REL_MR[sel.type],
    title: String(r.title || '').slice(0, 140), url: r.url, favicon: r.favicon || null, match: cls,
    pack, price: p.price, mrp: p.mrp, discount: p.mrp && p.price ? p.mrp - p.price : null,
    delivery, total: p.price != null && delivery != null ? p.price + delivery : null,
    per_unit: p.price != null && pack && pack.base ? Math.round(p.price / pack.base * 1000) : null, unit_label: pack ? (pack.kind === 'vol' ? 'लिटर' : 'किलो') : null,
    available: avail, eta: etaIn(txt + ' ' + near), price_source: src, checked_at: now,
  };
}
export function dedupe(list) {
  const seen = new Set(), out = [];
  for (const l of list) {
    let path = ''; try { const u = new URL(l.url); path = u.hostname.replace(/^www\./, '') + u.pathname.replace(/\/+$/, ''); } catch (e) { continue; }
    const k2 = `${l.host}|${l.pack ? l.pack.base : ''}|${l.price}`;
    if (seen.has(path) || (l.price != null && seen.has(k2))) continue;
    seen.add(path); if (l.price != null) seen.add(k2); out.push(l);
  }
  return out;
}
// ---- Ranking (seedha code) ----
// Kharidne layak: hubahu utpaad, kimat pata, stock khatam nahi, seller pehchana hua (unknown/b2b nahi)
const buyable = l => l.match === 'exact' && l.price != null && l.per_unit != null && l.available !== false && l.reliability >= 1;
const cost = l => (l.per_unit ?? l.price) + (l.delivery ?? 0) * (l.pack && l.pack.base ? 1000 / l.pack.base : 1);
export function rank(list) {
  const exact = list.filter(l => l.match === 'exact' && l.price != null);
  const ok = list.filter(buyable).sort((a, b) => (a.per_unit == null) - (b.per_unit == null) || cost(a) - cost(b) || b.reliability - a.reliability || (a.delivery == null) - (b.delivery == null));
  // ek website se ek hi option top 4 me
  const best = []; for (const l of ok) { if (!best.find(b => b.host === l.host)) best.push(l); if (best.length === 4) break; }
  const cheapest = exact.slice().sort((a, b) => (a.per_unit == null) - (b.per_unit == null) || cost(a) - cost(b))[0] || null;
  const verified = ok.filter(l => l.reliability >= 2)[0] || null;
  const fastest = ok.filter(l => l.eta).sort((a, b) => a.eta.min - b.eta.min)[0] || null;
  const tags = {};
  if (best[0]) tags[best[0].url] = ['best_value'];
  if (cheapest) (tags[cheapest.url] ||= []).push(buyable(cheapest) ? 'cheapest' : 'cheapest_unverified');
  if (verified) (tags[verified.url] ||= []).push('best_verified');
  if (fastest) (tags[fastest.url] ||= []).push('fastest');
  const pu = ok.map(l => l.per_unit).filter(x => x != null);
  const saving = pu.length >= 2 ? { min: Math.min(...pu), max: Math.max(...pu), diff: Math.max(...pu) - Math.min(...pu) } : null;
  return { best, tags, saving };
}

// ---- Poora price search (Tavily search API se; sirf permitted search, koi scraping/CAPTCHA bypass nahi) ----
// search(query, opts) -> { results, limit, error }
export async function searchPrices(P, search, now = new Date().toISOString()) {
  const name = String(P.name || '').trim(), ai = (P.ais || []).map(a => a.name).filter(Boolean).join(' '), conc = (P.ais || []).map(a => a.concentration).filter(Boolean).join(' ');
  const form = P.formulation || '';
  const queries = [];
  if (name) {
    queries.push({ q: `${name} ${ai} ${conc} ${form} price`.replace(/\s+/g, ' '), domains: SELLERS.map(s => s.domain), max: 20, raw: true, why: 'sellers' });
    queries.push({ q: `${name} ${conc} ${form} buy online price India`.replace(/\s+/g, ' '), max: 10, raw: true, why: 'discover' });
  }
  if (ai) queries.push({ q: `${ai} ${conc} ${form} price buy`.replace(/\s+/g, ' '), domains: SELLERS.map(s => s.domain), max: 15, raw: true, why: 'ingredient' });
  const res = await Promise.all(queries.map(q => search(q.q, { domains: q.domains, max: q.max, raw: q.raw }).catch(e => ({ error: String(e), results: [] }))));
  const limit = res.some(r => r.limit) && res.every(r => r.limit || !r.results.length);
  const all = []; const responded = new Set();
  res.forEach(r => (r.results || []).forEach(x => { const h = host(x.url); if (h) responded.add(h); const l = toListing(P, x, now); if (l) all.push(l); }));
  const listings = dedupe(all).filter(l => l.match !== 'unrelated');
  const { best, tags, saving } = rank(listings);
  const exactSites = new Set(listings.filter(l => l.match === 'exact').map(l => l.host));
  return {
    searched_sites: SELLERS.length, extra_discovered: [...responded].filter(h => !SELLERS.some(s => h === s.domain || h.endsWith('.' + s.domain))).length,
    responded_sites: responded.size, valid_sites: exactSites.size, queries: queries.length,
    listings: listings.sort((a, b) => (a.match !== 'exact') - (b.match !== 'exact') || (a.per_unit ?? 1e9) - (b.per_unit ?? 1e9)).slice(0, 40),
    best, tags, saving, limit, errors: res.filter(r => r.error).map(r => String(r.error).slice(0, 80)), checked_at: now,
  };
}
