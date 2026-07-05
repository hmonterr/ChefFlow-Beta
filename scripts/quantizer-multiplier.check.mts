/**
 * Regression check: per-recipe batch-multiplier scaling (2026-07-03).
 *
 * Bug: App.tsx processedIngredients summed RAW quantities across recipes, then
 * applied ONE recipe's multiplier (the first-seen recipeId that consolidation
 * keeps) to the cross-recipe total. Any ingredient shared by two active recipes
 * with different batch multipliers got scaled by the wrong factor. In prod the
 * pre-scaled mac & cheese (1x) won the shared keys, so event-batch siblings (2x)
 * were multiplied by 1x -> cheddar showed 58 oz for an 80 oz need, both yogurts
 * landed at exactly half.
 *
 * Contract enforced here: scale each recipe line by ITS OWN multiplier BEFORE
 * consolidateIngredients (App.tsx:571). quantize then runs with scale=1.
 *
 * Run: npx tsx scripts/quantizer-multiplier.check.mts
 */
import { strict as assert } from 'node:assert';
import { consolidateIngredients } from '../src/lib/quantizer.ts';

const toLb = (q: number, u: string) => (/oz|ounce/.test(u) ? q / 16 : q); // consolidate may re-quantize to oz

// Cheddar shared by two recipes at different batch multipliers.
const lines = [
  { name: 'cheddar, sharp', quantity: 3.6, unit: 'lb', recipeId: 'macncheese', mult: 1 }, // pre-scaled 51-svg batch
  { name: 'cheddar, sharp', quantity: 0.7, unit: 'lb', recipeId: 'gratin',     mult: 2 }, // event batch, 2x
];
const needLb = 3.6 * 1 + 0.7 * 2; // 5.0 lb = 80 oz

// FIXED contract: pre-scale per recipe, THEN consolidate.
const fixed = consolidateIngredients(
  lines.map(l => ({ name: l.name, quantity: l.quantity * l.mult, unit: l.unit, recipeId: l.recipeId })) as any,
  'Imperial',
);
assert.equal(fixed.length, 1, `cheddar must merge to one line, got ${fixed.length}`);
const fixedLb = toLb(Number(fixed[0].quantity), fixed[0].unit || '');
assert.ok(Math.abs(fixedLb - needLb) < 0.1, `pre-scaled total = ${fixedLb} lb, want ~${needLb} lb (80 oz)`);

// OLD bug: raw sum, then one multiplier (first recipe = 1x) -> undershoot.
const raw = consolidateIngredients(
  lines.map(l => ({ name: l.name, quantity: l.quantity, unit: l.unit, recipeId: l.recipeId })) as any,
  'Imperial',
);
const brokenLb = toLb(Number(raw[0].quantity), raw[0].unit || '') * lines[0].mult;
assert.ok(brokenLb < needLb - 0.5, `old raw+single-mult should undershoot; got ${brokenLb} lb vs need ${needLb}`);

console.log(
  `PASS: per-recipe pre-scaling -> ${fixedLb.toFixed(2)} lb (~80 oz). ` +
  `Old raw+single-mult undershot to ${brokenLb.toFixed(2)} lb (~${(brokenLb * 16).toFixed(0)} oz).`,
);
