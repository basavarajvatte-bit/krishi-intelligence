import { searchPrices } from './prices.js';
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

    // Website ke liye: scan ke baad online research (alag, background). Server-Sent Events se ek-ek hissa bhejta hai.
    if (u.pathname === '/research') {
      const CORS = { ...H, 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' };
      if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
      if (req.method !== 'POST') return new Response(JSON.stringify({ ok: false }), { headers: CORS });
      const ip = req.headers.get('cf-connecting-ip') || 'x';
      if (env.VISION_RL) { try { const { success } = await env.VISION_RL.limit({ key: 'r:' + ip }); if (!success) return new Response('data: {"type":"error","code":"rate"}\n\ndata: {"type":"done"}\n\n', { headers: { ...CORS, 'Content-Type': 'text/event-stream' } }); } catch (e) {} }
      let b; try { b = await req.json(); } catch (e) { return new Response(JSON.stringify({ ok: false }), { headers: CORS }); }
      const { readable, writable } = new TransformStream(); const w = writable.getWriter(); const enc = new TextEncoder();
      let open = true; const emit = async o => { if (!open) return; try { await w.write(enc.encode('data: ' + JSON.stringify(o) + '\n\n')); } catch (e) { open = false; } };
      ctx.waitUntil((async () => {
        try { await emit({ type: 'start', at: new Date().toISOString(), web: env.TAVILY_API_KEY ? 'key' : 'keyless' }); await runResearch(b, env, emit); }
        catch (e) { await emit({ type: 'error', msg: String(e).slice(0, 200) }); }
        await emit({ type: 'done' }); try { await w.close(); } catch (e) {}
      })());
      return new Response(readable, { headers: { ...CORS, 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache' } });
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

// ======================= ONLINE RESEARCH ENGINE =======================
// Niyam: har baat ke saath asli source; LLM sirf source ke text se nikaalta hai aur "quote" deta hai —
// quote source me shabdash: na mile to baat hata di jaati hai. Matra (dose) me farak ho to average nahi, "conflict" dikhate hain.
const R_UA = { 'User-Agent': 'KrishiIntelligence/1.0 (https://basavarajvatte-bit.github.io/krishi-intelligence/; farmer info site)' };
const R_OFFICIAL = ['ppqs.gov.in', 'cibrc.nic.in', 'icar.org.in', 'icar.gov.in', 'krishi.icar.gov.in', 'dogr.icar.gov.in', 'ncipm.icar.gov.in', 'nhb.gov.in', 'agriwelfare.gov.in', 'agricoop.nic.in', 'vikaspedia.in', 'agritech.tnau.ac.in', 'tnau.ac.in', 'mpkv.ac.in', 'vnmkv.ac.in', 'pdkv.ac.in', 'dbskkv.org', 'pau.edu', 'hau.ac.in', 'uasd.edu', 'iari.res.in', 'farmer.gov.in', 'krishi.maharashtra.gov.in'];
const R_BAN = ['alachlor','aldicarb','aldrin','benzene hexachloride','benomyl','calcium cyanide','carbaryl','chlorobenzilate','chlordane','chlorfenvinphos','copper acetoarsenite','diazinon','dibromochloropropane','dichlorvos','dicofol','dieldrin','dinocap','endosulfan','endrin','ethylmercury chloride','ethyl parathion','ethylene dibromide','fenarimol','fenthion','heptachlor','lindane','linuron','maleic hydrazide','menazon','methomyl','methyl parathion','metoxuron','nitrofen','pentachloronitrobenzene','pentachlorophenol','phenylmercury acetate','phorate','phosphamidon','sodium cyanide','sodium methanearsonate','tetradifon','thiometon','toxaphene','triazophos','tridemorph','trichloroacetic acid','trichlorfon','dalapon','ferbam','formothion','nickel chloride','paradichlorobenzene','simazine','sirmate','warfarin','ammonium sulphamate','azinphos','binapacryl','calcium arsenate','carbophenothion','chinomethionate','dicrotophos','fentin','lead arsenate','leptophos','mephosfolan','mevinphos','disulfoton','vamidothion'];
const R_BAN_SRC = { title: 'CIB&RC/PPQS banned & restricted list (31.03.2024) — summary', url: 'https://en.wikipedia.org/wiki/List_of_banned_and_restricted_pesticides_in_India', source_type: 'government_list' };
const rNorm = t => String(t || '').toLowerCase().replace(/[‘’“”]/g, "'").replace(/[^a-z0-9%./' ]+/g, ' ').replace(/\s+/g, ' ').trim();
const rDigits = t => (String(t || '').match(/\d+(\.\d+)?/g) || []);
const rHost = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return ''; } };
const rIsOfficial = u => { const h = rHost(u); return R_OFFICIAL.some(d => h === d || h.endsWith('.' + d)) || /\.gov\.in$|\.nic\.in$/.test(h); };
async function rFetchJson(url, opt = {}, ms = 9000) {
  const c = new AbortController(); const t = setTimeout(() => c.abort(), ms);
  try { const r = await fetch(url, { ...opt, signal: c.signal }); const txt = await r.text(); let j = null; try { j = JSON.parse(txt); } catch (e) {} return { status: r.status, j, txt }; }
  finally { clearTimeout(t); }
}
async function rWiki(q, must) {
  const s = await rFetchJson('https://en.wikipedia.org/w/rest.php/v1/search/page?limit=1&q=' + encodeURIComponent(q), { headers: R_UA });
  const key = s.j && s.j.pages && s.j.pages[0] && s.j.pages[0].key; if (!key) return null;
  const p = await rFetchJson('https://en.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(key), { headers: R_UA });
  if (!p.j || !p.j.extract || p.j.type === 'disambiguation') return null;
  if (must && !must.some(w => w.split(' ').some(x => x.length >= 4 && p.j.title.toLowerCase().includes(x)))) return null;   // page ka naam hi milna chahiye
  return { title: p.j.title, text: p.j.extract, url: (p.j.content_urls && p.j.content_urls.desktop && p.j.content_urls.desktop.page) || ('https://en.wikipedia.org/wiki/' + key) };
}
async function rTavily(env, query, opts = {}) {
  const h = { 'Content-Type': 'application/json' };
  if (env.TAVILY_API_KEY) h.Authorization = 'Bearer ' + env.TAVILY_API_KEY; else h['X-Tavily-Access-Mode'] = 'keyless';
  const body = { query, search_depth: 'basic', max_results: Math.min(20, opts.max || 4), include_raw_content: opts.raw ? 'text' : false, include_favicon: true };
  if (opts.domains) body.include_domains = opts.domains;
  const r = await rFetchJson('https://api.tavily.com/search', { method: 'POST', headers: h, body: JSON.stringify(body) }, 15000);
  if (r.status === 429 || r.status === 432 || r.status === 433) return { limit: true, results: [] };
  if (!r.j || !Array.isArray(r.j.results)) return { error: (r.txt || '').slice(0, 120), results: [] };
  return { results: r.j.results };
}
async function rLLM(env, sys, user, max = 700) {
  const r = await env.AI.run('@cf/meta/llama-3.1-8b-instruct-fast', { messages: [{ role: 'system', content: sys }, { role: 'user', content: user }], max_tokens: max, temperature: 0 });
  return jsonFrom(r && r.response);
}
// Source ke text se, kisi vishay (subject) par, sirf diye gaye fields nikalo; quote jaancho
// Source ke text ko vakya (sentence) me todo, number do; LLM sirf vakya-number batata hai -> quote hamesha asli shabd
async function rExtract(env, text, subject, fields) {
  const t = String(text || '').replace(/\s+/g, ' '); if (t.length < 80) return [];
  const sents = t.split(/(?<=[.;!?])\s+|\s+\|\s+|\s•\s/).map(x => x.trim()).filter(x => x.length >= 25 && x.length <= 400);
  const keys = String(subject).toLowerCase().split(/[\s,]+/).filter(w => w.length >= 4);
  const hits = []; sents.forEach((x, i) => { if (keys.some(k => x.toLowerCase().includes(k))) for (let d = -2; d <= 3; d++) if (sents[i + d] && !hits.includes(i + d)) hits.push(i + d); });
  const pick = hits.sort((a, b) => a - b).slice(0, 70); if (!pick.length) return [];
  const d = await rLLM(env, 'You read numbered sentences from a source and pick facts. Use ONLY these sentences. Output ONE JSON object only.',
    `SUBJECT: ${subject}\nFIELDS: ${fields.join(', ')}\nReturn {"items":[{"field":"<one of FIELDS>","value":"short English fact","s":<sentence number>}]} — only facts clearly about the SUBJECT, each supported by that single sentence. If none: {"items":[]}.\nSENTENCES:\n${pick.map(k => `[${k}] ${sents[k]}`).join('\n')}`, 900);
  const out = [];
  for (const x of ((d && d.items) || [])) {
    if (!x || !fields.includes(x.field) || !x.value || !pick.includes(+x.s)) continue;
    const q = sents[+x.s];
    if (!rDigits(x.value).every(n => rDigits(q).includes(n))) continue;                    // value ke ank vakya me hone chahiye
    if (x.field === 'dosage' && !rDigits(q).length) continue;
    out.push({ field: x.field, value: String(x.value).slice(0, 220), quote: q });
  }
  return out.slice(0, 12);
}
async function rToMr(env, lines) {
  return Promise.all(lines.map(async en => {
    try {
      const r = await env.AI.run('@cf/meta/m2m100-1.2b', { text: en, source_lang: 'english', target_lang: 'marathi' });
      const m = String((r && r.translated_text) || '');
      return m && /[ऀ-ॿ]/.test(m) && rDigits(en).every(n => rDigits(m).includes(n)) ? m : en;   // ank badle to English hi
    } catch (e) { return en; }
  }));
}
const R_FIELD_MR = { dosage: 'अधिकृत प्रमाण (dose)', crops: 'मंजूर / नमूद पिके', pests: 'किडी / रोग', phi: 'काढणीपूर्वी थांबायचे दिवस (PHI)', method: 'वापरण्याची पद्धत', timing: 'वापरण्याची वेळ', max_applications: 'जास्तीत जास्त फवारण्या', safety: 'सुरक्षा', first_aid: 'प्रथमोपचार', storage: 'साठवण', disposal: 'रिकामे डबे/उरलेले औषध', reentry: 'शेतात पुन्हा जाण्याआधी थांबा', symptoms: 'लक्षणे', cause: 'कारण', conditions: 'रोग वाढण्याचे हवामान/परिस्थिती', lifecycle: 'जीवनचक्र', prevention: 'प्रतिबंध', cultural: 'शेतीतील उपाय', biological: 'जैविक उपाय', crops_affected: 'कोणत्या पिकांवर', how: 'हे कसे काम करते / काय आहे' };
async function rEmitItems(env, emit, id, items, source) {
  if (!items.length) return 0;
  const mr = await rToMr(env, items.map(x => x.value));
  await emit({ type: 'section', id, items: items.map((x, i) => ({ field: x.field, label_mr: R_FIELD_MR[x.field] || x.field, text_mr: mr[i], text_en: x.value, quote: x.quote, verified: true, source })) });
  return items.length;
}
async function runResearch(b, env, emit) {
  const DBG = {};
  const now = new Date().toISOString();
  const step = (id, status, extra = {}) => emit({ type: 'step', id, status: (status === 'fail' && /4006|3036|neurons/.test(JSON.stringify(extra))) ? 'quota' : status, ...extra });
  if (b.kind === 'product') {
    const P = b.product || {}, ai = (P.ais || []).map(a => String(a.name || '').trim()).filter(Boolean).slice(0, 2);
    const conc = (P.ais || []).map(a => a.concentration).filter(Boolean).join(' + '), name = String(P.name || '').slice(0, 60), comp = String(P.company || '').slice(0, 60);
    const subj = ai[0] || name; const dosages = [];
    if (P.dosage) dosages.push({ value: String(P.dosage), source: { title: 'उत्पादनाचे लेबल (तुमचा फोटो)', url: '', source_type: 'label_photo', retrieved_at: now } });
    const tasks = [];
    // 1. CIB&RC banned/restricted
    tasks.push((async () => {
      await step('reg', 'run');
      const hit = ai.filter(n => R_BAN.some(x => n.toLowerCase().includes(x)));
      await emit({ type: 'section', id: 'reg', items: [{ field: 'regulatory', label_mr: 'सरकारी बंदी यादी तपासणी', text_mr: hit.length ? `🚫 ${hit.join(', ')} — भारतात बंदी / नोंदणी नाकारलेल्या यादीत.` : `${ai.join(', ') || name} — बंदी यादीत (31.03.2024 पर्यंत) सापडले नाही. नोंदणी CIR क्रमांकाने तपासा.`, verified: true, source: { ...R_BAN_SRC, retrieved_at: now } }] });
      await step('reg', 'ok');
    })());
    // 2. Wikipedia: sakriya ghatak kya hai / kaise kaam karta hai
    tasks.push((async () => {
      await step('wiki', 'run');
      try {
        let n = 0;
        for (const a of ai) { const w = await rWiki(a, [a.toLowerCase().split(/\s+/)[0]]); if (!w) continue; const first = w.text.split(/(?<=\.)\s+/).slice(0, 3).join(' ');
          n += await rEmitItems(env, emit, 'how', [{ field: 'how', value: first, quote: first }], { title: 'Wikipedia: ' + w.title, url: w.url, source_type: 'encyclopedia', retrieved_at: now }); }
        await step('wiki', n ? 'ok' : 'none');
      } catch (e) { await step('wiki', 'fail'); }
    })());
    // 3. Sarkari / vishwavidyalay ke page (Tavily) -> quote ke saath
    tasks.push((async () => {
      await step('official', 'run');
      try {
        const r = await rTavily(env, `${subj} ${conc} ${P.formulation || ''} ${(P.crops || [])[0] || ''} dosage recommendation`, { domains: R_OFFICIAL, raw: true, max: 3 });
        if (r.limit) return step('official', 'limit');
        let n = 0; DBG.official = { got: r.results.length, err: r.error || '', urls: r.results.map(x => rHost(x.url) + ':' + String(x.raw_content || x.content || '').length) };
        for (const x of r.results.slice(0, 3)) {
          if (!rIsOfficial(x.url)) continue;
          const items = await rExtract(env, x.raw_content || x.content, subj, ['dosage', 'crops', 'pests', 'phi', 'method', 'timing', 'max_applications', 'safety', 'first_aid', 'storage', 'disposal', 'reentry']);
          const src = { title: x.title, url: x.url, source_type: 'official', retrieved_at: now };
          items.filter(i => i.field === 'dosage').forEach(i => dosages.push({ value: i.value, source: src }));
          n += await rEmitItems(env, emit, 'official', items, src);
        }
        if (!n && ai.length) {   // dusra tareeka: sirf ghatak + pik ke naam se
          const r2 = await rTavily(env, `${ai.join(' ')} ${(P.crops || []).slice(0, 2).join(' ')} recommended dose insecticide fungicide`, { domains: R_OFFICIAL, raw: true, max: 3 });
          for (const x of (r2.results || []).slice(0, 3)) { if (!rIsOfficial(x.url)) continue;
            const items = await rExtract(env, x.raw_content || x.content, subj, ['dosage', 'crops', 'pests', 'phi', 'method', 'timing', 'max_applications', 'safety', 'first_aid', 'storage', 'disposal', 'reentry']);
            const src = { title: x.title, url: x.url, source_type: 'official', retrieved_at: now };
            items.filter(i => i.field === 'dosage').forEach(i => dosages.push({ value: i.value, source: src }));
            n += await rEmitItems(env, emit, 'official', items, src); }
        }
        await step('official', n ? 'ok' : 'none', { dbg: DBG.official });
      } catch (e) { await step('official', 'fail', { dbg: String(e).slice(0, 120) }); }
    })());
    // 4. Company ki website (Tavily)
    tasks.push((async () => {
      await step('maker', 'run');
      try {
        if (!name) return step('maker', 'none');
        const r = await rTavily(env, `${name} ${comp} ${subj} label`, { raw: true, max: 4 });
        if (r.limit) return step('maker', 'limit');
        const tok = (comp || name).toLowerCase().split(/[^a-z]+/).filter(t => t.length >= 4 && !['limited', 'india', 'private', 'crop', 'science', 'sciences'].includes(t));
        const mk = r.results.filter(x => tok.some(t => rHost(x.url).includes(t))).slice(0, 2);
        let n = 0;
        for (const x of mk) { const items = await rExtract(env, x.raw_content || x.content, name, ['dosage', 'crops', 'pests', 'phi', 'method', 'safety', 'first_aid', 'storage', 'disposal']);
          const src = { title: x.title, url: x.url, source_type: 'manufacturer', retrieved_at: now };
          items.filter(i => i.field === 'dosage').forEach(i => dosages.push({ value: i.value, source: src }));
          n += await rEmitItems(env, emit, 'maker', items, src); }
        await step('maker', n ? 'ok' : 'none');
      } catch (e) { await step('maker', 'fail'); }
    })());
    // 5. Online kimat: kai websites (prices.js) — seedha code se milan, hisaab aur ranking
    tasks.push((async () => {
      await step('price', 'run');
      try {
        const out = await searchPrices({ name, company: comp, formulation: P.formulation || '', ais: P.ais || [] }, (q, o) => rTavily(env, q, o), now);
        if (out.limit) return step('price', 'limit');
        await emit({ type: 'prices', ...out });
        const alt = out.listings.filter(l => l.match === 'same_ai').slice(0, 6).map(l => ({ title: l.title, url: l.url }));
        if (alt.length) await emit({ type: 'unverified', id: 'alt', items: alt, note: 'same_ingredient_listing' });
        await step('price', out.valid_sites ? 'ok' : 'none', { dbg: { responded: out.responded_sites, listings: out.listings.length, errors: out.errors } });
      } catch (e) { await step('price', 'fail', { dbg: String(e).slice(0, 120) }); }
    })());
    await Promise.allSettled(tasks);
    // Matra me farak? average nahi — conflict
    const uniq = []; dosages.forEach(d => { const v = String(d.value).toLowerCase().replace(/millilit(re|er)s?/g, 'ml').replace(/kilograms?|kgs/g, 'kg').replace(/grams?|gms?/g, 'g').replace(/lit(re|er)s?|ltrs?/g, 'l').replace(/acres?/g, 'ac').replace(/hectares?/g, 'ha'); const k = rDigits(v).map(Number).join('/') + ' ' + (v.match(/\bml\b|\bkg\b|\bg\b|\bl\b|%|\bac\b|\bha\b/g) || []).join(''); if (!uniq.find(u => u.k === k)) uniq.push({ k, ...d }); });
    if (uniq.length > 1) await emit({ type: 'conflict', field: 'dosage', items: uniq.map(u => ({ value: u.value, source: u.source })) });
    return;
  }
  if (b.kind === 'prices') {
    const P = b.product || {};
    await step('price', 'run');
    try {
      const out = await searchPrices({ name: String(P.name || '').slice(0, 60), company: '', formulation: P.formulation || '', ais: (P.ais || []).slice(0, 2), ingredient_mode: !P.name }, (q, o) => rTavily(env, q, o), now);
      if (out.limit) return step('price', 'limit');
      await emit({ type: 'prices', ...out }); await step('price', out.valid_sites ? 'ok' : 'none');
    } catch (e) { await step('price', 'fail'); }
    return;
  }
  if (b.kind === 'disease') {
    const D = b.disease || {}, prob = String(D.problem_en || '').slice(0, 80), crop = String(D.crop || '').slice(0, 30);
    if (!prob) return step('wiki', 'none');
    const tasks = [];
    tasks.push((async () => {
      await step('wiki', 'run');
      try { const mw = [prob.toLowerCase().replace(/\s+/g, ' ').trim()]; const w = await rWiki(prob, mw) || await rWiki(`${prob} ${crop}`, mw); if (!w) return step('wiki', 'none');
        const first = w.text.split(/(?<=\.)\s+/).slice(0, 3).join(' ');
        await rEmitItems(env, emit, 'how', [{ field: 'how', value: first, quote: first }], { title: 'Wikipedia: ' + w.title, url: w.url, source_type: 'encyclopedia', retrieved_at: now });
        await step('wiki', 'ok'); } catch (e) { await step('wiki', 'fail'); }
    })());
    tasks.push((async () => {
      await step('official', 'run');
      try {
        const r = await rTavily(env, `${prob} ${crop} symptoms management`, { domains: R_OFFICIAL, raw: true, max: 3 });
        if (r.limit) return step('official', 'limit');
        let n = 0;
        for (const x of r.results.slice(0, 3)) { if (!rIsOfficial(x.url)) continue;
          const items = await rExtract(env, x.raw_content || x.content, prob, ['symptoms', 'cause', 'conditions', 'lifecycle', 'prevention', 'cultural', 'biological', 'crops_affected']);
          n += await rEmitItems(env, emit, 'official', items, { title: x.title, url: x.url, source_type: 'official', retrieved_at: now }); }
        await step('official', n ? 'ok' : 'none');
      } catch (e) { await step('official', 'fail'); }
    })());
    await Promise.allSettled(tasks);
  }
}
