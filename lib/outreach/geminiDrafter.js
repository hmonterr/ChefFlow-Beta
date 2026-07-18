/**
 * Gemini-powered outreach drafter.
 * Uses @google/genai — ai.models.generateContent (genai-compliant).
 */

import { GoogleGenAI } from '@google/genai';

const GEMINI_MODEL    = 'gemini-2.5-flash';
const MAX_EMAIL_WORDS = 200;

const CANSPAM_CLOSE = "If you'd prefer not to hear from me, just reply 'unsubscribe' and I'll remove you right away.";
const FOUNDER_NAME  = 'Hugo Monterrey';
const APP_NAME      = 'Grouper';

let _ai;
function getAI() {
  if (!_ai) {
    if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY not set');
    _ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }
  return _ai;
}

export async function draftOutreach(lead) {
  const { channel } = lead;
  if (channel === 'Email')     return draftEmail(lead);
  if (channel === 'Instagram') return draftIgDm(lead);
  throw new Error(`Unknown channel: "${channel}"`);
}

async function draftEmail(lead) {
  const { name, business, city, geoRing, personalizationNotes } = lead;
  const isSanDiego = geoRing === 'San Diego';
  const hasContext = personalizationNotes && personalizationNotes.length > 20;

  const prompt = `You are drafting a short cold outreach email on behalf of ${FOUNDER_NAME}, founder of ${APP_NAME} — a scheduling and client-management SaaS app for personal chefs.

Recipient chef:
- Name / Business: ${business || name || '(unknown)'}
- City: ${city || '(unknown)'}
- Context from their website: ${hasContext ? personalizationNotes : 'Limited info — be honest-generic, do NOT fabricate specialties or client details.'}

Write a peer-to-peer cold email inviting this chef to beta test ${APP_NAME} for free.

Constraints:
- 100–150 words maximum (body only)
- Tone: casual and collegial
${isSanDiego ? '- Mention the "fellow San Diego" local angle. Optionally suggest a casual coffee.' : '- Keep it warm but geographically neutral.'}
- One clear CTA: try the free beta (no URL needed)
- Close with exactly this opt-out line: "${CANSPAM_CLOSE}"
- Plain text ONLY — no HTML, no markdown, no bullet points
- Subject: conversational, max 8 words, not salesy
- NEVER fabricate specifics about the chef

Respond with ONLY valid JSON:
{"subject": "...", "body": "..."}`;

  const raw    = await generate(prompt);
  const parsed = parseJSON(raw, 'email draft');

  if (!parsed.subject || !parsed.body) throw new Error('Gemini email draft: missing subject or body');
  if (parsed.body.trim().split(/\s+/).length > MAX_EMAIL_WORDS) throw new Error('Gemini email draft too long');

  return {
    draftSubject:         parsed.subject.trim(),
    draftEmail:           parsed.body.trim(),
    personalizationNotes: personalizationNotes || '(no website data)',
  };
}

async function draftIgDm(lead) {
  const { name, business, city, geoRing, personalizationNotes } = lead;
  const isSanDiego = geoRing === 'San Diego';
  const hasContext = personalizationNotes && personalizationNotes.length > 20;

  const prompt = `You are drafting a short cold Instagram DM on behalf of ${FOUNDER_NAME}, founder of ${APP_NAME} — a scheduling and client-management SaaS app for personal chefs.

Recipient:
- Name / Business: ${business || name || '(unknown)'}
- City: ${city || '(unknown)'}
- Context: ${hasContext ? personalizationNotes : 'Limited info — be honest-generic, no fabrications.'}

Write a casual, direct IG DM inviting this chef to beta test ${APP_NAME} for free.

Constraints:
- 60–80 words max
- Very casual — sounds like a DM from a fellow chef
${isSanDiego ? '- SD local angle if natural.' : ''}
- One clear CTA: try the free beta
- Plain text only
- NEVER fabricate specific details

Respond with ONLY valid JSON:
{"body": "..."}`;

  const raw    = await generate(prompt);
  const parsed = parseJSON(raw, 'IG DM draft');

  if (!parsed.body) throw new Error('Gemini IG DM draft: missing body');

  return {
    draftIgDm:            parsed.body.trim(),
    personalizationNotes: personalizationNotes || '(no website data)',
  };
}

async function generate(prompt) {
  const ai     = getAI();
  const result = await ai.models.generateContent({
    model:    GEMINI_MODEL,
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    config:   { responseMimeType: 'application/json' },
  });
  return result.text.trim();
}

function parseJSON(raw, label) {
  try {
    return JSON.parse(raw);
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error(`Gemini ${label}: could not parse JSON response`);
    return JSON.parse(match[0]);
  }
}
