# Online research + price engine (Scanner / Crop Doctor)

## Flow
1. **Stage A – pehchaan:** `/vision` (3 Workers AI vision models ki race). Result turant dikhta hai.
2. **Stage B – research:** `POST /research` (Server-Sent Events). Har hissa alag task:
   `reg` (CIB&RC ban list), `wiki` (Wikipedia REST), `official` (sarkari/university domains via Tavily),
   `maker` (company site), `price` (price engine). Har event aate hi website par dikhta hai.
   - `kind: product | disease | prices` (prices = crop doctor, active ingredient se).
   - Events: `start, step{id,status}, section{items[]}, prices{...}, unverified, conflict, error, done`.

## Verification rules (worker/worker.js)
- Source text ko vakyon me tod kar number diye jaate hain; LLM sirf vakya-number batata hai → quote hamesha asli shabd.
- Value ke saare ank us vakya me hone chahiye; dose bina ank ke nahi.
- Alag-alag dose → `conflict` event (average nahi).
- Marathi: `@cf/meta/m2m100-1.2b`; ank badle to English hi dikhate hain.

## Price engine (worker/prices.js)
- `SELLERS` = connector list (16 sites). Naya seller = ek line. Khule web-search se aur sites bhi milti hain.
- Har scan par max 3 Tavily basic searches (3 credits): sellers, open web, active ingredient.
- `classify()` → exact / same_brand_diff / same_ai / diff_conc / unrelated (naam + % + formulation).
- `toListing()` kimat, MRP, pack, delivery, stock, ETA sirf search result ke text se. Na mile to `null`.
- `rank()` seedha code: ₹ per litre/kg + delivery; sirf exact, kimat pata, stock, aur jaana-pehchana seller.
  Anjaan/B2B seller sabse sasta ho to bhi top 4 me nahi (chetavni ke saath dikhta hai). Ek site ek baar.
- Kimat "search-engine me dikhi" hoti hai, live checkout price nahi — UI me tareekh/samay ke saath likha hai.
- History aur alert: browser `localStorage` (`prhist`, `pralert`) — sirf sach me dekhi kimaten.

## Keys / cost
- `TAVILY_API_KEY` (optional, free 1,000 credits/month, no card) → GitHub secret → deploy workflow Worker secret me daalta hai.
  Na ho to Tavily keyless mode (bahut kam limit).
- Workers AI free 10,000 neurons/day, hard stop — koi paid fallback nahi.

## Tests
`node tests/research_unit.mjs`, `node tests/prices_unit.mjs`, `python3 tests/research_ui.py`,
live: Actions → "Research live test".
