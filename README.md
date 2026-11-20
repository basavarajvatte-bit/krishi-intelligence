# Krishi Intelligence — Phase 1

Website for farmers, free to run on GitHub Pages:
- **Today's mandi price**: data.gov.in (Agmarknet). A GitHub Action fetches it automatically each day. A past day's file is never overwritten.
- **Mandi comparison**: real income after subtracting transport, loading/unloading and market charges.
- **Price history**: big onion and tomato price spikes and crashes from news, each with its source link, plus a rough estimate of the next wave.
- **Profit calculator**: bad, normal and good cases.

No fake prices are shown. If there is no data, the site says so clearly.

Setup: add the secret `DATA_GOV_KEY` under Settings → Secrets → Actions, then turn on Settings → Pages → main branch.
