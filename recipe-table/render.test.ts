// render.test.ts
//   bun test
//
// Covers the rowspan arithmetic: leafCount, level, depth-first row ordering,
// column placement by level, contiguous node rows, and the empty-gap rule when
// an operation sits more than one level above one of its children.

import { expect, test, describe } from "bun:test";
import {
  computeLayout,
  leafCount,
  level,
  renderRecipeTable,
  type Ingredient,
  type Recipe,
  type TreeNode,
} from "./render";

function ing(id: string, extra: Partial<Ingredient> = {}): Ingredient {
  return { id, qty: "", name: id, note: null, uncertain: false, ...extra };
}

// A recipe whose root operation is two levels up from one of its direct
// children (the "finish" op combines a bare ingredient e1 with the result of
// the "mix" op). This forces an intervening empty gap cell.
//
//   finish (level 2, col 2, rowspan 3)
//   ├─ ref e1              (level 0, col 0, row 0)  -> gap at (row 0, col 1)
//   └─ mix (level 1, col 1, rowspan 2, rows 1-2)
//      ├─ ref e2           (row 1)
//      └─ ref e3           (row 2)
const gapTree: TreeNode = {
  op: "finish",
  children: [
    { ref: "e1" },
    { op: "mix", children: [{ ref: "e2" }, { ref: "e3" }] },
  ],
};

const gapRecipe: Recipe = {
  title: "Gap Recipe",
  servings: "2",
  prep: ["Preheat oven", "Grease pan"],
  ingredients: [ing("e1"), ing("e2"), ing("e3")],
  tree: gapTree,
};

describe("leafCount / level", () => {
  test("leafCount counts refs recursively", () => {
    expect(leafCount(gapTree)).toBe(3);
    expect(leafCount({ ref: "x" })).toBe(1);
  });

  test("level(ref) = 0, level(node) = 1 + max child level", () => {
    expect(level({ ref: "x" })).toBe(0);
    expect(level({ op: "mix", children: [{ ref: "e2" }, { ref: "e3" }] })).toBe(1);
    expect(level(gapTree)).toBe(2);
  });
});

describe("computeLayout", () => {
  const layout = computeLayout(gapRecipe);

  test("total columns = 1 + max level", () => {
    expect(layout.totalCols).toBe(3);
  });

  test("one body row per ingredient ref", () => {
    expect(layout.totalRows).toBe(3);
    expect(layout.bodyRows.length).toBe(3);
  });

  test("ingredient rows follow depth-first order, not ingredient array order", () => {
    const refIds = layout.bodyRows.map((row) => {
      const ingCell = row.find((c) => c.type === "ingredient");
      return ingCell && ingCell.type === "ingredient" ? ingCell.refId : null;
    });
    expect(refIds).toEqual(["e1", "e2", "e3"]);
  });

  test("row 0: ingredient, empty gap, then root op spanning all 3 rows", () => {
    const row0 = layout.bodyRows[0];
    expect(row0.map((c) => c.type)).toEqual(["ingredient", "gap", "op"]);

    const opCell = row0[2];
    expect(opCell.type).toBe("op");
    if (opCell.type === "op") {
      expect(opCell.op).toBe("finish");
      expect(opCell.col).toBe(2);
      expect(opCell.rowspan).toBe(3);
    }

    const gapCell = row0[1];
    expect(gapCell.type).toBe("gap");
    if (gapCell.type === "gap") expect(gapCell.col).toBe(1);
  });

  test("row 1: ingredient plus the mix op (rowspan 2); root op is covered, no td", () => {
    const row1 = layout.bodyRows[1];
    expect(row1.map((c) => c.type)).toEqual(["ingredient", "op"]);
    const opCell = row1[1];
    if (opCell.type === "op") {
      expect(opCell.op).toBe("mix");
      expect(opCell.col).toBe(1);
      expect(opCell.rowspan).toBe(2);
    }
  });

  test("row 2: only the ingredient td; both ops above are covered", () => {
    const row2 = layout.bodyRows[2];
    expect(row2.map((c) => c.type)).toEqual(["ingredient"]);
  });
});

describe("renderRecipeTable", () => {
  const html = renderRecipeTable(gapRecipe);

  test("emits a prep header row per prep step, spanning all columns", () => {
    expect(html).toContain(`<td class="cell prep" colspan="3">Preheat oven</td>`);
    expect(html).toContain(`<td class="cell prep" colspan="3">Grease pan</td>`);
  });

  test("root op carries rowspan=3 and the mix op carries rowspan=2", () => {
    expect(html).toContain(`rowspan="3">finish</td>`);
    expect(html).toContain(`rowspan="2">mix</td>`);
  });

  test("renders an empty gap cell (no colspan) for the intervening column", () => {
    expect(html).toContain(`<td class="cell gap"></td>`);
  });

  test("shows the divided note and an uncertain flag when present", () => {
    const divided: Recipe = {
      title: "Divided",
      servings: null,
      prep: [],
      ingredients: [
        ing("butter-1", { qty: "1/2 cup", name: "butter", note: "divided" }),
        ing("butter-2", { qty: "", name: "butter", note: "divided", uncertain: true }),
      ],
      tree: { op: "combine", children: [{ ref: "butter-1" }, { ref: "butter-2" }] },
    };
    const out = renderRecipeTable(divided);
    expect(out).toContain(`<span class="note">divided</span>`);
    expect(out).toContain("ingredient uncertain");
    expect(out).toContain("⚠ check");
  });
});

test("single-ingredient recipe yields one column plus the op column", () => {
  const single: Recipe = {
    title: "One",
    servings: null,
    prep: [],
    ingredients: [ing("water", { qty: "1 cup" })],
    tree: { op: "boil", children: [{ ref: "water" }] },
  };
  const layout = computeLayout(single);
  expect(layout.totalCols).toBe(2);
  expect(layout.totalRows).toBe(1);
  expect(layout.bodyRows[0].map((c) => c.type)).toEqual(["ingredient", "op"]);
});
