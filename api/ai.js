const DEFAULT_MODEL = 'gemini-2.5-flash-lite';
const FALLBACK_MODELS = ['gemini-2.5-flash-lite']; // Flash has stricter free-tier limits than Lite — don't fall back to it
const MAX_TOKENS_CAP = 2000;

const SYSTEM_INSTRUCTION = `You are the personal assistant for Attila — a sharp, curious guy who's into tech, AI, football (Barcelona and Liverpool fan), investing, and self-improvement. You know him well and talk to him like a smart, witty friend: warm, direct, and a little opinionated when it's useful. Keep responses tight and punchy. No filler, no corporate speak, no disclaimers, no robotic lists unless specifically asked.`;

async function callModel(model, key, prompt, maxTokens) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        maxOutputTokens: maxTokens,
        temperature: 0.85,
        topP: 0.92
      }
    })
  });
  const data = await res.json();
  return { res, data };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  const key = process.env.GEMINI_API_KEY;
  if (!key) { res.status(500).json({ error: 'Gemini API key is not configured' }); return; }

  const prompt = typeof req.body?.prompt === 'string' ? req.body.prompt.trim() : '';
  if (!prompt) { res.status(400).json({ error: 'Missing prompt' }); return; }

  const requestedTokens = Number.isFinite(Number(req.body?.maxTokens))
    ? Math.min(Math.max(Number(req.body.maxTokens), 1), MAX_TOKENS_CAP)
    : 400;

  const primaryModel = process.env.GEMINI_MODEL || DEFAULT_MODEL;
  const models = [...new Set([primaryModel, ...FALLBACK_MODELS])];

  try {
    let lastError = 'Gemini request failed';

    for (const model of models) {
      let maxTokens = requestedTokens;

      for (let attempt = 0; attempt < 2; attempt++) {
        const { res: geminiRes, data } = await callModel(model, key, prompt, maxTokens);
        const candidate = data.candidates?.[0];
        const text = candidate?.content?.parts?.[0]?.text;
        const finishReason = candidate?.finishReason;

        if (geminiRes.ok && text) {
          // If the model was cut off, retry with 50% more tokens (once)
          if (finishReason === 'MAX_TOKENS' && attempt === 0) {
            maxTokens = Math.min(Math.round(maxTokens * 1.5), MAX_TOKENS_CAP);
            continue;
          }
          res.status(200).json({ text, model, finishReason });
          return;
        }

        lastError = data.error?.message || `Gemini request failed for ${model}`;
        const transient = geminiRes.status === 429 || geminiRes.status === 503 || /high demand|overloaded|try again/i.test(lastError);
        if (!transient) break;
        break; // don't retry non-truncation errors
      }

      if (!/high demand|overloaded|try again/i.test(lastError) && !lastError.includes('429') && !lastError.includes('503')) break;
    }

    res.status(502).json({ error: lastError });
  } catch {
    res.status(502).json({ error: 'Gemini request failed' });
  }
}
