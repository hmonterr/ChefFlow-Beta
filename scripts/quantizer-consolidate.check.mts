/**
 * Regression check: consolidateIngredients must merge singular/plural drift.
 *
 * Bug (2026-05-31): a recipe emitted "Apple" (3 ea); the user manually added
 * "Apples" (2 ea). They showed as two separate produce lines instead of summing
 * to 5, because the merge key was the cleaned name with no plural normalization
 * ("apple" !== "apples"). Fixed via singularizeKey at the consolidation key site.
 *
 * Run: npx tsx scripts/quantizer-consolidate.check.mts
 * No test runner in this repo (lint = tsc only); this is a standalone assert script.
 */
import { consolidateIngredients } from '../src/lib/quantizer.ts';

type Case = {
  desc: string;
  items: Array<{ name: string; quantity: number; unit: string; isManual?: boolean }>;
  expectEntries: number;          // how many lines should remain after consolidation
  expectQtyByName?: Record<string, number>; // optional: summed quantity for a given line name (case-insensitive)
};

const cases: Case[] = [
  // --- THE REPORTED BUG ---
  {
    desc: 'Apple (recipe) + Apples (manual) → one line, 5 ea',
    items: [
      { name: 'Apple', quantity: 3, unit: 'ea' },
      { name: 'Apples', quantity: 2, unit: 'ea', isManual: true },
    ],
    expectEntries: 1,
    expectQtyByName: { apple: 5 },
  },
  // --- COMMON PLURAL DRIFT ---
  {
    desc: 'Carrot + Carrots merge',
    items: [
      { name: 'Carrot', quantity: 4, unit: 'ea' },
      { name: 'Carrots', quantity: 3, unit: 'ea' },
    ],
    expectEntries: 1,
    expectQtyByName: { carrot: 7 },
  },
  {
    desc: 'Banana + Bananas merge',
    items: [
      { name: 'Banana', quantity: 2, unit: 'ea' },
      { name: 'Bananas', quantity: 1, unit: 'ea' },
    ],
    expectEntries: 1,
    expectQtyByName: { banana: 3 },
  },
  // --- -es / -ies / -oes PLURALS ---
  {
    desc: 'Tomato + Tomatoes merge (-oes)',
    items: [
      { name: 'Tomato', quantity: 2, unit: 'ea' },
      { name: 'Tomatoes', quantity: 4, unit: 'ea' },
    ],
    expectEntries: 1,
  },
  {
    desc: 'Strawberry + Strawberries merge (-ies)',
    items: [
      { name: 'Strawberry', quantity: 6, unit: 'ea' },
      { name: 'Strawberries', quantity: 6, unit: 'ea' },
    ],
    expectEntries: 1,
  },
  {
    desc: 'Sweet potato + Sweet potatoes merge (multiword -oes)',
    items: [
      { name: 'Sweet potato', quantity: 2, unit: 'ea' },
      { name: 'Sweet potatoes', quantity: 3, unit: 'ea' },
    ],
    expectEntries: 1,
  },
  {
    desc: 'Green onion + Green onions merge (multiword -s)',
    items: [
      { name: 'Green onion', quantity: 1, unit: 'bunch' },
      { name: 'Green onions', quantity: 2, unit: 'bunch' },
    ],
    expectEntries: 1,
  },
  // --- NON-PLURAL -s GUARDS: must NOT be mangled (still merge with their own kind) ---
  {
    desc: 'Molasses + Molasses still merge (-ss guard)',
    items: [
      { name: 'Molasses', quantity: 1, unit: 'cup' },
      { name: 'Molasses', quantity: 1, unit: 'cup' },
    ],
    expectEntries: 1,
  },
  {
    desc: 'Asparagus + Asparagus still merge (-us guard)',
    items: [
      { name: 'Asparagus', quantity: 1, unit: 'bunch' },
      { name: 'Asparagus', quantity: 1, unit: 'bunch' },
    ],
    expectEntries: 1,
  },
  // --- FALSE-MERGE GUARDS: genuinely different items must stay separate ---
  {
    desc: 'Apple and Pineapple must NOT merge',
    items: [
      { name: 'Apple', quantity: 2, unit: 'ea' },
      { name: 'Pineapple', quantity: 1, unit: 'ea' },
    ],
    expectEntries: 2,
  },
  {
    desc: 'Onion and Onion powder must NOT merge',
    items: [
      { name: 'Onion', quantity: 2, unit: 'ea' },
      { name: 'Onion powder', quantity: 1, unit: 'tbsp' },
    ],
    expectEntries: 2,
  },
  // --- DESCRIPTOR PRESERVATION: variety/color words must NEVER be collapsed
  //     away. singularizeKey only trims the trailing plural; cleanIngredientName
  //     strips prep/size only (mashed, diced, large...), NOT color/variety. ---
  {
    desc: 'Green apple and Honeycrisp apple must NOT merge (variety)',
    items: [
      { name: 'Green apple', quantity: 2, unit: 'ea' },
      { name: 'Honeycrisp apple', quantity: 3, unit: 'ea' },
    ],
    expectEntries: 2,
  },
  {
    desc: 'Brown onion and Maui onion must NOT merge (variety)',
    items: [
      { name: 'Brown onion', quantity: 1, unit: 'ea' },
      { name: 'Maui onion', quantity: 1, unit: 'ea' },
    ],
    expectEntries: 2,
  },
  {
    desc: 'Pink pineapple and Pineapple must NOT merge (descriptor present vs absent)',
    items: [
      { name: 'Pink pineapple', quantity: 1, unit: 'ea' },
      { name: 'Pineapple', quantity: 1, unit: 'ea' },
    ],
    expectEntries: 2,
  },
  {
    desc: 'Green onion and Onion must NOT merge (descriptor not stripped)',
    items: [
      { name: 'Green onion', quantity: 2, unit: 'bunch' },
      { name: 'Onion', quantity: 2, unit: 'ea' },
    ],
    expectEntries: 2,
  },
  {
    desc: 'Green apple + Green apples DO merge (descriptor preserved, plural drift only)',
    items: [
      { name: 'Green apple', quantity: 2, unit: 'ea' },
      { name: 'Green apples', quantity: 3, unit: 'ea' },
    ],
    expectEntries: 1,
    expectQtyByName: { 'green apple': 5 },
  },
];

let passed = 0;
let failed = 0;

for (const c of cases) {
  const out = consolidateIngredients(c.items as any, 'Imperial');
  let ok = out.length === c.expectEntries;
  const notes: string[] = [`entries=${out.length} (want ${c.expectEntries})`];

  if (ok && c.expectQtyByName) {
    for (const [name, qty] of Object.entries(c.expectQtyByName)) {
      const hit = out.find(o => (o.name || '').toLowerCase() === name.toLowerCase());
      if (!hit || Number(hit.quantity) !== qty) {
        ok = false;
        notes.push(`qty[${name}]=${hit ? hit.quantity : 'MISSING'} (want ${qty})`);
      }
    }
  }

  if (ok) {
    passed++;
    console.log(`PASS  ${c.desc}`);
  } else {
    failed++;
    console.log(`FAIL  ${c.desc}  ::  ${notes.join(', ')}  ::  got [${out.map(o => `${o.name}:${o.quantity}${o.unit}`).join(' | ')}]`);
  }
}

console.log(`\n${passed} passed, ${failed} failed (${passed + failed} total)`);
if (failed > 0) process.exit(1);
