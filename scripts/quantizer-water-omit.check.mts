/**
 * Regression check: shouldOmit water filter (2026-07-05).
 *
 * Bug: shouldOmit did a bare name.includes('water') -> true, so ANY ingredient
 * whose name merely contained "water" was dropped from the shopping list:
 * watermelon, watercress, water chestnut, coconut water, rose water. Only plain
 * tap water (optionally with a temperature/prep modifier) should be omitted.
 *
 * Run: npx tsx scripts/quantizer-water-omit.check.mts
 */
import { strict as assert } from 'node:assert';
import { shouldOmit } from '../src/lib/quantizer.ts';

// MUST be dropped (plain water you don't buy):
const omit = ['water', 'Water', 'tap water', 'warm water', 'cold water', 'hot water',
  'ice water', 'boiling water', 'filtered water', 'room temperature water'];
// MUST be kept (real purchased ingredients / kept varieties):
const keep = ['watermelon', 'watercress', 'water chestnut', 'water chestnuts',
  'coconut water', 'rose water', 'rosewater', 'orange blossom water',
  'sparkling water', 'distilled water', 'mineral water', 'water, sparkling'];

let failed = 0;
for (const n of omit) {
  if (shouldOmit(n)) console.log(`PASS  omit  "${n}"`);
  else { failed++; console.log(`FAIL  "${n}" should be OMITTED but was kept`); }
}
for (const n of keep) {
  if (!shouldOmit(n)) console.log(`PASS  keep  "${n}"`);
  else { failed++; console.log(`FAIL  "${n}" should be KEPT but was omitted`); }
}

assert.equal(failed, 0, `${failed} water-omit case(s) wrong`);
console.log(`\nAll ${omit.length + keep.length} water-omit cases correct.`);
