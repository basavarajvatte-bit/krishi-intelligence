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

    // Website ke liye: photo padhna (dawa ka label / fasal ki photo). Free Cloudflare AI (Llama 3.2 Vision).
    // Sawal (prompt) yahin Worker me tay hai, isliye ise koi aur kaam ke liye use nahi kar sakta. Roz ki seema bhi hai.
    if (u.pathname === '/vision') {
      const CORS = { ...H, 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' };
      const out = o => new Response(JSON.stringify(o), { headers: CORS });
      if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
      if (req.method !== 'POST') return out({ ok: false, msg: 'POST chahiye' });
      if (!env.AI) return out({ ok: false, msg: 'AI binding nahi mili' });
      const ip = req.headers.get('cf-connecting-ip') || 'x', day = new Date(Date.now() + 19800000).toISOString().slice(0, 10);
      const ck = k => new Request('https://limit.krishi/' + encodeURIComponent(k));
      const get = async k => { const r = await caches.default.match(ck(k)); return r ? +(await r.text()) || 0 : 0; };
      const put = (k, v) => caches.default.put(ck(k), new Response(String(v), { headers: { 'Cache-Control': 'public, max-age=90000' } }));
      const ni = await get('ip:' + ip + day), ng = await get('all:' + day);
      if (ni >= 25 || ng >= 200) return out({ ok: false, limit: true, msg: 'Aaj ki seema poori ho gayi. Kal phir koshish karein.' });
      let b; try { b = await req.json(); } catch (e) { return out({ ok: false, msg: 'JSON nahi' }); }
      const img = String(b.image || '');
      if (!/^data:image\/(jpeg|png|webp);base64,/.test(img) || img.length > 1600000) return out({ ok: false, msg: 'Photo theek nahi (JPEG, 1.5MB se kam)' });
      const clean = s => String(s || '').replace(/[^\p{L}\p{N} ()\-,./]/gu, '').slice(0, 60);
      let sys, user;
      if (b.task === 'label') {
        sys = 'You read labels of Indian agricultural products (pesticides, fertilizers, bio-products, seeds). Report ONLY what is clearly visible on the label. Never guess, never add knowledge from memory. Use null for anything not readable. Reply with ONE JSON object only.';
        user = 'Read this product label. JSON keys: is_product (true/false), product_name, brand, company, category (one of insecticide, fungicide, herbicide, fertilizer, organic, bio, pgr, seed, other, unknown), active_ingredients (list of {name, concentration} exactly as printed), formulation (e.g. EC, SC, WP, WG, SL, GR, SP, as printed), crops_on_label (list), targets_on_label (list of pests/diseases/weeds printed), dose_on_label (verbatim text or null), phi_on_label (waiting period text or null), cir_reg_no, batch_no, mfg_date, expiry_date, warning_triangle_color (red, yellow, blue, green or null), npk (for fertilizer, as printed or null), other_text (list of up to 5 other important printed lines).';
      } else if (b.task === 'crop') {
        sys = 'You are a careful plant-health assistant for Indian farmers. Describe only what is visible. Give possible causes with honest confidence. Clearly separate nutrient deficiency, water/heat stress and infection; if unsure, say so with low confidence. NEVER name pesticides, chemicals or doses. Reply with ONE JSON object only.';
        user = `Farmer says crop: ${clean(b.crop) || 'unknown'}, plant part: ${clean(b.part) || 'unknown'}. Look at the photo. JSON keys: image_ok (false if blurry, too far, or not a plant), crop_seen, symptoms (list of short visible symptoms in English), causes (up to 3, each {name_en, name_mr (Marathi), type: fungal|bacterial|viral|insect|mite|nutrient|water|heat|healthy|other, confidence: 0-100, why: short English reason}), severity_0_10 (0 healthy, 10 very severe), need_more (list of extra photos that would help, English), cultural_steps_mr (up to 4 simple non-chemical steps in Marathi).`;
      } else return out({ ok: false, msg: 'task galat' });
      const MODEL = '@cf/meta/llama-3.2-11b-vision-instruct';
      const run = () => env.AI.run(MODEL, { messages: [{ role: 'system', content: sys }, { role: 'user', content: user }], image: img, max_tokens: 900, temperature: 0.1 });
      let r;
      try { r = await run(); }
      catch (e) {
        if (/agree/i.test(String(e))) { try { await env.AI.run(MODEL, { prompt: 'agree' }); } catch (e1) { /* 5016 = sahmati ho gayi */ } try { r = await run(); } catch (e2) { return out({ ok: false, msg: String(e2).slice(0, 200) }); } }
        else return out({ ok: false, msg: String(e).slice(0, 200) });
      }
      ctx.waitUntil(Promise.all([put('ip:' + ip + day, ni + 1), put('all:' + day, ng + 1)]));
      const c = r && r.response;
      return out({ ok: true, content: typeof c === 'string' ? c : JSON.stringify(c), left: 25 - ni - 1 });
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
