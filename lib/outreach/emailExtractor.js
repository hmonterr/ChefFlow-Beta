'use strict';

/**
 * Thin email extractor: fetches homepage + /contact, looks for mailto links
 * then visible email patterns. Returns first non-generic hit, or null.
 *
 * Failures are non-fatal — callers should handle null and route lead to IG.
 */

const EMAIL_REGEX   = /\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/g;
const GENERIC_LOCAL = new Set([
  'info', 'contact', 'hello', 'support', 'admin', 'noreply', 'no-reply',
  'webmaster', 'mail', 'office', 'team', 'bookings', 'inquiries', 'inquiry',
]);
const FETCH_TIMEOUT_MS = 8_000;
const USER_AGENT = 'ChefFlow-Outreach/1.0 (beta sourcing; contact hugo@chef-m-meals.com)';

/**
 * @param {string|null} websiteUrl
 * @returns {Promise<string|null>}
 */
async function extractEmail(websiteUrl) {
  if (!websiteUrl) return null;

  const base = websiteUrl.replace(/\/$/, '');
  const urlsToTry = [base, `${base}/contact`, `${base}/contact-us`];
  const candidates = [];

  for (const url of urlsToTry) {
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: { 'User-Agent': USER_AGENT },
      });
      if (!res.ok) continue;
      const html = await res.text();

      // mailto: links are most reliable
      const mailtoMatches = [...html.matchAll(/mailto:([^"'\s>?&]+)/g)];
      for (const m of mailtoMatches) {
        candidates.push(m[1].toLowerCase());
      }

      // Fallback: visible email patterns
      const textMatches = html.match(EMAIL_REGEX) || [];
      candidates.push(...textMatches.map(e => e.toLowerCase()));
    } catch {
      // timeout, DNS fail, CORS — skip silently
    }
  }

  const unique = [...new Set(candidates)];

  // Prefer non-generic addresses
  const preferred = unique.filter(e => {
    const local = e.split('@')[0];
    return !GENERIC_LOCAL.has(local);
  });

  return preferred[0] ?? unique[0] ?? null;
}

module.exports = { extractEmail };
