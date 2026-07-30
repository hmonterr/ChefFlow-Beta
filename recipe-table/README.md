# recipe-table

A standalone local prototype: paste raw recipe text, parse it into a dependency
tree via the Anthropic API, and render it as a **Cooking for Engineers** style
merged-cell table. Ingredients stack down the left column; each operation is a
cell whose height (`rowspan`) spans exactly the ingredient rows feeding into it;
operations cascade rightward until one final cell holds the last step.

Zero npm dependencies. Bun for the server (`Bun.serve`) and vanilla TypeScript +
plain HTML for the frontend. No React/Vite/Express/Tailwind.

## Requirements

- [Bun](https://bun.sh) (the preferred runtime). Node 20+ would also work only
  after a rewrite — this project uses `Bun.serve` and `Bun.build`, so run it
  with Bun.
- An Anthropic API key.

## Setup

```sh
cp .env.example .env
# edit .env and set ANTHROPIC_API_KEY=sk-ant-...
```

The key is read **server-side only** (`process.env.ANTHROPIC_API_KEY`). It is
never sent to the browser and is not written into any committed file — `.env`
is gitignored.

## Run

```sh
bun start          # http://localhost:3000
# or: bun run dev  (reloads on server changes)
```

Open http://localhost:3000, click **Load sample** (or paste your own recipe),
then **Parse recipe**.

## Test

```sh
bun test
```

The tests exercise the core arithmetic in `render.ts` — `leafCount`, `level`,
depth-first row ordering, column placement, and the empty-gap rule — with no
network or API key needed.

## How it works

- **`server.ts`** — `Bun.serve` serving the static page, bundling the frontend
  on the fly (`Bun.build`), and exposing `POST /parse`. `/parse` calls
  `https://api.anthropic.com/v1/messages` (model `claude-sonnet-4-6`) via a raw
  `fetch` and returns the parsed JSON. The parse prompt instructs the model to
  return only raw JSON and to never invent a quantity, unit, temperature, or
  time.
- **`render.ts`** — pure, dependency-free layout + HTML. Imported by both the
  frontend and the tests.
- **`app.ts`** — the browser frontend (bundled to `/app.js`).
- **`index.html`** — page shell and styling.

### Parser output shape

```jsonc
{
  "title": "string",
  "servings": "string | null",
  "prep": ["string", ...],
  "ingredients": [
    { "id": "string", "qty": "string", "name": "string", "note": "string | null", "uncertain": false }
  ],
  "tree": { "op": "string", "children": [/* Node | { "ref": "id" } */] }
}
```

### Rendering rules implemented

- `leafCount(node)` — total ingredient refs beneath a node (recursive).
- `level(ref) = 0`; `level(node) = 1 + max(level of children)`.
- Total columns = `1 + max level across the tree`.
- Each node is one `<td>` at column = its level, `rowspan` = its `leafCount`.
- Ingredient rows are ordered by a **depth-first** walk of the tree (not the
  ingredients array order), so every node's rows are contiguous.
- When a node's level is more than one above a given child, the intervening
  cells for those rows render as **empty `<td>`** (never `colspan`).
- Each `prep` entry is its own full-width header row (`colspan` = all columns).
- A divided ingredient is emitted by the parser as two entries (`note:
  "divided"`); the note shows in the ingredient cell.
- Any ingredient with `uncertain: true` renders with a visible flag.
