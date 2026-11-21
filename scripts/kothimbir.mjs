// Kothimbir (Coriander Leaves, Agmarknet commodity code 43) ka bhav.
// Dhaniya beej (Corriander seed, code 108) ko kabhi nahi milate — sirf code 43 ke record rakhte hain.
// Source: data.gov.in "Variety-wise Daily Market Prices" (Agmarknet), apne Cloudflare Worker ke zariye (chaabi Worker me).
//   node scripts/kothimbir.mjs            -> roz ka update (pichhle 10 din, poora Bharat)
//   node scripts/kothimbir.mjs --backfill -> Maharashtra ka 10+ saal ka itihaas (ek baar)
import fs from 'node:fs';
import path from 'node:path';

const W = (process.env.WORKER_URL || 'https://krishi-mandi.basavarajvatte.workers.dev').replace(/\/$/, '');
const KEY = process.env.DATA_GOV_KEY;
const RES = '35985678-0d79-46b4-9ed6-6f13308a1d24';
const NAME = 'Coriander(Leaves)', CODE = '43';
const DIR = path.resolve('data/kothimbir');
const F_DAILY = path.join(DIR, 'daily.json'), F_MONTH = path.join(DIR, 'monthly.json'), F_IN = path.join(DIR, 'india.json');
const SINCE = '2015-01-01';            // 10 saal + thoda extra
const DAILY_KEEP = 400, INDIA_KEEP = 45;
if (!KEY) { console.error('DATA_GOV_KEY nahi mila'); process.exit(1); }
fs.mkdirSync(DIR, { recursive: true });

const sleep = ms => new Promise(s => setTimeout(s, ms));
const iso = d => { const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(d || ''); return m ? `${m[3]}-${m[2]}-${m[1]}` : null; };
const dmy = s => { const [y, m, d] = s.split('-'); return `${d}/${m}/${y}`; };
const num = v => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : null; };
const median = a => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), k = s.length >> 1; return s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2; };

async function page(params) {
  const u = new URL(W + '/res'); u.searchParams.set('id', RES);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  for (let i = 0; i < 4; i++) {
    try {
      const j = await (await fetch(u, { headers: { 'x-key': KEY }, signal: AbortSignal.timeout(60000) })).json();
      if (j.ok) return j;
      console.error('worker:', j.msg || j.status, (j.sample || '').slice(0, 120));
    } catch (e) { console.error('fetch:', e.message); }
    await sleep(3000 * (i + 1));
  }
  throw new Error('data.gov.in se data nahi mila');
}
// row: [date, state, district, market, variety, grade, min, max, modal]
function toRow(r) {
  if (String(r.Commodity) !== NAME || String(r.Commodity_Code) !== CODE) return null;   // dhaniya beej yahan kabhi nahi
  const date = iso(r.Arrival_Date), modal = num(r.Modal_Price);
  if (!date || !modal) return null;
  return [date, r.State, r.District, r.Market, r.Variety, r.Grade, num(r.Min_Price), num(r.Max_Price), modal];
}
const key = r => [r[0], r[3], r[4], r[5]].join('|');
const load = (f, def) => fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : def;
const COLS = ['date', 'state', 'district', 'market', 'variety', 'grade', 'min', 'max', 'modal'];

// Unit pehchaan: Agmarknet me sab "₹/क्विंटल" likha hota hai, par kuch mandi (jaise Pune) asal me ek jodi ka bhav bharti hain.
// Mandi ka beech wala (median) aam bhav ₹100 se kam ho to us mandi ko "जुडी (gaddi)" maana jaata hai. Ye andaza hai, isliye website par bataya jaata hai.
function units(rows) {
  const by = {}; rows.forEach(r => (by[r[3]] ||= []).push(r[8]));
  const u = {}; for (const [m, v] of Object.entries(by)) u[m] = median(v) < 100 ? 'b' : 'q'; return u;
}
function monthly(rows, unitMap) {
  const g = {};
  for (const r of rows) {
    const k = r[3] + '|' + r[0].slice(0, 7);
    const o = g[k] ||= { m: r[3], d: r[2], ym: r[0].slice(0, 7), days: new Set(), mod: [], lo: Infinity, hi: 0 };
    o.days.add(r[0]); o.mod.push(r[8]); o.lo = Math.min(o.lo, r[6] ?? r[8]); o.hi = Math.max(o.hi, r[7] ?? r[8]);
  }
  return Object.values(g).map(o => ({ m: o.m, d: o.d, ym: o.ym, n: o.days.size, avg: Math.round(o.mod.reduce((a, b) => a + b, 0) / o.mod.length),
    med: Math.round(median(o.mod)), lo: o.lo === Infinity ? null : o.lo, hi: o.hi || null, u: unitMap[o.m] || 'q' }))
    .sort((a, b) => a.ym.localeCompare(b.ym) || a.m.localeCompare(b.m));
}

let daily = load(F_DAILY, { cols: COLS, rows: [] });
let month = load(F_MONTH, { items: [] });
let india = load(F_IN, { cols: COLS, rows: [] });

if (process.argv.includes('--backfill')) {
  // Maharashtra: nayi tareekh se purani ki taraf, page-by-page, jab tak SINCE se purana na aa jaaye
  const all = new Map(); let off = 0, total = null, oldest = '9999';
  while (true) {
    const j = await page({ 'filters[Commodity]': NAME, 'filters[State]': 'Maharashtra', 'sort[Arrival_Date]': 'desc', limit: 1000, offset: off });
    total ??= j.total;
    const rs = j.records.map(toRow).filter(Boolean);
    rs.forEach(r => { if (r[0] >= SINCE) all.set(key(r), r); if (r[0] < oldest) oldest = r[0]; });
    off += j.count; console.log('offset', off, '/', total, '| sabse purana', oldest, '| rakhe', all.size);
    if (!j.count || oldest < SINCE || off >= total) break;
    await sleep(700);
  }
  const rows = [...all.values()].sort((a, b) => a[0].localeCompare(b[0]));
  const um = units(rows);
  month = { source: 'data.gov.in / Agmarknet — Variety-wise Daily Market Prices (Coriander(Leaves), code 43)', state: 'Maharashtra', since: rows[0]?.[0], units: um, items: monthly(rows, um) };
  const cut = new Date(Date.now() - DAILY_KEEP * 864e5).toISOString().slice(0, 10);
  daily = { cols: COLS, rows: rows.filter(r => r[0] >= cut) };
  console.log('Maharashtra itihaas:', rows.length, 'record,', Object.keys(um).length, 'mandi, mahine', month.items.length);
}

// Roz ka update: pichhle 10 din, poora Bharat (har din ~200–250 mandi)
const recent = new Map();
for (let i = 0; i < 10; i++) {
  const d = new Date(Date.now() + 5.5 * 36e5 - i * 864e5).toISOString().slice(0, 10);
  let off = 0;
  while (true) {
    const j = await page({ 'filters[Commodity]': NAME, 'filters[Arrival_Date]': dmy(d), limit: 1000, offset: off });
    j.records.map(toRow).filter(Boolean).forEach(r => recent.set(key(r), r));
    off += j.count; if (!j.count || off >= j.total) break;
  }
  await sleep(500);
}
console.log('pichhle 10 din ke record (Bharat):', recent.size);

const merge = (store, add, keep, onlyMH) => {
  const m = new Map(store.rows.map(r => [key(r), r]));
  for (const r of add) if (!onlyMH || r[1] === 'Maharashtra') m.set(key(r), r);
  const cut = new Date(Date.now() - keep * 864e5).toISOString().slice(0, 10);
  return { cols: COLS, rows: [...m.values()].filter(r => r[0] >= cut).sort((a, b) => a[0].localeCompare(b[0]) || a[3].localeCompare(b[3])) };
};
daily = merge(daily, recent.values(), DAILY_KEEP, true);
india = merge(india, recent.values(), INDIA_KEEP, false);

// Mahine ka hisaab: daily me jo mahine poore hain unhe dobara banao (purane mahine waise hi rahte hain)
if (daily.rows.length) {
  const um = { ...(month.units || {}), ...units(daily.rows) };
  const firstFull = daily.rows[0][0].slice(0, 7);
  const fresh = monthly(daily.rows.filter(r => r[0].slice(0, 7) > firstFull), um);
  const months = new Set(fresh.map(x => x.ym));
  month.items = [...(month.items || []).filter(x => !months.has(x.ym)), ...fresh].sort((a, b) => a.ym.localeCompare(b.ym) || a.m.localeCompare(b.m));
  month.units = um;
}
const stamp = { updated: new Date().toISOString(), source: 'data.gov.in / Agmarknet (Coriander(Leaves), code 43)', note: 'Dhaniya beej (code 108) is file me nahi hai.' };
fs.writeFileSync(F_DAILY, JSON.stringify({ ...stamp, state: 'Maharashtra', ...daily }));
fs.writeFileSync(F_IN, JSON.stringify({ ...stamp, ...india }));
fs.writeFileSync(F_MONTH, JSON.stringify({ ...stamp, ...month }));
console.log('daily', daily.rows.length, '| india', india.rows.length, '| monthly', month.items.length);
