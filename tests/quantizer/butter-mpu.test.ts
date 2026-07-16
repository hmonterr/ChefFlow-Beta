/**
 * B-001 "Butter Math" regression guard.
 *
 * This bug has shipped twice. It was closed 04/22/2026 (Slayer Log: "fixed manual
 * incrementing") and came back as a different failure in the same conversion, so
 * the constants get a permanent check rather than a throwaway probe.
 *
 * The invariant under test: butter volume -> retail pounds must land EXACTLY on a
 * box boundary, because US butter volume is defined in weight (1 cup = 8 oz,
 * 1 stick = 4 oz, 1 tbsp = 1/2 oz). 2 cups / 4 sticks / 32 tbsp are all precisely
 * one 1 lb box. A density constant that is a fraction of a gram high pushes the
 * total a hair over the boundary, Math.ceil() rounds up, and every whole-pound
 * order silently doubles-ish. Overbuying butter is real money on a prep list.
 *
 * Run: npm run test:quantizer
 */
import assert from 'node:assert/strict';
import { quantize, consolidateIngredients } from '../../src/lib/quantizer.ts';
import type { Ingredient } from '../../src/types.ts';

let failures = 0;
function check(label: string, actual: unknown, expected: unknown) {
  try {
    assert.deepEqual(actual, expected);
    console.log(`  PASS  ${label}`);
  } catch {
    failures++;
    console.log(`  FAIL  ${label}\n          expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

const mpuLb = (name: string, qty: number, unit: string, scale = 1) =>
  quantize(name, qty, unit, 'Imperial', scale).mpuQuantity;

console.log('\nB-001 butter volume -> retail pounds (Imperial)');

// Exact box boundaries. These are the regressions: each is exactly N lb of butter
// and must not spill into an extra box.
check('2 cups = 1 lb box', mpuLb('Butter', 2, 'cup'), 1);
check('4 sticks = 1 lb box', mpuLb('Butter', 4, 'stick'), 1);
check('32 tbsp = 1 lb box', mpuLb('Butter', 32, 'tbsp'), 1);
check('96 tsp = 1 lb box', mpuLb('Butter', 96, 'tsp'), 1);
check('4 cups = 2 lb', mpuLb('Butter', 4, 'cup'), 2);
check('8 cups = 4 lb', mpuLb('Butter', 8, 'cup'), 4);
check('16 sticks = 4 lb', mpuLb('Butter', 16, 'stick'), 4);

// "At scale" — the wording of the ticket. Multipliers hit the same boundaries.
console.log('\nAt scale (active recipe multiplier)');
check('1 cup x2 = 1 lb', mpuLb('Butter', 1, 'cup', 2), 1);
check('1 cup x4 = 2 lb', mpuLb('Butter', 1, 'cup', 4), 2);
check('1 cup x8 = 4 lb', mpuLb('Butter', 1, 'cup', 8), 4);
check('1 cup x10 = 5 lb', mpuLb('Butter', 1, 'cup', 10), 5);
check('1 cup x20 = 10 lb', mpuLb('Butter', 1, 'cup', 20), 10);
check('16 tbsp x10 = 5 lb', mpuLb('Butter', 16, 'tbsp', 10), 5);

// Partial boxes must still round UP — the fix must not turn into a floor().
console.log('\nPartial boxes still round up (fix must not become floor)');
check('1 cup = 1 lb box', mpuLb('Butter', 1, 'cup'), 1);
check('1 tbsp = 1 lb box', mpuLb('Butter', 1, 'tbsp'), 1);
check('3 cups = 2 lb', mpuLb('Butter', 3, 'cup'), 2);
check('5 cups = 3 lb', mpuLb('Butter', 5, 'cup'), 3);
// One tbsp OVER a box is a real overage and must escalate.
check('2 cups + 1 tbsp = 2 lb', mpuLb('Butter', 33, 'tbsp'), 2);
check('1 lb + 1 tbsp = 2 lb', mpuLb('Butter', 468, 'g'), 2);

// Weight units in, weight units out.
console.log('\nWeight units');
check('16 oz = 1 lb box', mpuLb('Butter', 16, 'oz'), 1);
check('1 lb = 1 lb box', mpuLb('Butter', 1, 'lb'), 1);
check('453.592 g = 1 lb box', mpuLb('Butter', 453.592, 'g'), 1);
check('2 lb = 2 lb', mpuLb('Butter', 2, 'lb'), 2);

// Mixed-unit consolidation sums in grams then re-quantizes; boundaries hold there too.
console.log('\nMixed-unit consolidation');
const sum = (items: Array<[number, string]>) =>
  consolidateIngredients(
    items.map(([quantity, unit]) => ({ name: 'Butter', quantity, unit } as Ingredient)),
    'Imperial',
  )[0].mpuQuantity;
check('1 cup + 2 sticks = 1 lb box', sum([[1, 'cup'], [2, 'stick']]), 1);
check('2 cups + 4 sticks = 2 lb', sum([[2, 'cup'], [4, 'stick']]), 2);
check('8 tbsp + 227 g = 1 lb box', sum([[8, 'tbsp'], [227, 'g']]), 1);
check('1 lb + 12 oz = 2 lb', sum([[1, 'lb'], [12, 'oz']]), 2);

// Butter must not be dragged into the salt/pantry path by the "salted" substring.
console.log('\nNamed variants still reach the butter path');
check('Butter, unsalted 2 cups = 1 lb', mpuLb('Butter, unsalted', 2, 'cup'), 1);
check('Butter, salted 4 sticks = 1 lb', mpuLb('Butter, salted', 4, 'stick'), 1);

console.log(failures ? `\n${failures} FAILED\n` : '\nall passed\n');
process.exit(failures ? 1 : 0);
