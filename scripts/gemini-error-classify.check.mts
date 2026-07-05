/**
 * Regression check: Gemini error classification (2026-07-05).
 *
 * Bug: extractRecipeData / parseSingleIngredient collapsed EVERY failure into a
 * single "AI_SERVICE_ERROR". A 403 billing hold ("Lightning dunning decision is
 * deny ... PERMISSION_DENIED") was thus indistinguishable from a model failure,
 * costing an entire debugging session. The UI shows the thrown message verbatim,
 * so each cause must map to a distinct, human-readable string.
 *
 * Run: npx tsx scripts/gemini-error-classify.check.mts
 */
import { strict as assert } from 'node:assert';
process.env.GEMINI_API_KEY ||= 'test-key'; // module builds a client at import; no network call
const { geminiErrorMessage } = await import('../src/lib/gemini.ts');

const cases: Array<[string, any, RegExp]> = [
  // The exact error that started this session:
  ['403 billing/dunning', { status: 403, message: '{"error":{"code":403,"message":"Lightning dunning decision is deny","status":"PERMISSION_DENIED"}}' }, /access denied/i],
  ['401 unauthenticated', { status: 401 }, /access denied/i],
  ['bad api key (msg only)', { message: 'API key not valid' }, /access denied/i],
  ['429 rate limit', { status: 429 }, /rate-limited|quota/i],
  ['quota (msg only)', { message: 'RESOURCE_EXHAUSTED: quota' }, /rate-limited|quota/i],
  ['network', { message: 'fetch failed' }, /network/i],
  ['timeout', { message: 'deadline exceeded' }, /timed out/i],
  ['generic/unknown', { message: 'model produced no candidates' }, /AI service error/i],
  ['EMPTY_DATA passthrough', { message: 'EMPTY_DATA' }, /^EMPTY_DATA$/],
];

let failed = 0;
for (const [desc, err, want] of cases) {
  const got = geminiErrorMessage(err);
  if (want.test(got)) { console.log(`PASS  ${desc}  ::  ${got}`); }
  else { failed++; console.log(`FAIL  ${desc}  ::  got "${got}" want ${want}`); }
}

// The whole point: distinct causes must NOT collapse to the same string.
const distinct = new Set([
  geminiErrorMessage({ status: 403 }),
  geminiErrorMessage({ status: 429 }),
  geminiErrorMessage({ message: 'fetch failed' }),
  geminiErrorMessage({ message: 'unknown' }),
]);
assert.equal(distinct.size, 4, `auth/rate/network/generic must be 4 distinct messages, got ${distinct.size}`);

console.log(`\n${cases.length - failed}/${cases.length} passed; distinctness OK.`);
if (failed > 0) process.exit(1);
