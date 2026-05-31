# Library Search / Filter / Sort — Design

**Date:** 2026-05-30
**Branch:** `feat/library-search-filter-sort`
**Status:** Approved (design), pending implementation plan
**Scope owner:** chef-founder (`hmonterr`)

## Goal

Add a search box, a category filter, and a sort control to the Library's **All Recipes**
tab so a growing saved-recipe list stays navigable. Purely additive client-side UI — no
Firestore schema change, no `firestore.rules` change, no new dependencies, no new files.

## Context

The Library is a left-side `Sheet` in `src/App.tsx` (`isLibraryOpen`) with two tabs:
**All Recipes** (`libraryRecipes`) and **Saved Menus** (`libraryMenus`). The Menus tab is
currently hidden (`TabsList` has the `hidden` class) and not yet built, so this feature
targets the Recipes tab only. The filtering logic is kept in one `useMemo` so it can be
copied into the Menus tab when that is built.

Saved recipe shape (set in `saveToLibrary`, App.tsx ~988):

```
{ id, title, userId, ingredients: [{ name, quantity, unit, category }], savedAt }
```

No tags/cuisines are stored. Tags are deferred to a separate fast-follow PR, logged in
Notion Feature Ledger as `LIB-TAGS`
(https://www.notion.so/3718323a32228155b6edf00831278bc3).

## Approach

Inline controls in `App.tsx` with local `useState`, matching the existing single-file
pattern. Rejected alternatives: extracting a `<LibraryToolbar/>` + hook (premature
abstraction for a Menus tab that doesn't exist — YAGNI), and adding a shadcn
`Select`/`DropdownMenu` (new Radix component + portal-rule handling; a styled native
`<select>` suffices).

## Components / Controls

A toolbar rendered at the top of `<TabsContent value="recipes">`, above the recipe list:

1. **Search** — existing `Input` with a `Search` (lucide) icon. Matches case-insensitively
   against recipe **title AND ingredient names** ("chicken" finds recipes containing
   chicken, not just titled chicken). Live as you type.

2. **Sort** — a styled native `<select>` (no portal concerns, accessible). Six options:
   Newest, Oldest, Title A–Z, Title Z–A, Most ingredients, Fewest ingredients.
   Default **Newest** (current behavior).

3. **Category filter** — toggle chips (`Badge`-styled buttons) built dynamically from the
   distinct ingredient `category` values present across saved recipes. Multi-select.
   A recipe matches if it contains **any** selected category (OR logic). Selected chips
   highlight orange (app accent). The chip row only renders when ≥1 category exists.

## Data Flow

`libraryRecipes` (from the existing Firestore `onSnapshot`) →
`useMemo([librarySearch, librarySort, libraryCategories])` → `filteredLibraryRecipes` →
the existing `.map()`. The Firestore sync stays untouched; the `useMemo` takes over
ordering from the current inline `savedAt` sort.

## State Added

Three `useState`s alongside existing library state:

- `librarySearch: string` — default `''`
- `librarySort: string` — default `'newest'`
- `libraryCategories: Set<string>` — default empty (no filter)

## Derived Values

- `availableCategories: string[]` — distinct, sorted ingredient categories across
  `libraryRecipes`, via `useMemo([libraryRecipes])`.
- `filteredLibraryRecipes` — search filter → category filter → sort, via `useMemo`.

## Error Handling / Edge Cases

- Recipes with no `ingredients` array → treated as 0 ingredients, never crash (use
  `recipe.ingredients?.length || 0`, already the pattern).
- Search/sort/filter are pure client-side; no async, no new Firestore reads.
- Category set derived defensively from possibly-missing `category` fields
  (skip null/undefined).

## Empty States

- **Zero saved recipes** — existing "Your library is empty" state unchanged.
- **Saved recipes exist but filters match none** — new state: "No recipes match your
  search/filters" + a **Clear** button that resets `librarySearch`, `librarySort`
  (to `newest`), and `libraryCategories`.

## Out of Scope

- Firestore schema or `firestore.rules` changes.
- New dependencies or component files.
- Save/load/menu logic changes.
- Tags (deferred — `LIB-TAGS`).
- Menus-tab controls (tab not built; logic written to be reusable).

## Testing

No test runner exists in this repo (`npm run lint` is `tsc --noEmit` type-check only).
Verification:
- Type-check passes (`npm run lint`).
- Manual dogfood on `localhost:3000`: search by title and by ingredient; toggle category
  chips (single + multiple); cycle all six sort options; confirm Clear resets; confirm
  the empty-library state and the no-match state both render.
