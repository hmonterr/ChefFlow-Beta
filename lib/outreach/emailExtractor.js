/**
 * Thin email extractor: fetches homepage + /contact, looks for mailto links
 * then visible email patterns. Returns first non-generic hit, or null.
 */

const EMAIL_REGEX   = /\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/g;
const GENERIC_LOCAL = new Set([
  'info', 'contact', 'hello', 'support', 'admin', 'noreply', 'no-reply',
  'webmaster', 'mail', 'office', 'team', 'bookings', 'inquiries', 'inquiry',
]);
const FETCH_TIMEOUT_MS = 8_000;
const USER_AGENT = 'Grouper-Outreach/1.0 (beta sourcing; contact hugo@chef-m-meals.com)';

/**
 * @param {string|null} websiteUrl
 * @returns {Promise<string|null>}
 */
export async function extractEmail(websiteUrl) {
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

      const mailtoMatches = [...html.matchAll(/mailto:([^"'\s>?&]+)/g)];
      for (const m of mailtoMatches) candidates.push(m[1].toLowerCase());

      const textMatches = html.match(EMAIL_REGEX) || [];
      candidates.push(...textMatches.map(e => e.toLowerCase()));
    } catch {
      // timeout, DNS fail — skip silently
    }
  }

  const unique = [...new Set(candidates)];
  const preferred = unique.filter(e => !GENERIC_LOCAL.has(e.split('@')[0]));

  return preferred[0] ?? unique[0] ?? null;
}
