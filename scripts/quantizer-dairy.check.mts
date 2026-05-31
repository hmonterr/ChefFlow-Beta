/**
 * Regression check: dairy parsing defects (2026-05-31).
 *
 * Three root causes, all greedy-substring matching across word boundaries:
 *   1. "butter, unsalted" — "unsalted" contains "salt", so it matched PANTRY_STAPLES
 *      (and the salt pinch/exception checks) BEFORE the dairy weight shield, routing
 *      it to grain/flour pound-rounding → "1 lb". Compounded by the consolidation
 *      round-trip (oz + g mixed-scale addition) it rendered as "169 lb".
 *   2. "buttermilk" — contains "butter", so DAIRY_WEIGHT_SHIELD treated this LIQUID
 *      as solid weight → stuck at "4 oz" instead of a retail liquid container.
 *   3. "cream, heavy" 1 tbl — the unit "tbl" was missing from the liquid whitelist,
 *      so it fell through to raw passthrough → "1 tbl".
 *
 * Run: npx tsx scripts/quantizer-dairy.check.mts
 * No test runner in this repo (lint = tsc only); standalone assert script.
 */
import { quantize, consolidateIngredients } from '../src/lib/quantizer.ts';

let passed = 0;
let failed = 0;

function check(desc: string, got: string, want: string) {
  if (got === want) { passed++; console.log(`PASS  ${desc}  ::  ${got}`); }
  else { failed++; console.log(`FAIL  ${desc}  ::  got "${got}" want "${want}"`); }
}

// --- 1. butter, unsalted must NOT route to pantry lb-rounding; uses dairy oz ---
check('butter, unsalted 168 g -> dairy oz (not lb, not pantry)',
  quantize('butter, unsalted', 168, 'g', 'Imperial').displayString!, '6 oz');
check('butter, salted 168 g -> dairy oz (salted also has "salt" substring)',
  quantize('butter, salted', 168, 'g', 'Imperial').displayString!, '6 oz');
check('unsalted butter (no comma) 168 g -> dairy oz (rootNoun salt guard)',
  quantize('unsalted butter', 168, 'g', 'Imperial').displayString!, '6 oz');
check('plain butter 32 oz unchanged',
  quantize('butter', 32, 'oz', 'Imperial').displayString!, '32 oz');

// small unsalted butter must NOT be labeled a salt "Pantry Staple"
const smallButter = quantize('butter, unsalted', 50, 'g', 'Imperial');
check('butter, unsalted 50 g -> NOT Pantry Staple',
  smallButter.displayString === 'Pantry Staple' ? 'Pantry Staple' : 'dairy', 'dairy');

// --- 2. buttermilk is a LIQUID, sold by the carton ---
check('buttermilk 4 oz -> retail liquid container',
  quantize('buttermilk', 4, 'oz', 'Imperial').displayString!, '8 oz (Half Pint)');
check('buttermilk 1 cup -> retail liquid container',
  quantize('buttermilk', 1, 'cup', 'Imperial').displayString!, '8 oz (Half Pint)');

// --- 3. cream, heavy with "tbl" must parse identically to "tbsp" ---
check('cream, heavy 1 tbl -> liquid (tbl recognized)',
  quantize('cream, heavy', 1, 'tbl', 'Imperial').displayString!,
  quantize('cream, heavy', 1, 'tbsp', 'Imperial').displayString!);

// --- 4. consolidation round-trip: many grams of butter must stay sane (not 100s of oz) ---
const rt = consolidateIngredients([
  { id: 'a', name: 'butter, unsalted', quantity: 168, unit: 'g' },
  { id: 'b', name: 'butter, unsalted', quantity: 113, unit: 'g' },
  { id: 'c', name: 'butter, unsalted', quantity: 227, unit: 'g' },
] as any, 'Imperial');
// 508 g ~= 17.9 oz -> 18 oz; the bug produced 237 oz / "169 lb"
check('3x unsalted butter (508 g) consolidates to ~18 oz',
  rt[0]?.displayString || '', '18 oz');

// --- 5. GUARD: real salt must still be treated as salt (word boundary kept it working) ---
const seaSalt = quantize('sea salt', 1, 'tsp', 'Imperial');
check('sea salt 1 tsp -> still Pantry Staple (guard)',
  seaSalt.displayString!, 'Pantry Staple');

console.log(`\n${passed} passed, ${failed} failed (${passed + failed} total)`);
if (failed > 0) process.exit(1);
