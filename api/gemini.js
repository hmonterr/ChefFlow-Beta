/**
 * POST /api/gemini
 * Server-side Gemini proxy. Holds GEMINI_API_KEY so it NEVER ships to the browser.
 * (The key was previously inlined into the client bundle via Vite `define` and
 *  harvested from the public site, which got the whole GCP project suspended.)
 *
 * Body: { contents, config? }  — same shape the @google/genai SDK expects,
 *        MINUS `model`. The model is forced here on purpose.
 * Response: { text }  — mirrors the SDK's `response.text`.
 */

import { GoogleGenAI } from '@google/genai';

// Forced server-side. The client is NOT allowed to choose the model — that is what
// stops a leaked/abused endpoint from running gemini-3 / audio / video / image-gen
// on our quota. The whole app only ever used flash text+image.
const MODEL = 'gemini-2.5-flash';

// Lock CORS to the app's origin. Set ALLOWED_ORIGIN on the host (e.g. the Wix
// domain). Defaults to '*' only so local dev works; set it in production.
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';

let _ai;
function getAI() {
  if (!_ai) {
    if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY not set');
    _ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }
  return _ai;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed — use POST' });

  const { contents, config } = req.body || {};
  if (!contents) return res.status(400).json({ error: 'contents is required' });

  try {
    // ponytail: model forced to flash; origin-locked CORS. This stops key theft and
    // expensive-model abuse. It does NOT yet stop an anonymous caller burning flash
    // quota via this endpoint — add Firebase ID-token verification next (the app
    // already authenticates every user) to close that.
    const r = await getAI().models.generateContent({ model: MODEL, contents, config });
    return res.status(200).json({ text: r.text ?? '' });
  } catch (err) {
    // Forward the upstream status so the client's geminiErrorMessage() can still
    // classify 429 (rate limit), 401/403 (auth), etc.
    const status = Number(err?.status) || 502;
    console.error('[gemini] error:', err?.message);
    return res.status(status).json({ error: err?.message || 'Gemini error', status });
  }
}
