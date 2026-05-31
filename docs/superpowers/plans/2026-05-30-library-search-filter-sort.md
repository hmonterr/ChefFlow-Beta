# Library Search / Filter / Sort Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add live search, category filtering, and six-way sorting to the Library's "All Recipes" tab in `src/App.tsx`.

**Architecture:** Three local `useState` controls feed two `useMemo` derivations (`availableCategories`, `filteredLibraryRecipes`). The existing Firestore `onSnapshot` sync stays untouched; the new `useMemo` takes over ordering and the rendered list reads from `filteredLibraryRecipes` instead of `libraryRecipes`. Purely additive client-side UI — no schema, rules, dependency, or file additions.

**Tech Stack:** React 19, TypeScript, Tailwind v4, existing `@/components/ui` (`Input`, `Button`, `Badge`) + `lucide-react` `Search`. Native `<select>` for sort (no portal concerns).

**Testing note:** This repo has no test runner — `npm run lint` is `tsc --noEmit` (type-check only). Verification is type-check + manual dogfood on `localhost:3000`. There are no automated test steps.

**All edits are in one file:** `src/App.tsx`. Anchor line numbers are approximate (file is ~2500 lines and shifts as edits land) — locate by the quoted code, not the number.

---

### Task 1: Add the three state hooks

**Files:**
- Modify: `src/App.tsx` (library state cluster, ~line 122-128)

- [ ] **Step 1: Add state below `isLibraryOpen`**

Find this existing block (~line 122-128):

```tsx
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const [recentlySaved, setRecentlySaved] = useState<Set<string>>(new Set());
  const [libraryRecipes, setLibraryRecipes] = useState<any[]>([]);
```

Insert these three lines immediately after the `libraryRecipes` line:

```tsx
  const [librarySearch, setLibrarySearch] = useState('');
  const [librarySort, setLibrarySort] = useState('newest');
  const [libraryCategories, setLibraryCategories] = useState<Set<string>>(new Set());
```

- [ ] **Step 2: Type-check**

Run (from `C:\Users\hmont\OneDrive\Documents\Coding\Projects\ChefFlow-Beta`): `npm run lint`
Expected: PASS (no errors). Unused-variable warnings are acceptable at this stage since the state is consumed in later tasks.

- [ ] **Step 3: Commit**

```bash
git add src/App.tsx
git commit -m "feat(Library): add search/sort/category filter state"
```

---

### Task 2: Add derived values and handlers

**Files:**
- Modify: `src/App.tsx` (component body, after the two Library Firestore sync `useEffect`s, ~line 344)

- [ ] **Step 1: Add the two `useMemo`s and two handlers**

Place this block after the "Firestore Sync: Library Menus" `useEffect` closes (~line 344, after its `}, [user]);`). It must be inside the component function body, at the top level (not nested in another hook):

```tsx
  // Library: distinct ingredient categories across all saved recipes
  const availableCategories = useMemo(() => {
    const set = new Set<string>();
    libraryRecipes.forEach((r) => {
      (r.ingredients || []).forEach((ing: any) => {
        if (ing?.category) set.add(ing.category);
      });
    });
    return Array.from(set).sort();
  }, [libraryRecipes]);

  // Library: search (title + ingredient names) -> category filter (OR) -> sort
  const filteredLibraryRecipes = useMemo(() => {
    const q = librarySearch.trim().toLowerCase();
    const result = libraryRecipes.filter((r) => {
      if (q) {
        const inTitle = (r.title || '').toLowerCase().includes(q);
        const inIngredients = (r.ingredients || []).some((ing: any) =>
          (ing?.name || '').toLowerCase().includes(q)
        );
        if (!inTitle && !inIngredients) return false;
      }
      if (libraryCategories.size > 0) {
        const cats = new Set((r.ingredients || []).map((ing: any) => ing?.category));
        let hit = false;
        libraryCategories.forEach((c) => { if (cats.has(c)) hit = true; });
        if (!hit) return false;
      }
      return true;
    });

    const byNewest = (a: any, b: any) =>
      new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime();
    const count = (r: any) => (r.ingredients?.length || 0);

    switch (librarySort) {
      case 'oldest':
        return [...result].sort((a, b) => -byNewest(a, b));
      case 'az':
        return [...result].sort((a, b) => (a.title || '').localeCompare(b.title || ''));
      case 'za':
        return [...result].sort((a, b) => (b.title || '').localeCompare(a.title || ''));
      case 'most':
        return [...result].sort((a, b) => count(b) - count(a));
      case 'fewest':
        return [...result].sort((a, b) => count(a) - count(b));
      case 'newest':
      default:
        return [...result].sort(byNewest);
    }
  }, [libraryRecipes, librarySearch, librarySort, libraryCategories]);

  const toggleLibraryCategory = (cat: string) => {
    setLibraryCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  const clearLibraryFilters = () => {
    setLibrarySearch('');
    setLibrarySort('newest');
    setLibraryCategories(new Set());
  };
```

- [ ] **Step 2: Type-check**

Run: `npm run lint`
Expected: PASS. (`availableCategories`, `filteredLibraryRecipes`, `toggleLibraryCategory`, `clearLibraryFilters` may warn as unused until Task 3/4 — acceptable.)

- [ ] **Step 3: Commit**

```bash
git add src/App.tsx
git commit -m "feat(Library): derive filtered/sorted recipes + filter handlers"
```

---

### Task 3: Add the toolbar UI to the Recipes tab

**Files:**
- Modify: `src/App.tsx` (`<TabsContent value="recipes">`, ~line 2141-2203)

- [ ] **Step 1: Insert the toolbar inside the non-empty branch**

Find the non-empty branch — currently the `) : (` after the empty-library state opens a `<div className="flex flex-col gap-3 mt-2">` that directly holds `{libraryRecipes.map(...)}` (~line 2148-2149):

```tsx
  ) : (
    <div className="flex flex-col gap-3 mt-2">
      {libraryRecipes.map((recipe) => (
```

Replace ONLY that opening — the `) : (` line and the `<div className="flex flex-col gap-3 mt-2">` line — with the fragment opener plus the toolbar (the `{libraryRecipes.map(...)}` line is rewritten in Task 4, leave it for now):

```tsx
  ) : (
    <>
      {/* Toolbar: search + sort + category chips */}
      <div className="flex flex-col gap-3 mt-2 mb-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          <Input
            value={librarySearch}
            onChange={(e) => setLibrarySearch(e.target.value)}
            placeholder="Search recipes or ingredients..."
            className="pl-9 h-10 bg-gray-50/50 border-gray-100 focus:bg-white transition-all"
          />
        </div>

        <select
          value={librarySort}
          onChange={(e) => setLibrarySort(e.target.value)}
          className="h-10 w-full rounded-md border border-gray-100 bg-gray-50/50 px-3 text-sm font-medium text-gray-700 focus:bg-white focus:outline-none focus:ring-2 focus:ring-orange-200 transition-all"
        >
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="az">Title A–Z</option>
          <option value="za">Title Z–A</option>
          <option value="most">Most ingredients</option>
          <option value="fewest">Fewest ingredients</option>
        </select>

        {availableCategories.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {availableCategories.map((cat) => {
              const active = libraryCategories.has(cat);
              return (
                <button
                  key={cat}
                  onClick={() => toggleLibraryCategory(cat)}
                  className={`text-[11px] font-bold px-2.5 py-1 rounded-full border transition-colors ${
                    active
                      ? 'bg-orange-500 border-orange-500 text-white'
                      : 'bg-white border-gray-200 text-gray-500 hover:border-orange-200'
                  }`}
                >
                  {cat}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3">
        {libraryRecipes.map((recipe) => (
```

NOTE: This temporarily leaves two issues fixed in Task 4 — the list still maps `libraryRecipes` (not filtered), and the closing tags need updating. The old closing of this branch (~line 2198-2203) is:

```tsx
      ))}
 

            
           
    </div>
  )}
```

Change the final `</div>` (which closed the old `mt-2` wrapper) and the `)}` so the fragment is closed. Replace that closing block with:

```tsx
      ))}
      </div>
    </>
  )}
```

- [ ] **Step 2: Type-check**

Run: `npm run lint`
Expected: PASS. The toolbar now renders; list still shows all recipes (filtering wired in Task 4).

- [ ] **Step 3: Commit**

```bash
git add src/App.tsx
git commit -m "feat(Library): add search/sort/filter toolbar to Recipes tab"
```

---

### Task 4: Wire the list to filtered results + no-match empty state

**Files:**
- Modify: `src/App.tsx` (the recipe-list `<div>` added in Task 3)

- [ ] **Step 1: Swap the source array and add the no-match branch**

Find the list wrapper added in Task 3:

```tsx
      <div className="flex flex-col gap-3">
        {libraryRecipes.map((recipe) => (
```

Replace those two lines with a conditional that renders a no-match state when filters exclude everything, otherwise maps `filteredLibraryRecipes`:

```tsx
      {filteredLibraryRecipes.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 px-4 text-center border-2 border-dashed border-gray-200 rounded-2xl bg-gray-50/50">
          <Search className="w-8 h-8 text-gray-300 mb-3" />
          <p className="text-sm font-bold text-gray-600">No recipes match</p>
          <p className="text-xs text-gray-400 mt-1">Try a different search or filter.</p>
          <Button
            variant="ghost"
            onClick={clearLibraryFilters}
            className="mt-3 h-8 text-xs font-bold text-orange-500 hover:text-orange-600 hover:bg-orange-50"
          >
            Clear filters
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {filteredLibraryRecipes.map((recipe) => (
```

- [ ] **Step 2: Close the new conditional**

The closing block from Task 3 is currently:

```tsx
      ))}
      </div>
    </>
  )}
```

Add one `)}` to close the `filteredLibraryRecipes.length === 0 ? ... : ( ... )` ternary. Replace with:

```tsx
          ))}
        </div>
      )}
    </>
  )}
```

- [ ] **Step 3: Type-check**

Run: `npm run lint`
Expected: PASS. No unused-variable warnings should remain for the library filter symbols.

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "feat(Library): render filtered recipes + no-match clear state"
```

---

### Task 5: Manual verification (dogfood)

**Files:** none (verification only)

- [ ] **Step 1: Ensure the dev server is running**

If not already up: `npm run dev` (Vite on http://localhost:3000). Sign in (Library requires a non-anonymous user) and open the Library (left sheet).

- [ ] **Step 2: Verify each control**

Confirm all of the following against a logged-in account that has ≥2 saved recipes:

- Search by a word in a recipe **title** → list narrows correctly.
- Search by an **ingredient name** not in any title (e.g. "chicken") → recipes containing it still appear.
- Toggle a single category chip → only recipes containing that category remain; chip highlights orange.
- Toggle a second chip → recipes matching **either** category appear (OR logic).
- Cycle the sort `<select>` through all six options → order changes as labeled (Newest/Oldest by date, A–Z/Z–A by title, Most/Fewest by ingredient count).
- Apply search/filter that matches nothing → "No recipes match" state shows; **Clear filters** resets search, sort (to Newest), and chips, restoring the full list.
- Account with **zero** saved recipes → original "Your library is empty" state still shows (toolbar hidden).

- [ ] **Step 3: Final type-check**

Run: `npm run lint`
Expected: PASS, clean.

- [ ] **Step 4: Push and open PR**

```bash
git push -u origin feat/library-search-filter-sort
gh pr create --title "feat(Library): search, filter, and sort saved recipes" --body "Adds live search (title + ingredient names), multi-select category filter (OR), and six-way sort to the Library Recipes tab. Client-side only — no schema/rules/dependency changes. Tags deferred to LIB-TAGS. Spec: docs/superpowers/specs/2026-05-30-library-search-filter-sort-design.md"
```

---

## Self-Review

**Spec coverage:**
- Search (title + ingredient names) → Task 2 (`filteredLibraryRecipes`) + Task 3 (input). ✓
- Sort, six options, default Newest → Task 2 (switch) + Task 3 (`<select>`). ✓
- Category filter, dynamic chips, multi-select OR → Task 2 (`availableCategories`, filter) + Task 3 (chips) + Task 2 (`toggleLibraryCategory`). ✓
- `useMemo` data flow → Task 2. ✓
- State added (`librarySearch`/`librarySort`/`libraryCategories`) → Task 1. ✓
- Empty-library state unchanged + no-match state with Clear → Task 4. ✓
- No schema/rules/dependency/file changes → all tasks confined to `src/App.tsx`, no imports added. ✓

**Type consistency:** `librarySearch`/`setLibrarySearch`, `librarySort`/`setLibrarySort`, `libraryCategories`/`setLibraryCategories`, `availableCategories`, `filteredLibraryRecipes`, `toggleLibraryCategory`, `clearLibraryFilters` are named identically across Tasks 1–4. Sort string keys (`newest`/`oldest`/`az`/`za`/`most`/`fewest`) match between the `<select>` options (Task 3) and the `switch` (Task 2). ✓

**Placeholder scan:** No TBD/TODO; every code step shows complete code. ✓
