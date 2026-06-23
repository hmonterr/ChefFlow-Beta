'use strict';

/**
 * Gemini-powered outreach drafter.
 * Uses @google/genai — ai.models.generateContent (genai-compliant).
 * Never uses legacy ai.getGenerativeModel.
 */

const { GoogleGenAI } = require('@google/genai');

const GEMINI_MODEL    = 'gemini-2.5-flash';
const MAX_EMAIL_WORDS = 200; // reject + throw if Gemini overshoots

let _ai;
function getAI() {
  if (!_ai) {
    if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY not set');
    _ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }
  return _ai;
}

const FOUNDER_NAME  = 'Hugo Monterrey';
const APP_NAME      = 'ChefFlow';
const CANSPAM_CLOSE = "If you'd prefer not to hear from me, just reply 'unsubscribe' and I'll remove you right away.";

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Drafts outreach content for the lead's chosen channel.
 * @param {{ name, business, city, geoRing, channel, personalizationNotes }} lead
 * @returns {{ draftSubject?, draftEmail?, draftIgDm?, personalizationNotes }}
 */
async function draftOutreach(lead) {
  const { channel } = lead;

  if (channel === 'Email') return draftEmail(lead);
  if (channel === 'Instagram') return draftIgDm(lead);

  throw new Error(`Unknown channel: "${channel}"`);
}

// ─── Email ───────────────────────────────────────────────────────────────────

async function draftEmail(lead) {
  const { name, business, city, geoRing, personalizationNotes } = lead;
  const isSanDiego = geoRing === 'San Diego';
  const hasContext = personalizationNotes && personalizationNotes.length > 20;

  const prompt = `You are drafting a short cold outreach email on behalf of ${FOUNDER_NAME}, founder of ${APP_NAME} — a scheduling and client-management SaaS app for personal chefs.

Recipient chef:
- Name / Business: ${business || name || '(unknown)'}
- City: ${city || '(unknown)'}
- Context from their website: ${hasContext ? personalizationNotes : 'Limited info — be honest-generic, do NOT fabricate specialties or client details.'}

Your task: write a peer-to-peer cold email inviting this chef to beta test ${APP_NAME} for free.

Constraints:
- 100–150 words maximum (body only, not counting subject)
- Tone: casual and collegial — ${FOUNDER_NAME} is also in the personal chef world
${isSanDiego ? '- Mention the "fellow San Diego" local angle. Optionally suggest a casual coffee or meetup.' : '- Keep it warm but geographically neutral.'}
- One clear CTA: try the free beta (no URL needed — Hugo will personalise before sending)
- Close with exactly this opt-out line: "${CANSPAM_CLOSE}"
- Plain text ONLY — no HTML, no markdown, no bullet points, no em dashes
- Subject: conversational, max 8 words, not salesy
- NEVER fabricate specifics about the chef's cuisine, clients, or reviews

Respond with ONLY valid JSON — no prose, no code fences:
{"subject": "...", "body": "..."}`;

  const raw = await generate(prompt);

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('Gemini email draft: could not parse JSON response');
    parsed = JSON.parse(match[0]);
  }

  if (!parsed.subject || !parsed.body) {
    throw new Error('Gemini email draft: missing subject or body in response');
  }

  const wordCount = parsed.body.trim().split(/\s+/).length;
  if (wordCount > MAX_EMAIL_WORDS) {
    throw new Error(`Gemini email draft too long (${wordCount} words — max ${MAX_EMAIL_WORDS})`);
  }

  return {
    draftSubject:         parsed.subject.trim(),
    draftEmail:           parsed.body.trim(),
    personalizationNotes: personalizationNotes || '(no website data)',
  };
}

// ─── Instagram DM ────────────────────────────────────────────────────────────

async function draftIgDm(lead) {
  const { name, business, city, geoRing, personalizationNotes } = lead;
  const isSanDiego = geoRing === 'San Diego';
  const hasContext = personalizationNotes && personalizationNotes.length > 20;

  const prompt = `You are drafting a short cold Instagram DM on behalf of ${FOUNDER_NAME}, founder of ${APP_NAME} — a scheduling and client-management SaaS app for personal chefs.

Recipient chef:
- Name / Business: ${business || name || '(unknown)'}
- City: ${city || '(unknown)'}
- Context: ${hasContext ? personalizationNotes : 'Limited info — be honest-generic, no fabrications.'}

Your task: write a casual, direct IG DM inviting this chef to beta test ${APP_NAME} for free.

Constraints:
- 60–80 words max
- Very casual — sounds like a DM from a fellow chef, not a pitch
${isSanDiego ? '- SD local angle if it fits naturally.' : ''}
- One clear CTA: try the free beta
- No opt-out line (not needed for DMs)
- Plain text only
- NEVER fabricate specific details

Respond with ONLY valid JSON — no prose, no code fences:
{"body": "..."}`;

  const raw = await generate(prompt);

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('Gemini IG DM draft: could not parse JSON response');
    parsed = JSON.parse(match[0]);
  }

  if (!parsed.body) throw new Error('Gemini IG DM draft: missing body in response');

  return {
    draftIgDm:            parsed.body.trim(),
    personalizationNotes: personalizationNotes || '(no website data)',
  };
}

// ─── Internal ────────────────────────────────────────────────────────────────

async function generate(prompt) {
  const ai     = getAI();
  const result = await ai.models.generateContent({
    model:    GEMINI_MODEL,
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    config:   { responseMimeType: 'application/json' },
  });
  return result.text.trim();
}

module.exports = { draftOutreach };
