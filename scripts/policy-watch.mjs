// Sarkari faisle tracker: PIB aur news (RSS) padhta hai, kheti wali khabar chunta hai,
// GitHub ke free AI model se aasaan Hindi/Marathi me samjhata hai, aur data/policy-auto.json me rakhta hai.
// GitHub Action chalata hai (har 6 ghante). Koi chaabi nahi chahiye: GitHub ka apna GITHUB_TOKEN kaafi hai.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const OUT = path.resolve('data/policy-auto.json');
const TOKEN = process.env.GITHUB_TOKEN;
const MODEL = process.env.POLICY_MODEL || 'openai/gpt-4o-mini';
const MAX_NEW = +(process.env.MAX_NEW || 8);
const DRY = process.argv.includes('--dry');          // bina internet ke test: sample feed se
const KEEP = 150;

// Sarkari website = "सरकारी पुष्टि". Baaki sab = "ख़बर, सरकारी पुष्टि बाकी".
const OFFICIAL = ['pib.gov.in', 'dgft.gov.in', 'newsonair.gov.in', 'cbic.gov.in', 'agriwelfare.gov.in', 'consumeraffairs.nic.in',
  'dfpd.gov.in', 'fci.gov.in', 'apeda.gov.in', 'egazette.gov.in', 'commerce.gov.in', 'agmarknet.gov.in', 'fao.org', 'usda.gov'];

const gnews = q => `https://news.google.com/rss/search?q=${encodeURIComponent(q + ' when:3d')}&hl=en-IN&gl=IN&ceid=IN:en`;
const FEEDS = [
  { url: 'https://pib.gov.in/RssMain.aspx?ModId=6&Lang=1&Regid=3', name: 'PIB' },
  ...['India onion export', 'India edible oil import duty', 'India soybean import OR soymeal export', 'India cotton import duty',
    'India pulses import tur OR chana OR urad OR yellow peas', 'India wheat stock limit OR wheat import OR OMSS',
    'India sugar export quota', 'India rice export', 'MSP cabinet kharif OR rabi', 'DGFT notification agriculture import',
    'India maize import OR ethanol maize', 'Brazil soybean crop OR Argentina soybean', 'China soybean import',
    'USDA WASDE soybean OR cotton OR wheat', 'monsoon IMD forecast crop'].map(q => ({ url: gnews(q), name: 'Google News' }))
];

const CROP_WORDS = { onion: /onion|kanda|pyaz/i, soybean: /soy|edible oil|palm oil|sunflower oil|oilseed/i, cotton: /cotton|kapas/i,
  wheat: /wheat|atta/i, rice: /rice|paddy|basmati/i, tur: /\btur\b|arhar|pigeon pea|pulses|dal\b|urad|yellow pea/i,
  gram: /gram|chana|chickpea/i, sugar: /sugar|sugarcane|ethanol/i, maize: /maize|corn\b/i, tomato: /tomato/i };
const POLICY_WORDS = /export|import|duty|ban|MSP|minimum support|procure|buffer|stock limit|subsid|DGFT|tariff|quota|MEP|OMSS|crop|harvest|monsoon|production|WASDE/i;

const sha = s => crypto.createHash('sha1').update(s).digest('hex').slice(0, 12);
const norm = s => String(s).toLowerCase().replace(/ - [^-]+$/, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const unxml = s => String(s || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, ' ')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();
const tag = (x, t) => { const m = new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`, 'i').exec(x); return m ? unxml(m[1]) : ''; };
const host = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };

function parseRSS(xml, feedName) {
  return [...xml.matchAll(/<item[\s>][\s\S]*?<\/item>/gi)].map(([it]) => {
    const srcM = /<source[^>]*url="([^"]+)"[^>]*>([\s\S]*?)<\/source>/i.exec(it);
    const link = tag(it, 'link');
    const srcUrl = srcM ? srcM[1] : link;
    return { title: tag(it, 'title'), link, summary: tag(it, 'description').slice(0, 600), date: tag(it, 'pubDate'),
      srcName: srcM ? unxml(srcM[2]) : feedName, srcHost: host(srcUrl) };
  }).filter(i => i.title && i.link);
}

async function get(url) {
  const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 krishi-intelligence' }, signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.text();
}

const SYSTEM = `Tum Indian kisanon ke liye kheti-bazaar salahkar ho. Tumhe ek khabar ka title aur chhota hissa milega.

KAB "relevant":true:
- Sirf tab jab khabar me koi PAKKA EVENT ho: sarkari faisla (import/export ban, duty, MEP, MSP, kharid, stock limit, buffer bikri, subsidy),
  sarkari/official aankda (utpadan anuman, aayat-niryat aankda), ya duniya ka bada event (bade desh ka faisla, sookha/baadh, fasal report).
- Opinion, "kya hoga?" wale sawal-lekh, company/share bazaar, videsh ki local mandi report (jaise Detroit), market research report = {"relevant":false}.

BAZAAR KE PAKKE NIYAM (dir inhi se tay karo, ulta kabhi nahi):
1. Desh me maal zyada (zyada utpadan, zyada aayat, aayat duty kam, aayat chhoot, buffer stock bechna, stock limit) => is fasal ka bhav GIRNE ka dabav => "neg".
2. Desh me maal kam (kam utpadan, sookha/baadh se nuksan, niryat khulna/badhna, niryat duty hatna, aayat duty badhna, sarkari kharid) => bhav BADHNE ki sambhavna => "pos".
3. Niryat par ban/duty/MEP lagna => desh me maal rukta hai => kisan ka bhav GIRTA hai => "neg".
4. Khane ka tel (palm/soybean/sunflower oil) sasta aayat = soybean/moongfali/sarso kisan ke liye "neg" (unki maang ghatti hai). Tel aayat duty badhna = un kisanon ke liye "pos".
5. MSP badhna = neeche ka sahara => "pos" (par kharid har jagah nahi hoti, ye bhi likho). Kapas aayat chhoot = kapas kisan ke liye "neg".
6. Duniya me kisi fasal ka bada utpadan (Brazil soybean record etc.) = duniya ka bhav neeche => Indian kisan ke liye "neg". Duniya me kami = "pos".
7. Kisanon/vyapariyon ki MAANG, virodh, ya mantri ka "vichar kar rahe hain" = abhi faisla NAHI hua => "neu", conf "low", aur effect me likho ki faisla hone par hi asar hoga.
8. Agar pakka na lage ya asar bahut chhota ho => "neu" aur conf "low".
Yaad rakho: "upbhokta ke liye sasta" ka matlab aksar "kisan ke liye kam bhav" hota hai.

LIKHNE KE NIYAM:
- Sirf diye gaye text ke facts. Koi number, date, matra ya desh khud se mat banao. Text me nahi to null.
- Bahut aasaan bhasha: 10 saal ka bachcha samjhe. Angrezi shabd (tariff, duty) ka sahi Hindi matlab do: tariff/duty = "टैक्स / शुल्क".
- "effect" me pehle seedha bolo: bhav badhega/girega/khaas asar nahi, phir ek line me kyun (upar ka niyam).
- type: import | export | msp (sirf MSP/sarkari kharid) | policy (baaki sarkari niti, aankde) | intl (videsh ki khabar).
Sirf JSON do (ek hi object, uske baad kuch nahi):
{"relevant":true,"crops":["onion|soybean|cotton|wheat|rice|tur|gram|sugar|maize|tomato|oilseed|other"],
"type":"","dir":"pos|neg|neu","when":"short|medium|long","conf":"high|medium|low","priority":"high|normal",
"qty":"text me di gayi matra ya null","date":"YYYY-MM-DD ya null",
"hi":{"title":"","what":"Kya hua (2 line)","why":"Kyun (text me nahi to 'ख़बर में कारण नहीं बताया गया')","effect":""},
"mr":{"title":"","what":"","why":"","effect":""}}
hi = Hindi (Devanagari), mr = Marathi (Devanagari).`;

// Do AI raaste: (1) GitHub Models — agar account par chalu ho, (2) apna Cloudflare Worker + free Workers AI.
const WORKER = (process.env.WORKER_URL || 'https://krishi-mandi.basavarajvatte.workers.dev').replace(/\/$/, '');
const WKEY = process.env.DATA_GOV_KEY;
function jsonFrom(c) {
  c = String(c); const i = c.indexOf('{'); if (i < 0) throw new Error('JSON nahi mila');
  let dep = 0, str = false, esc = false;
  for (let k = i; k < c.length; k++) {
    const ch = c[k];
    if (str) { if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === '"') str = false; continue; }
    if (ch === '"') str = true; else if (ch === '{') dep++; else if (ch === '}' && --dep === 0) return JSON.parse(c.slice(i, k + 1));
  }
  throw new Error('JSON adhoora');
}
const ROUTES = [
  { name: 'github-models', ok: () => !!TOKEN, call: async msgs => {
    const r = await fetch('https://models.github.ai/inference/chat/completions', { method: 'POST', signal: AbortSignal.timeout(60000),
      headers: { 'Authorization': `Bearer ${TOKEN}`, 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ model: MODEL, temperature: 0.2, response_format: { type: 'json_object' }, messages: msgs }) });
    const text = await r.text(); let j; try { j = JSON.parse(text); } catch { throw new Error(`HTTP ${r.status} body: ${text.slice(0, 80)}`); }
    if (!j.choices) throw new Error(`HTTP ${r.status} ${text.slice(0, 160)}`);
    return j.choices[0].message.content; } },
  { name: 'cloudflare-ai', ok: () => !!WKEY, call: async msgs => {
    const r = await fetch(WORKER + '/ai', { method: 'POST', signal: AbortSignal.timeout(90000),
      headers: { 'Content-Type': 'application/json', 'x-key': WKEY }, body: JSON.stringify({ messages: msgs }) });
    const j = await r.json(); if (!j.ok) throw new Error(j.msg); return j.content; } }
];
let RT = 0;
async function analyse(item) {
  const msgs = [{ role: 'system', content: SYSTEM },
    { role: 'user', content: `Source: ${item.srcName} (${item.srcHost})\nDate: ${item.date}\nTitle: ${item.title}\nText: ${item.summary}` }];
  let last = new Error('koi AI raasta nahi');
  for (let k = RT; k < ROUTES.length; k++) {
    if (!ROUTES[k].ok()) continue;
    try { const a = jsonFrom(await ROUTES[k].call(msgs)); if (k !== RT) console.log('  AI raasta:', ROUTES[k].name); RT = k; return a; }
    catch (e) { last = e; console.error('  ', ROUTES[k].name, 'fail:', e.message.slice(0, 160)); }
  }
  throw last;
}

const VALID = { type: ['import', 'export', 'msp', 'policy', 'intl'], dir: ['pos', 'neg', 'neu'], when: ['short', 'medium', 'long'], conf: ['high', 'medium', 'low'] };
function clean(a, item) {
  if (!a || a.relevant !== true || !a.hi?.title || !a.mr?.title) return null;
  const DEF = { type: 'policy', dir: 'neu', when: 'medium', conf: 'low' };
  for (const [k, ok] of Object.entries(VALID)) if (!ok.includes(a[k])) a[k] = DEF[k];
  const KNOWN = ['onion', 'soybean', 'cotton', 'wheat', 'rice', 'tur', 'gram', 'sugar', 'maize', 'tomato', 'oilseed', 'other'];
  const crops = [...new Set((Array.isArray(a.crops) ? a.crops : []).map(c => KNOWN.includes(c) ? c : (/sunflower|mustard|groundnut|palm|oil/.test(c) ? 'oilseed' : 'other')))].slice(0, 5);
  if (a.type === 'msp' && !/MSP|minimum support|procure|kharid/i.test(item.title + ' ' + item.summary)) a.type = 'policy';
  const official = OFFICIAL.some(d => item.srcHost === d || item.srcHost.endsWith('.' + d));
  // AI ka confidence: sirf khabar ho (sarkari nahi) to "high" nahi dikhate
  const conf = !official && a.conf === 'high' ? 'medium' : a.conf;
  const pd = new Date(item.date); const date = /^\d{4}-\d{2}-\d{2}$/.test(a.date || '') ? a.date : (isNaN(pd) ? new Date().toISOString().slice(0, 10) : pd.toISOString().slice(0, 10));
  const pick = o => ({ title: String(o.title).slice(0, 160), what: String(o.what || '').slice(0, 500), why: String(o.why || '').slice(0, 400), effect: String(o.effect || '').slice(0, 500) });
  return { id: 'a-' + sha(norm(item.title)), date, crops: crops.length ? crops : ['other'], type: a.type, dir: a.dir, when: a.when, conf,
    priority: a.priority === 'high' ? 'high' : 'normal', qty: a.qty && a.qty !== 'null' ? String(a.qty).slice(0, 120) : null,
    official, source: item.link, source_name: item.srcName, headline: item.title, hi: pick(a.hi), mr: pick(a.mr), auto: true,
    addedAt: new Date().toISOString() };
}

// ---------- chalao ----------
const db = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : { items: [], seen: [] };
const seen = new Set(db.seen || []);
db.items.forEach(i => seen.add(i.id));

let raw = [];
if (DRY) raw = parseRSS(fs.readFileSync(process.argv[process.argv.indexOf('--dry') + 1], 'utf8'), 'Sample');
else for (const f of FEEDS) {
  try { const items = parseRSS(await get(f.url), f.name); raw.push(...items); console.log(f.name, items.length, f.url.slice(0, 80)); }
  catch (e) { console.error('feed fail', f.url.slice(0, 80), e.message); }
}

// kheti + niti wali khabar, 7 din se purani nahi, duplicate hatao
const week = Date.now() - 7 * 864e5;
const fresh = []; const titles = new Set();
for (const it of raw) {
  const text = it.title + ' ' + it.summary;
  if (!Object.values(CROP_WORDS).some(r => r.test(text)) || !POLICY_WORDS.test(text)) continue;
  const d = new Date(it.date); if (!isNaN(d) && d < week) continue;
  const id = 'a-' + sha(norm(it.title)), key = norm(it.title).split(' ').slice(0, 8).join(' ');
  if (seen.has(id) || titles.has(key)) continue;
  titles.add(key); fresh.push(it);
}
// sarkari source pehle
fresh.sort((a, b) => OFFICIAL.some(d => b.srcHost.endsWith(d)) - OFFICIAL.some(d => a.srcHost.endsWith(d)));
console.log('kul', raw.length, '| kaam ki nayi', fresh.length);

if (!TOKEN && !WKEY && !DRY) { console.error('Koi AI raasta nahi — AI ke bina kuch publish nahi karenge.'); process.exit(0); }
let added = 0;
for (const it of fresh.slice(0, MAX_NEW)) {
  const id = 'a-' + sha(norm(it.title));
  try {
    const a = DRY ? JSON.parse(fs.readFileSync(process.argv[process.argv.indexOf('--dry') + 2], 'utf8')) : await analyse(it);
    const c = clean(a, it);
    seen.add(id);
    if (c && !db.items.some(x => x.id === c.id)) { db.items.unshift(c); added++; console.log('+', c.type, c.crops.join(','), c.hi.title); }
    else console.log('- chhoda (kheti/niti se nahi juda):', it.title.slice(0, 80));
  } catch (e) { console.error('AI fail (agli baar phir koshish):', it.title.slice(0, 60), e.message); }
  await new Promise(s => setTimeout(s, 4000)); // free model ki limit ka dhyan
}
db.items.sort((a, b) => b.date.localeCompare(a.date));
db.items = db.items.slice(0, KEEP);
db.seen = [...seen].slice(-2000);
db.updated = new Date().toISOString();
db._about = 'AI se apne aap bani cards. official=true sirf sarkari website wali khabar. Baaki ki sarkari pushti baaki.';
fs.writeFileSync(OUT, JSON.stringify(db, null, 1));
console.log('naye cards:', added);
