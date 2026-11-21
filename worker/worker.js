// Krishi Intelligence — mandi bhav laane wala program (Cloudflare Worker)
// Chaabi Worker ke "secret" DATA_GOV_KEY me rehti hai, website me nahi.
const RES = '9ef84268-d588-465a-a308-a864a43d0070';
const H = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json; charset=utf-8' };

export default {
  async fetch(req, env, ctx) {
    const u = new URL(req.url);
    const send = (obj, extra = {}) => new Response(JSON.stringify(obj), { headers: { ...H, ...extra } });
    const info = { colo: req.cf && req.cf.colo, country: req.cf && req.cf.country };
    if (!env.DATA_GOV_KEY) return send({ ok: false, msg: 'DATA_GOV_KEY secret nahi mila', info });

    // GitHub robot ke liye: poora data page-by-page
    if (u.pathname === '/raw') {
      const off = Math.max(0, parseInt(u.searchParams.get('offset') || '0', 10) || 0);
      const lim = Math.min(1000, Math.max(1, parseInt(u.searchParams.get('limit') || '1000', 10) || 1000));
      const api = `https://api.data.gov.in/resource/${RES}?api-key=${encodeURIComponent(env.DATA_GOV_KEY)}&format=json&limit=${lim}&offset=${off}`;
      try {
        const r = await fetch(api, { headers: { 'User-Agent': 'Mozilla/5.0 krishi-intelligence' } });
        const j = await r.json();
        return send({ ok: true, total: j.total, records: j.records || [] });
      } catch (e) { return send({ ok: false, msg: String(e) }); }
    }

    const crop = u.searchParams.get('crop') || 'Onion';
    // 30 minute cache: sab farmers ke liye ek hi baar sarkari site se puchho
    const cache = caches.default;
    const ck = new Request('https://cache.krishi/' + encodeURIComponent(crop));
    const hit = await cache.match(ck);
    if (hit && !u.searchParams.has('nocache')) return hit;

    const api = `https://api.data.gov.in/resource/${RES}?api-key=${encodeURIComponent(env.DATA_GOV_KEY)}&format=json&limit=2000&filters[commodity]=${encodeURIComponent(crop)}`;
    try {
      const r = await fetch(api, { headers: { 'User-Agent': 'Mozilla/5.0 krishi-intelligence' } });
      const text = await r.text();
      let j;
      try { j = JSON.parse(text); } catch (e) { return send({ ok: false, msg: 'Sarkari site ne JSON nahi diya', status: r.status, info, sample: text.slice(0, 200) }); }
      const res = send({ ok: true, info, fetchedAt: new Date().toISOString(), total: j.total, count: (j.records || []).length, records: j.records || [] }, { 'Cache-Control': 'public, max-age=1800' });
      if ((j.records || []).length) ctx.waitUntil(cache.put(ck, res.clone()));
      return res;
    } catch (e) {
      return send({ ok: false, msg: 'Sarkari site se juda nahi: ' + String(e), info });
    }
  }
};
