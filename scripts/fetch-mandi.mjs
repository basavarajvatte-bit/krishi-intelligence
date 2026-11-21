// Rozana mandi bhav: data.gov.in (Agmarknet) se laata hai.
// GitHub Action chalata hai. Key GitHub "Secret" DATA_GOV_KEY me rehti hai.
// Purani tareekh ki file kabhi overwrite nahi hoti.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const WORKER = process.env.WORKER_URL || 'https://krishi-mandi.basavarajvatte.workers.dev';
const RESOURCE = '9ef84268-d588-465a-a308-a864a43d0070';
const DATA = path.resolve('data');
const DAILY = path.join(DATA, 'daily');
const LIMIT = 1000, MAX = 30000;


const num = v => { const n = Number(v); return Number.isFinite(n) ? n : null; };
const toISO = d => { const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(d || ''); return m ? `${m[3]}-${m[2]}-${m[1]}` : null; };

// Node fetch fail ho to curl se koshish (curl system certificates use karta hai)
function viaCurl(url) {
  const out = execFileSync('curl', ['-sS', '--fail', '--max-time', '60', '-A', 'Mozilla/5.0 krishi-intelligence', url], { maxBuffer: 64 * 1024 * 1024 });
  return JSON.parse(out.toString());
}

async function page(offset) {
  const url = `https://api.data.gov.in/resource/${RESOURCE}?api-key=${KEY}&format=json&limit=${LIMIT}&offset=${offset}`;
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 krishi-intelligence' } });
      if (r.ok) return await r.json();
      console.error('HTTP', r.status);
    } catch (e) { console.error('fetch error', e.message, e.cause?.code || '', e.cause?.message || ''); }
    try { return viaCurl(url); } catch (e) { console.error('curl error', String(e.stderr || e.message)); }
    await new Promise(s => setTimeout(s, 3000 * (i + 1)));
  }
  throw new Error('API se data nahi mila');
}

const rows = [];
for (let off = 0; off < MAX; off += LIMIT) {
  const j = await page(off);
  const rec = j.records || [];
  for (const r of rec) {
    const modal = num(r.modal_price);
    if (!modal) continue; // khaali / galat record chhod do
    rows.push([r.state, r.district, r.market, r.commodity, r.variety, num(r.min_price), num(r.max_price), modal, toISO(r.arrival_date)]);
  }
  if (rec.length < LIMIT || off + LIMIT >= Number(j.total || 0)) break;
}
if (!rows.length) { console.error('Koi record nahi'); process.exit(1); }

// Sabse zyada aane wali tareekh = aaj ka data
const cnt = {};
rows.forEach(r => { if (r[8]) cnt[r[8]] = (cnt[r[8]] || 0) + 1; });
const date = Object.entries(cnt).sort((a, b) => b[1] - a[1])[0][0];

fs.mkdirSync(DAILY, { recursive: true });
const dayFile = path.join(DAILY, `${date}.json`);
const COLS = ['state', 'district', 'market', 'commodity', 'variety', 'min', 'max', 'modal', 'date'];
if (!fs.existsSync(dayFile)) {
  fs.writeFileSync(dayFile, JSON.stringify({ date, source: 'data.gov.in / Agmarknet', cols: COLS, rows }));
  console.log('Naya din save:', date, rows.length);
} else console.log('Ye din pehle se save hai, overwrite nahi kiya:', date);

// Pichhle din se badlav
const prevDays = fs.readdirSync(DAILY).filter(f => f.endsWith('.json') && f < `${date}.json`).sort();
const prev = {};
if (prevDays.length) {
  const p = JSON.parse(fs.readFileSync(path.join(DAILY, prevDays.at(-1)), 'utf8'));
  p.rows.forEach(r => { prev[r.slice(0, 5).join('|')] = r[7]; });
}
const latestRows = rows.map(r => [...r, prev[r.slice(0, 5).join('|')] ?? null]);

fs.writeFileSync(path.join(DATA, 'latest.json'), JSON.stringify({
  status: 'ok', date, prevDate: prevDays.length ? prevDays.at(-1).replace('.json', '') : null,
  fetchedAt: new Date().toISOString(), source: 'data.gov.in — Current Daily Price of Various Commodities (Agmarknet)',
  sourceUrl: 'https://www.data.gov.in/resource/current-daily-price-various-commodities-various-markets-mandi',
  cols: [...COLS, 'prevModal'], rows: latestRows
}));
fs.writeFileSync(path.join(DATA, 'days.json'), JSON.stringify(fs.readdirSync(DAILY).filter(f => f.endsWith('.json')).map(f => f.replace('.json', '')).sort()));
console.log('latest.json ready');

// Fasal-wise itihaas: har mandi ka roz ka aam bhav (purani tareekh kabhi nahi badalti)
const HIST = path.join(DATA, 'hist');
fs.mkdirSync(HIST, { recursive: true });
const slug = c => String(c).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const byCrop = {};
rows.forEach(r => { (byCrop[r[3]] ||= []).push(r); });
for (const [crop, rs] of Object.entries(byCrop)) {
  const f = path.join(HIST, slug(crop) + '.json');
  const h = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : { commodity: crop, source: 'data.gov.in / Agmarknet', days: {} };
  if (h.days[date]) continue;
  const day = {};
  rs.forEach(r => { day[[r[0], r[1], r[2], r[4]].join('|')] = r[7]; });
  h.days[date] = day;
  fs.writeFileSync(f, JSON.stringify(h));
}
console.log('Itihaas update:', Object.keys(byCrop).length, 'fasalein');
