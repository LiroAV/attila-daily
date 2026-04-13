export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const key = process.env.FINNHUB_API_KEY;
  if (!key) {
    res.status(500).json({ error: 'Finnhub API key is not configured' });
    return;
  }

  const symbols = String(req.query.symbols || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
    .slice(0, 30);

  if (!symbols.length) {
    res.status(400).json({ error: 'Missing symbols' });
    return;
  }

  try {
    const results = await Promise.allSettled(
      symbols.map(async sym => {
        const url = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(sym)}&token=${encodeURIComponent(key)}`;
        const r = await fetch(url);
        const d = await r.json();
        return { sym, d };
      })
    );

    const quotes = {};
    results.forEach(result => {
      if (result.status === 'fulfilled' && result.value.d.c) {
        const { sym, d } = result.value;
        quotes[sym] = {
          price: d.c,
          changeAbs: d.d,
          changePct: d.dp,
          open: d.o,
          high: d.h,
          low: d.l,
          prevClose: d.pc,
          wkHigh: null,
          wkLow: null,
          name: ''
        };
      }
    });

    res.status(200).json({ quotes });
  } catch {
    res.status(502).json({ error: 'Finnhub request failed' });
  }
}
