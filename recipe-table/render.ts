// render.ts
// Pure, dependency-free logic that turns a parsed Recipe into a
// "Cooking for Engineers" style merged-cell table.
//
// The whole point of this file is the rowspan arithmetic. Every operation is
// one <td> whose height (rowspan) spans exactly the ingredient rows feeding
// into it, and ingredient rows are ordered by a depth-first walk of the tree
// so that each node's rows are contiguous. This module is imported by both the
// browser frontend (app.ts) and the test suite (render.test.ts), so it must
// stay free of any server- or browser-only APIs.

export interface Ingredient {
  id: string;
  qty: string;
  name: string;
  note: string | null;
  uncertain: boolean;
}

export interface RefNode {
  ref: string;
}

export interface OpNode {
  op: string;
  children: TreeNode[];
}

export type TreeNode = OpNode | RefNode;

export interface Recipe {
  title: string;
  servings: string | null;
  prep: string[];
  ingredients: Ingredient[];
  tree: TreeNode;
}

export function isRef(node: TreeNode): node is RefNode {
  return (node as RefNode).ref !== undefined;
}

/** Total number of ingredient refs beneath a node, counted recursively. */
export function leafCount(node: TreeNode): number {
  if (isRef(node)) return 1;
  return node.children.reduce((sum, child) => sum + leafCount(child), 0);
}

/** level(ref) = 0; level(node) = 1 + max(level of all children). */
export function level(node: TreeNode): number {
  if (isRef(node)) return 0;
  if (node.children.length === 0) return 1;
  return 1 + Math.max(...node.children.map(level));
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

export interface IngredientCell {
  type: "ingredient";
  col: 0;
  rowspan: number; // always 1 for a leaf
  refId: string;
  ingredient: Ingredient | null; // null when the ref has no matching ingredient
}

export interface OpCell {
  type: "op";
  col: number; // equal to the node's level
  rowspan: number; // equal to the node's leafCount
  op: string;
}

export interface GapCell {
  type: "gap";
  col: number;
  rowspan: 1;
}

export type LayoutCell = IngredientCell | OpCell | GapCell;

export interface Layout {
  title: string;
  servings: string | null;
  prep: string[];
  totalCols: number;
  totalRows: number;
  /** One entry per ingredient row; each is the list of <td>s to emit, left to right. */
  bodyRows: LayoutCell[][];
}

/**
 * Walk the tree depth-first, assigning each ingredient ref its own row in the
 * order it is visited, and each operation node a single cell placed in the
 * first row of its leaf range. Returns a grid-ready layout.
 */
export function computeLayout(recipe: Recipe): Layout {
  const byId = new Map<string, Ingredient>();
  for (const ing of recipe.ingredients) byId.set(ing.id, ing);

  interface PlacedCell {
    row: number;
    col: number;
    rowspan: number;
    cell: LayoutCell;
  }

  const placed: PlacedCell[] = [];
  let rowCounter = 0;

  // Returns [startRow, leafCount] for the visited node.
  function walk(node: TreeNode): [number, number] {
    if (isRef(node)) {
      const row = rowCounter++;
      const ingredient = byId.get(node.ref) ?? null;
      placed.push({
        row,
        col: 0,
        rowspan: 1,
        cell: { type: "ingredient", col: 0, rowspan: 1, refId: node.ref, ingredient },
      });
      return [row, 1];
    }

    const startRow = rowCounter; // first descendant leaf gets this row
    let count = 0;
    for (const child of node.children) {
      const [, childCount] = walk(child);
      count += childCount;
    }

    if (count > 0) {
      const col = level(node);
      placed.push({
        row: startRow,
        col,
        rowspan: count,
        cell: { type: "op", col, rowspan: count, op: node.op },
      });
    }
    return [startRow, count];
  }

  walk(recipe.tree);

  const totalRows = rowCounter;
  const totalCols = 1 + level(recipe.tree); // ingredient col (0) .. root op col (level(root))

  // Grid bookkeeping: where cells start, and which (row, col) slots are covered
  // by a rowspan from a cell that started higher up.
  const startAt = new Map<string, LayoutCell>();
  const covered: boolean[][] = Array.from({ length: totalRows }, () =>
    new Array<boolean>(totalCols).fill(false),
  );

  for (const p of placed) {
    startAt.set(`${p.row},${p.col}`, p.cell);
    for (let r = p.row; r < p.row + p.rowspan; r++) {
      if (r >= 0 && r < totalRows && p.col >= 0 && p.col < totalCols) {
        covered[r][p.col] = true;
      }
    }
  }

  const bodyRows: LayoutCell[][] = [];
  for (let r = 0; r < totalRows; r++) {
    const cells: LayoutCell[] = [];
    for (let c = 0; c < totalCols; c++) {
      const start = startAt.get(`${r},${c}`);
      if (start) {
        cells.push(start);
      } else if (covered[r][c]) {
        // Covered by a rowspan started in an earlier row — emit no <td>.
      } else {
        // No node reaches this slot: an intervening gap. Emit an empty <td>
        // (never colspan to fill it).
        cells.push({ type: "gap", col: c, rowspan: 1 });
      }
    }
    bodyRows.push(cells);
  }

  return {
    title: recipe.title,
    servings: recipe.servings,
    prep: recipe.prep,
    totalCols,
    totalRows,
    bodyRows,
  };
}

// ---------------------------------------------------------------------------
// HTML rendering
// ---------------------------------------------------------------------------

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function rowspanAttr(rowspan: number): string {
  return rowspan > 1 ? ` rowspan="${rowspan}"` : "";
}

function renderIngredientCell(cell: IngredientCell): string {
  const ing = cell.ingredient;
  const uncertain = ing?.uncertain ?? true; // unknown ref -> flag for checking
  const qty = ing?.qty ?? "";
  const name = ing?.name ?? cell.refId;
  const note = ing?.note ?? null;

  const classes = ["cell", "ingredient"];
  if (uncertain) classes.push("uncertain");

  const parts: string[] = [];
  if (qty.trim()) parts.push(`<span class="qty">${escapeHtml(qty)}</span>`);
  parts.push(`<span class="name">${escapeHtml(name)}</span>`);
  if (note && note.trim()) parts.push(`<span class="note">${escapeHtml(note)}</span>`);
  if (uncertain) parts.push(`<span class="flag" title="Check against the source">⚠ check</span>`);

  return `<td class="${classes.join(" ")}">${parts.join(" ")}</td>`;
}

function renderOpCell(cell: OpCell): string {
  return `<td class="cell op"${rowspanAttr(cell.rowspan)}>${escapeHtml(cell.op)}</td>`;
}

function renderRow(cells: LayoutCell[]): string {
  const tds = cells.map((cell) => {
    switch (cell.type) {
      case "ingredient":
        return renderIngredientCell(cell);
      case "op":
        return renderOpCell(cell);
      case "gap":
        return `<td class="cell gap"></td>`;
    }
  });
  return `<tr>${tds.join("")}</tr>`;
}

/** Render a full parsed recipe as an HTML string (table plus title/servings header). */
export function renderRecipeTable(recipe: Recipe): string {
  const layout = computeLayout(recipe);

  const header: string[] = [];
  header.push(`<h1 class="recipe-title">${escapeHtml(layout.title || "Untitled recipe")}</h1>`);
  if (layout.servings && layout.servings.trim()) {
    header.push(`<p class="servings">${escapeHtml(layout.servings)}</p>`);
  }

  const rows: string[] = [];
  for (const prep of layout.prep) {
    rows.push(
      `<tr class="prep-row"><td class="cell prep" colspan="${layout.totalCols}">${escapeHtml(prep)}</td></tr>`,
    );
  }
  for (const bodyRow of layout.bodyRows) {
    rows.push(renderRow(bodyRow));
  }

  return `${header.join("\n")}\n<table class="recipe-table"><tbody>\n${rows.join("\n")}\n</tbody></table>`;
}
