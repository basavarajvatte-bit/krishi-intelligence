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
Niyam:
- Sirf diye gaye text ke facts use karo. Koi number, date, matra (quantity) ya desh khud se mat banao. Text me nahi hai to null rakho.
- Agar khabar kheti ki fasal ke bhav se judi sarkari niti, import/export, MSP, stock, ya duniya ke fasal/mausam ki nahi hai, to {"relevant":false} do.
- Bahut aasaan bhasha: 10 saal ka bachcha samjhe. Mushkil shabd (jaise "tariff") ho to saath me matlab likho.
- "effect" aur "dir" tumhara andaza hai, pakki baat nahi. Confidence imaandari se do.
Sirf JSON do, is roop me:
{"relevant":true,"crops":["onion|soybean|cotton|wheat|rice|tur|gram|sugar|maize|tomato|oilseed|other"],
"type":"import|export|msp|policy|intl","dir":"pos|neg|neu","when":"short|medium|long","conf":"high|medium|low","priority":"high|normal",
"qty":"text me di gayi matra ya null","date":"YYYY-MM-DD ya null",
"hi":{"title":"","what":"Kya hua (2 line)","why":"Sarkar/desh ne aisa kyun kiya (agar text me nahi to 'खबर में कारण नहीं बताया गया')","effect":"Kisan ke bhav par kya asar (andaza, wajah ke saath)"},
"mr":{"title":"","what":"","why":"","effect":""}}
hi = Hindi (Devanagari), mr = Marathi (Devanagari). dir: pos = bhav badhne ki sambhavna, neg = girne ki, neu = khaas asar nahi.`;

// Do AI address: pehla naya, doosra purana (backup). Dono GitHub ke free models.
const ENDPOINTS = [
  { url: 'https://models.github.ai/inference/chat/completions', model: MODEL },
  { url: 'https://models.inference.ai.azure.com/chat/completions', model: MODEL.replace(/^openai\//, '') }
];
let EP = 0;
async function analyse(item) {
  let last;
  for (let k = EP; k < ENDPOINTS.length; k++) {
    const ep = ENDPOINTS[k];
    try {
      const r = await fetch(ep.url, {
        method: 'POST', signal: AbortSignal.timeout(60000),
        headers: { 'Authorization': `Bearer ${TOKEN}`, 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ model: ep.model, temperature: 0.2, response_format: { type: 'json_object' },
          messages: [{ role: 'system', content: SYSTEM },
            { role: 'user', content: `Source: ${item.srcName} (${item.srcHost})\nDate: ${item.date}\nTitle: ${item.title}\nText: ${item.summary}` }] })
      });
      const text = await r.text();
      let j; try { j = JSON.parse(text); } catch { throw new Error(`HTTP ${r.status} ${r.headers.get('content-type')} body: ${text.slice(0, 160)}`); }
      if (!r.ok || !j.choices) throw new Error(`HTTP ${r.status} ${JSON.stringify(j).slice(0, 200)}`);
      EP = k;
      let c = j.choices[0].message.content.trim().replace(/^```(json)?/i, '').replace(/```$/, '');
      return JSON.parse(c);
    } catch (e) { last = e; console.error('  endpoint', k, 'fail:', e.message); }
  }
  throw last;
}

const VALID = { type: ['import', 'export', 'msp', 'policy', 'intl'], dir: ['pos', 'neg', 'neu'], when: ['short', 'medium', 'long'], conf: ['high', 'medium', 'low'] };
function clean(a, item) {
  if (!a || a.relevant !== true || !a.hi?.title || !a.mr?.title) return null;
  const DEF = { type: 'policy', dir: 'neu', when: 'medium', conf: 'low' };
  for (const [k, ok] of Object.entries(VALID)) if (!ok.includes(a[k])) a[k] = DEF[k];
  const crops = (Array.isArray(a.crops) ? a.crops : []).filter(c => /^[a-z]+$/.test(c)).slice(0, 5);
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

if (!TOKEN && !DRY) { console.error('GITHUB_TOKEN nahi mila — AI ke bina kuch publish nahi karenge.'); process.exit(0); }
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
