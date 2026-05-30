/**
 * Regression check for the LIME bug: lime/lemon juice & zest must resolve to
 * whole fruit ("ea"), never a liquid container. No test runner in this project,
 * so run directly:  npx tsx scripts/quantizer-citrus.check.mts
 * Exits non-zero on any failure.
 */
import { quantize } from '../src/lib/quantizer.ts';

type Case = { name: string; qty: number; unit: string; wantUnit: string; wantQty?: number; note: string };

const cases: Case[] = [
  // --- the bug: zest + non-exact juice must become whole fruit ---
  { name: 'lime zest', qty: 1, unit: 'tbsp', wantUnit: 'ea', wantQty: 1, note: 'lime zest -> 1 lime' },
  { name: 'lemon zest', qty: 1, unit: 'tbsp', wantUnit: 'ea', wantQty: 1, note: 'lemon zest -> 1 lemon' },
  { name: 'fresh lime juice', qty: 2, unit: 'tbsp', wantUnit: 'ea', wantQty: 1, note: 'non-exact juice phrasing' },
  { name: 'lime juice', qty: 4, unit: 'tbsp', wantUnit: 'ea', wantQty: 2, note: '4 tbsp / 2 = 2 limes' },
  { name: 'lemon juice', qty: 1, unit: 'cup', wantUnit: 'ea', wantQty: 8, note: '16 tbsp / 2 = 8 lemons' },
  { name: 'lime zest', qty: 3, unit: 'tsp', wantUnit: 'ea', wantQty: 1, note: '3 tsp = 1 tbsp = 1 lime' },
  { name: 'key lime juice', qty: 2, unit: 'tbsp', wantUnit: 'ea', wantQty: 1, note: 'keyword match still fires' },
  // --- scope boundaries: must NOT be hijacked by the citrus interceptor ---
  { name: 'orange juice', qty: 1, unit: 'cup', wantUnit: 'oz', note: 'orange NOT counted whole (carton)' },
  { name: 'lime', qty: 3, unit: 'ea', wantUnit: 'ea', wantQty: 3, note: 'whole limes pass through' },
];

let failures = 0;
for (const c of cases) {
  const r = quantize(c.name, c.qty, c.unit, 'Imperial', 1);
  const unitOk = r.unit === c.wantUnit;
  const qtyOk = c.wantQty === undefined || r.quantity === c.wantQty;
  const pass = unitOk && qtyOk;
  if (!pass) failures++;
  console.log(
    `${pass ? 'PASS' : 'FAIL'}  ${c.name.padEnd(18)} ${c.qty} ${c.unit.padEnd(5)} -> qty=${r.quantity} unit="${r.unit}"  [${c.note}]`
  );
}
console.log(`\n${failures === 0 ? 'ALL PASS' : failures + ' FAILURE(S)'}`);
process.exit(failures === 0 ? 0 : 1);
