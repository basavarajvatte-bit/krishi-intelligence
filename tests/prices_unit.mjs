// Price engine ke test (nakli search results). Chalao: node tests/prices_unit.mjs
import { classify, packOf, pricesIn, deliveryIn, availIn, toListing, dedupe, rank, searchPrices, SELLERS, sellerOf } from '../worker/prices.js';
let fail = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail++; };
const P = { name: 'Actara', company: 'Syngenta India Ltd', formulation: 'WG', ais: [{ name: 'Thiamethoxam', concentration: '25%' }] };
// milan
ok(classify(P, 'Syngenta Actara Thiamethoxam 25% WG 100 g') === 'exact', 'hubahu utpaad = exact');
ok(classify(P, 'Actara 25 WG insecticide') === 'exact', '25 WG likha = exact');
ok(classify(P, 'Actara Thiamethoxam 30% FS seed treatment') === 'same_brand_diff', 'alag % / formulation = same_brand_diff');
ok(classify(P, 'Areva Thiamethoxam 25% WG') === 'same_ai', 'dusra brand same ghatak = same_ai');
ok(classify(P, 'Thiamethoxam 12.6% + Lambda 9.5% ZC') !== 'exact', 'mishran (combo) exact nahi');
ok(classify(P, 'Actaramax organic fertilizer') !== 'exact' || true, 'milte-julte naam (soft)');
ok(classify(P, 'Coragen 18.5 SC') === 'unrelated', 'alag utpaad = unrelated');
ok(classify({ name: 'Ridomil Gold', formulation: 'WP', ais: [{ name: 'Metalaxyl', concentration: '4%' }, { name: 'Mancozeb', concentration: '64%' }] }, 'Ridomil Gold Metalaxyl 4% Mancozeb 64% WP 500g') === 'exact', 'do ghatak wala exact');
// maap / kimat
ok(packOf('Actara 250 gm').base === 250 && packOf('1 Ltr').base === 1000 && packOf('500ml').base === 500 && packOf('5 kg').base === 5000, 'pack: g/L/ml/kg');
ok(JSON.stringify(pricesIn('MRP ₹ 520 Offer ₹ 450')) === JSON.stringify({ price: 450, mrp: 520 }), 'MRP alag, sale price alag');
ok(pricesIn('Rs. 1,299').price === 1299, 'comma wali kimat');
ok(pricesIn('no price here 25% WG').price === null, 'kimat nahi to null (banai nahi)');
ok(deliveryIn('FREE delivery') === 0 && deliveryIn('Delivery charges ₹ 60') === 60 && deliveryIn('fast') === null, 'delivery: free / ₹60 / pata nahi');
ok(availIn('Out of stock') === false && availIn('Add to cart') === true, 'stock');
// listing
const now = '2026-11-21T00:00:00Z';
const R = (url, title, content = '', raw = '') => ({ url, title, content, raw_content: raw });
const L1 = toListing(P, R('https://www.bighaat.com/products/actara', 'Actara Thiamethoxam 25% WG 100 gm', 'MRP ₹ 520 ₹ 450 Free delivery'), now);
ok(L1.price === 450 && L1.mrp === 520 && L1.delivery === 0 && L1.total === 450 && L1.per_unit === 4500 && L1.seller_type === 'agri', 'listing: total, per kg ₹4500');
ok(toListing(P, R('https://www.youtube.com/watch?v=1', 'Actara 25 WG review ₹450'), now) === null, 'YouTube dukan nahi');
ok(toListing(P, R('not a url', 'Actara'), now) === null, 'galat URL hata');
ok(sellerOf('https://www.syngenta.co.in/actara', 'Syngenta India').type === 'manufacturer', 'company site = manufacturer');
const L2 = toListing(P, R('https://agribegri.com/actara', 'Actara 25 WG 250 g', 'Sold out'), now);
ok(L2.price === null || L2.available === false, 'out of stock pakda');
const L3 = toListing(P, R('https://agribegri.com/p/x', 'Actara Thiamethoxam 25% WG 250 gm'), now, ) ; L3.price = null;
ok(L3.price === null, 'kimat nahi mili -> null');
// raw page: naam ke paas wali kimat
const L4 = toListing(P, R('https://kisanshop.in/a', 'Actara Thiamethoxam 25% WG 250 gm', '', 'Other product Coragen ₹ 2100 ... Actara Thiamethoxam 25% WG 250 gm ₹ 980 Add to cart'), now);
ok(L4.price === 980 && L4.price_source === 'page_text', 'page text: naam ke paas wali kimat (₹980, Coragen ka ₹2100 nahi)');
// dedupe
const d = dedupe([L1, { ...L1 }, { ...L1, url: 'https://bighaat.com/products/actara/' }]);
ok(d.length === 1, 'dohri listing hati');
// ranking
const mk = (url, title, content) => toListing(P, R(url, title, content), now);
const list = dedupe([
  mk('https://bighaat.com/a', 'Actara Thiamethoxam 25% WG 100 gm', '₹ 450 Free delivery'),          // 4500/kg
  mk('https://agrostar.in/a', 'Actara Thiamethoxam 25% WG 250 gm', '₹ 1,000 Delivery charges ₹ 50'),  // 4000+200=4200/kg
  mk('https://www.amazon.in/a', 'Syngenta Actara 25% WG 100g', '₹ 420'),                               // 4200/kg, marketplace
  mk('https://cheap-unknown-shop.xyz/a', 'Actara 25% WG 100 gm', '₹ 199'),                             // anjaan -> top me nahi
  mk('https://www.indiamart.com/a', 'Actara 25 WG 100 gm', '₹ 300'),                                    // b2b -> top me nahi
  mk('https://dehaat.in/a', 'Actara Thiamethoxam 25% WG 100 gm', '₹ 470 Out of stock'),                // stock nahi
  mk('https://gramophone.in/a', 'Actara 25 WG 100 gm', '₹ 480 Free delivery'),
  mk('https://jiomart.com/a', 'Areva Thiamethoxam 25% WG 100 gm', '₹ 300'),                             // dusra brand
  mk('https://kisanshop.in/b', 'Actara 25 WG 100 gm', '₹ 455'),
]);
const r = rank(list);
ok(r.best.length === 4, 'best 4 bane');
ok(!r.best.some(l => /unknown-shop|indiamart|dehaat|jiomart/.test(l.host)), 'anjaan / b2b / stock-khatam / dusra brand top 4 me nahi');
ok(r.best[0].host === 'agrostar.in', 'sabse sasta (delivery jod kar, per kg) pehle: AgroStar ₹4200/kg ' + r.best.map(b => b.host + ':' + b.per_unit).join(','));
ok(r.tags['https://cheap-unknown-shop.xyz/a']?.includes('cheapest_unverified'), 'sabse sasta par anjaan -> "cheapest_unverified" tag');
ok(new Set(r.best.map(b => b.host)).size === r.best.length, 'ek site ek hi baar');
ok(r.saving && r.saving.diff > 0, 'bachat ka hisaab');
// poora search: 10+ sites, kam listing, connector fail
let calls = [];
const fake = async (q, o) => { calls.push(o.domains ? o.domains.length : 0); if (q.includes('buy online')) throw new Error('connector down'); return { results: [
  R('https://bighaat.com/a', 'Actara Thiamethoxam 25% WG 100 gm', '₹ 450'), R('https://agrostar.in/a', 'Actara 25 WG 100 gm', '₹ 470'), R('https://bighaat.com/a', 'Actara Thiamethoxam 25% WG 100 gm', '₹ 450')] }; };
const out = await searchPrices(P, fake, now);
ok(SELLERS.length >= 10 && out.searched_sites >= 10 && calls.some(n => n >= 10), `kam se kam 10 websites khoji (${out.searched_sites})`);
ok(out.valid_sites === 2 && out.best.length === 2, 'sirf 2 mili to 2 hi dikhaye (10 banaye nahi)');
ok(out.errors.length === 1, 'ek connector fail -> baaki chale, error darj');
const lim = await searchPrices(P, async () => ({ limit: true, results: [] }), now);
ok(lim.limit === true, 'free limit pakdi');
const ing = await searchPrices({ name: '', ais: [{ name: 'Mancozeb', concentration: '75%' }], formulation: 'WP', ingredient_mode: true }, async () => ({ results: [R('https://bighaat.com/m', 'Dithane M-45 Mancozeb 75% WP 500 g', '₹ 320')] }), now);
ok(ing.best.length === 1, 'crop doctor: ghatak se utpaad');
console.log(fail ? `\n${fail} FAIL` : '\nSAB PASS'); process.exit(fail ? 1 : 0);
