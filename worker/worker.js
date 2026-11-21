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

    // Website ke liye: photo padhna (dawa ka label / fasal ki photo). 3 alag free Cloudflare AI vision models.
    // Website pehle model 1 chalati hai; 4 sec me jawab na aaye to model 2, phir model 3 (race, pehla sahi jawab jeetta hai).
    // Sawal (prompt) yahin tay hai, isliye ise koi aur kaam ke liye use nahi kar sakta. Free plan: seema poori ho to error, paisa nahi.
    if (u.pathname === '/vision') {
      const CORS = { ...H, 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' };
      const out = (o, st = 200) => new Response(JSON.stringify(o), { status: st, headers: CORS });
      if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
      if (req.method !== 'POST') return out({ ok: false, code: 'method', msg: 'POST chahiye' });
      if (!env.AI) return out({ ok: false, code: 'nobinding', msg: 'AI binding nahi mili' });
      const ip = req.headers.get('cf-connecting-ip') || 'x';
      if (env.VISION_RL) { try { const { success } = await env.VISION_RL.limit({ key: ip }); if (!success) return out({ ok: false, code: 'rate', msg: 'Bahut jaldi-jaldi scan. 1 minute ruk kar phir koshish karein.' }); } catch (e) {} }
      let b; try { b = await req.json(); } catch (e) { return out({ ok: false, code: 'json', msg: 'JSON nahi' }); }
      const img = String(b.image || '');
      if (!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(img.slice(0, 64) + 'A') || img.length > 2000000) return out({ ok: false, code: 'image', msg: 'Photo theek nahi (JPEG/PNG/WEBP, 1.5MB se kam)' });
      const clean = s => String(s || '').replace(/[^\p{L}\p{N} ()\-,./]/gu, '').slice(0, 60);
      let sys, user;
      if (b.task === 'label') {
        sys = 'You read labels of Indian agricultural products (pesticides, fertilizers, bio-products, seeds). Report ONLY what is clearly printed on the label. Never guess, never add facts from memory. Use "" or [] when not readable. Farmer-facing explanation fields must be in simple Marathi (Devanagari). Output ONE JSON object only, no markdown.';
        user = 'Read this product label and output JSON with exactly these keys: {"is_product": true/false, "product_name": "", "brand": "", "company": "", "category": "insecticide|fungicide|herbicide|fertilizer|organic|bio|pgr|seed|other|unknown", "active_ingredients": [{"name": "", "concentration": ""}], "concentration": "", "formulation": "", "uses": ["short Marathi uses, only if printed or obvious from category"], "approved_crops": ["crops printed on label"], "target_pests": ["pests/diseases/weeds printed on label"], "dosage": "dose text exactly as printed, else empty", "application_method": "as printed, in Marathi, else empty", "safety_precautions": ["precautions printed on label, in Marathi"], "alternatives": [], "phi": "waiting period as printed, else empty", "cir_reg_no": "", "batch_no": "", "mfg_date": "", "expiry_date": "", "warning_triangle_color": "red|yellow|blue|green|", "npk": "", "confidence": "high|medium|low (how clearly the label could be read)"}. alternatives must always be an empty list.';
      } else if (b.task === 'crop') {
        sys = 'You are a careful plant-health assistant for Indian farmers. Describe only what is visible. Give possible causes with honest confidence; if the photo is unclear or the cause is uncertain, use low confidence. Carefully separate nutrient deficiency, water/heat stress and infection. NEVER name any pesticide, chemical, product or dose. Farmer-facing text must be simple Marathi (Devanagari). Output ONE JSON object only, no markdown.';
        user = `Farmer says crop: ${clean(b.crop) || 'unknown'}, plant part: ${clean(b.part) || 'unknown'}. Output JSON with exactly these keys: {"image_ok": true/false (false if blurry, too far or not a plant), "crop_name": "Marathi", "detected_problem": "Marathi name (English name)", "problem_en": "English name", "problem_type": "fungal|bacterial|viral|insect|mite|nutrient|water|heat|healthy|other", "possible_causes": [{"name_mr": "", "name_en": "", "type": "", "confidence": 0-100}], "visible_symptoms": ["short Marathi"], "confidence": 0-100, "severity_0_10": 0-10, "recommended_actions": ["simple non-chemical steps in Marathi"], "approved_treatments": [], "prevention": ["Marathi"], "additional_information_needed": ["extra photos or details needed, Marathi"]}. approved_treatments must always be an empty list.`;
      } else return out({ ok: false, code: 'task', msg: 'task galat' });
      const MODELS = {
        1: { id: '@cf/meta/llama-4-scout-17b-16e-instruct', fmt: 'msg', name: 'Llama 4 Scout' },
        2: { id: '@cf/mistralai/mistral-small-3.1-24b-instruct', fmt: 'msg', name: 'Mistral Small 3.1' },
        3: { id: '@cf/meta/llama-3.2-11b-vision-instruct', fmt: 'img', name: 'Llama 3.2 Vision' }
      };
      const M = MODELS[+b.model] || MODELS[1];
      const input = M.fmt === 'msg'
        ? { messages: [{ role: 'system', content: sys }, { role: 'user', content: [{ type: 'text', text: user }, { type: 'image_url', image_url: { url: img } }] }], max_tokens: 1200, temperature: 0.1 }
        : { messages: [{ role: 'system', content: sys }, { role: 'user', content: user }], image: img, max_tokens: 1200, temperature: 0.1 };
      const t0 = Date.now();
      let r;
      try { r = await env.AI.run(M.id, input); }
      catch (e) {
        const es = String(e);
        if (/agree/i.test(es)) { try { await env.AI.run(M.id, { prompt: 'agree' }); } catch (e1) {} try { r = await env.AI.run(M.id, input); } catch (e2) { return out({ ok: false, code: 'model', model: M.name, msg: String(e2).slice(0, 200) }); } }
        else return out({ ok: false, code: /3036|neurons/i.test(es) ? 'quota' : 'model', model: M.name, msg: es.slice(0, 200) });
      }
      let c = r && (r.response ?? r.choices?.[0]?.message?.content ?? r.result?.response);
      if (c == null || c === '') return out({ ok: false, code: 'empty', model: M.name, msg: 'Khaali jawab' });
      if (typeof c !== 'string') c = JSON.stringify(c);
      // JSON nikalo; na mile to chhota text-AI se usi jawab ko JSON me badlo (naya kuch nahi jodna)
      let data = jsonFrom(c), fixed = false;
      if (!data) {
        try {
          const keys = b.task === 'label' ? 'is_product, product_name, brand, company, category, active_ingredients [{name, concentration}], concentration, formulation, uses, approved_crops, target_pests, dosage, application_method, safety_precautions, alternatives, phi, cir_reg_no, batch_no, mfg_date, expiry_date, warning_triangle_color, npk, confidence'
            : 'image_ok, crop_name, detected_problem, problem_en, problem_type, possible_causes [{name_mr, name_en, type, confidence}], visible_symptoms, confidence, severity_0_10, recommended_actions, approved_treatments, prevention, additional_information_needed';
          const fx = await env.AI.run('@cf/meta/llama-3.1-8b-instruct-fast', { messages: [{ role: 'system', content: 'Convert the given text into ONE JSON object with these keys: ' + keys + '. Use only information present in the text. Missing values: "" or []. Output JSON only.' }, { role: 'user', content: c.slice(0, 6000) }], max_tokens: 1200, temperature: 0 });
          data = jsonFrom(fx && fx.response); fixed = !!data;
        } catch (e) {}
      }
      const v = data && validVision(b.task, data);
      if (!v) return out({ ok: false, code: 'invalid', model: M.name, msg: 'AI ne sahi roop me jawab nahi diya', sample: c.slice(0, 200) });
      return out({ ok: true, model: M.name, ms: Date.now() - t0, fixed, data: v });
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

// ---- vision helpers ----
function jsonFrom(c) {
  c = String(c || '').replace(/\*\*/g, '').replace(/```(json)?/gi, '');
  const i = c.indexOf('{'); if (i < 0) return null;
  let d = 0, s = false, e = false;
  for (let k = i; k < c.length; k++) {
    const ch = c[k];
    if (s) { if (e) e = false; else if (ch === '\\') e = true; else if (ch === '"') s = false; continue; }
    if (ch === '"') s = true; else if (ch === '{') d++;
    else if (ch === '}' && --d === 0) { const t = c.slice(i, k + 1); try { return JSON.parse(t); } catch (x) { try { return JSON.parse(t.replace(/,\s*([\]}])/g, '$1')); } catch (y) { return null; } } }
  }
  return null;
}
const arr = v => Array.isArray(v) ? v.filter(x => x != null && x !== '' && x !== 'null') : (v && typeof v === 'string' && v !== 'null' ? [v] : []);
const str = v => (v == null || v === 'null' || v === 'N/A' || /^not (specified|visible|available)/i.test(String(v))) ? '' : String(v).trim();
// Sahi jawab: label me naam/ghatak ya "product nahi"; fasal me karan/samasya ya "photo theek nahi". Khaali jawab kabhi nahi jeetta.
function validVision(task, d) {
  if (!d || typeof d !== 'object') return null;
  if (task === 'label') {
    const ai = arr(d.active_ingredients).map(a => typeof a === 'string' ? { name: a, concentration: '' } : { name: str(a.name), concentration: str(a.concentration) }).filter(a => a.name);
    const o = { is_product: d.is_product !== false && d.is_product !== 'false', product_name: str(d.product_name), brand: str(d.brand), company: str(d.company), category: str(d.category).toLowerCase(), active_ingredients: ai, concentration: str(d.concentration), formulation: str(d.formulation),
      uses: arr(d.uses).map(str), approved_crops: arr(d.approved_crops || d.crops_on_label).map(str), target_pests: arr(d.target_pests || d.targets_on_label).map(str), dosage: str(d.dosage || d.dose_on_label), application_method: str(d.application_method),
      safety_precautions: arr(d.safety_precautions).map(str), alternatives: [], phi: str(d.phi || d.phi_on_label), cir_reg_no: str(d.cir_reg_no), batch_no: str(d.batch_no), mfg_date: str(d.mfg_date), expiry_date: str(d.expiry_date), warning_triangle_color: str(d.warning_triangle_color).toLowerCase(), npk: str(d.npk), confidence: str(d.confidence).toLowerCase() };
    if (!o.is_product) return o;
    return (o.product_name || ai.length || o.npk) ? o : null;
  }
  const pc = arr(d.possible_causes || d.causes).map(c => typeof c === 'string' ? { name_mr: c, name_en: c, type: 'other', confidence: 0 } : { name_mr: str(c.name_mr || c.name), name_en: str(c.name_en || c.name), type: str(c.type).toLowerCase(), confidence: Math.max(0, Math.min(100, parseFloat(c.confidence) || 0)) }).filter(c => c.name_mr || c.name_en);
  const o = { image_ok: d.image_ok !== false && d.image_ok !== 'false', crop_name: str(d.crop_name || d.crop_seen), detected_problem: str(d.detected_problem), problem_en: str(d.problem_en), problem_type: str(d.problem_type).toLowerCase(), possible_causes: pc,
    visible_symptoms: arr(d.visible_symptoms || d.symptoms).map(str), confidence: Math.max(0, Math.min(100, parseFloat(d.confidence) || (pc[0] ? pc[0].confidence : 0))), severity_0_10: d.severity_0_10 == null ? null : Math.max(0, Math.min(10, parseFloat(d.severity_0_10) || 0)),
    recommended_actions: arr(d.recommended_actions || d.cultural_steps_mr).map(str), approved_treatments: [], prevention: arr(d.prevention).map(str), additional_information_needed: arr(d.additional_information_needed || d.need_more).map(str) };
  if (!o.image_ok) return o;
  return (pc.length || o.detected_problem) ? o : null;
}
