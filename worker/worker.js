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

    // GitHub robot ke liye: data.gov.in ke chune hue resource (filters ke saath). Chaabi se surakshit.
    if (u.pathname === '/res') {
      if (req.headers.get('x-key') !== env.DATA_GOV_KEY) return send({ ok: false, msg: 'mana hai' });
      const ALLOW = ['9ef84268-d588-465a-a308-a864a43d0070', '35985678-0d79-46b4-9ed6-6f13308a1d24'];
      const id = u.searchParams.get('id');
      if (!ALLOW.includes(id)) return send({ ok: false, msg: 'resource allow nahi' });
      const q = new URLSearchParams();
      for (const [k, v] of u.searchParams) if (k.startsWith('filters[') || k === 'offset' || k === 'limit' || k.startsWith('sort[')) q.append(k, v);
      if (!q.has('limit')) q.set('limit', '1000');
      const api = `https://api.data.gov.in/resource/${id}?api-key=${encodeURIComponent(env.DATA_GOV_KEY)}&format=json&${q}`;
      try {
        const r = await fetch(api, { headers: { 'User-Agent': 'Mozilla/5.0 krishi-intelligence' } });
        const text = await r.text();
        try { const j = JSON.parse(text); return send({ ok: true, total: j.total, count: (j.records || []).length, field: j.field, records: j.records || [] }); }
        catch (e) { return send({ ok: false, status: r.status, sample: text.slice(0, 300) }); }
      } catch (e) { return send({ ok: false, msg: String(e) }); }
    }

    // GitHub robot ke liye: free Cloudflare AI se khabar samjhao. Chaabi (DATA_GOV_KEY) se hi chalta hai, taaki koi aur free quota na khaaye.
    if (u.pathname === '/ai') {
      if (req.method !== 'POST' || req.headers.get('x-key') !== env.DATA_GOV_KEY) return send({ ok: false, msg: 'mana hai' });
      if (!env.AI) return send({ ok: false, msg: 'AI binding nahi mili' });
      try {
        const b = await req.json();
        const out = await env.AI.run(b.model || '@cf/meta/llama-3.3-70b-instruct-fp8-fast', { messages: b.messages, max_tokens: 1500, temperature: 0.2 });
        const r = out && out.response;
        return send({ ok: true, content: typeof r === 'string' ? r : JSON.stringify(r) });
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
