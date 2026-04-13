const DEFAULT_MODEL = 'gemini-2.5-flash-lite';
const FALLBACK_MODELS = ['gemini-2.5-flash-lite', 'gemini-2.5-flash'];

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    res.status(500).json({ error: 'Gemini API key is not configured' });
    return;
  }

  const prompt = typeof req.body?.prompt === 'string' ? req.body.prompt.trim() : '';
  if (!prompt) {
    res.status(400).json({ error: 'Missing prompt' });
    return;
  }

  const maxTokens = Number.isFinite(Number(req.body?.maxTokens))
    ? Math.min(Math.max(Number(req.body.maxTokens), 1), 1200)
    : 300;
  const primaryModel = process.env.GEMINI_MODEL || DEFAULT_MODEL;
  const models = [...new Set([primaryModel, ...FALLBACK_MODELS])];

  try {
    let lastError = 'Gemini request failed';

    for (const model of models) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
      const geminiRes = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: maxTokens }
        })
      });

      const data = await geminiRes.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

      if (geminiRes.ok && text) {
        res.status(200).json({ text, model });
        return;
      }

      lastError = data.error?.message || `Gemini request failed for ${model}`;
      const transient = geminiRes.status === 429 || geminiRes.status === 503 || /high demand|overloaded|try again/i.test(lastError);
      if (!transient) break;
    }

    res.status(502).json({ error: lastError });
  } catch {
    res.status(502).json({ error: 'Gemini request failed' });
  }
}
