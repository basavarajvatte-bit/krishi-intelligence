// Ek baar ka jaanch script: data.gov.in me kothimbir kis naam se hai, kitna purana data hai.
const W = 'https://krishi-mandi.basavarajvatte.workers.dev', K = process.env.DATA_GOV_KEY;
const CUR = '9ef84268-d588-465a-a308-a864a43d0070', HIS = '35985678-0d79-46b4-9ed6-6f13308a1d24';
async function q(id, params) {
  const u = new URL(W + '/res'); u.searchParams.set('id', id);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  const j = await (await fetch(u, { headers: { 'x-key': K } })).json();
  console.log('\n##', id.slice(0, 8), JSON.stringify(params), '=> ok', j.ok, 'total', j.total, 'count', j.count, j.msg || '', j.sample || '');
  if (j.field) console.log('fields:', j.field.map(f => f.id || f.name).join(','));
  (j.records || []).slice(0, 3).forEach(r => console.log(JSON.stringify(r)));
  return j;
}
for (const name of ['Coriander(Leaves)', 'Corriander seed', 'Coriander Leaves', 'Coriander(Leaves)'.replace('(', ' ('), 'Coriander']) {
  await q(CUR, { 'filters[commodity]': name, limit: 3 });
  await q(HIS, { 'filters[Commodity]': name, limit: 3 });
}
await q(HIS, { 'filters[Commodity]': 'Coriander(Leaves)', 'filters[State]': 'Maharashtra', limit: 3, 'sort[Arrival_Date]': 'asc' });
await q(HIS, { 'filters[Commodity]': 'Coriander(Leaves)', 'filters[Arrival_Date]': '15/01/2017', limit: 3 });
await q(HIS, { 'filters[Commodity]': 'Coriander(Leaves)', 'filters[Arrival_Date]': '15/01/2022', limit: 3 });
await q(HIS, { 'filters[Commodity]': 'Coriander(Leaves)', 'filters[Arrival_Date]': '20/11/2026', limit: 3 });
await q(HIS, { 'filters[Commodity]': 'Coriander(Leaves)', 'filters[Market]': 'Pune', limit: 3 });
