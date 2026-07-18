# ChefFlow → Grouper Rename & Rebrand Implementation Plan

> Superseded by `2026-07-17-grouper-master-rebrand.md` for sequencing; this file holds the per-task edit steps.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename the product from "ChefFlow" to "Grouper" across code and off-code surfaces, and apply the new coral/teal brand system, without breaking DOM/portal/storage/Firebase identifiers.

**Architecture:** Five independent, individually shippable phases. Phases 1–4 are code (app repo + `chefflow-ops`) and end with a typecheck/build/browser gate. Phase 5 is a manual ops checklist for external systems. Each phase ships on its own branch + PR (never push to main — CLAUDE.md absolute rule).

**Tech Stack:** React 19 + Vite 6 + TypeScript, Tailwind v4 (`@theme` in `src/index.css`), Firebase, `chefflow-ops` (Node/TS Discord+Notion agents).

## Global Constraints

- **New name:** `Grouper` (capital G). Never "the Grouper". Attribution string: `Grouper, by Chef M Meals`.
- **Brand colors** (from `Grouper Rebrand/GROUPER-BRAND-GUIDELINES.md`): primary coral `#E65A32`, secondary teal `#16917A`, teal-deep `#2E6E6A`. Seasonal system: logo stays coral+teal; a `--seasonal` token themes surfaces only.
- **DO NOT RENAME — invisible/locked identifiers (renaming = breakage or data loss, zero brand value):**
  - `#chefflow-root` portal id — vestigial (no such element exists; portals already fall back to `document.body`). Leave every occurrence.
  - `chefflow_units` localStorage keys — renaming orphans every existing user's saved unit preference.
  - Firebase project ID `gen-lang-client-0380079254` and the Firestore named DBs — Google-generated, cannot change.
  - `chefflow-ops/` directory name and its package `name` field — internal; renaming breaks CI workflow paths and git history for no user benefit.
- **`firestore.rules` is NOT touched** — this is a rename, not a schema change, so the rules↔`src/types.ts` lockstep rule does not trigger.
- **Verification gates** (no test runner for the app): `npm run lint` (= `tsc --noEmit`) and `npm run build` must pass; visual/portal changes get a browser QA pass. `chefflow-ops` uses `npm run typecheck`.
- **Git:** branch + PR per phase. Commit after each task.

---

## Phase 1 — Name strings, app repo

Branch: `rename/grouper-phase1-app-strings`

### Task 1.1: Rename user-visible strings in `src/App.tsx`

**Files:**
- Modify: `src/App.tsx` (4 string literals; find by content, not line number — lines drift)

- [ ] **Step 1: Edit the four brand strings**

Replace each old string with the new one (exact, unique matches):

```
'ChefFlow Shopping List'  →  'Grouper Shopping List'          // jsPDF export title
>ChefFlow</h1>            →  >Grouper</h1>                    // header wordmark (temporary text; Phase 4 replaces with mark)
ChefFlow handles scaling, duplicate merging, and rounds to real shopping units.
   →  Grouper handles scaling, duplicate merging, and rounds to real shopping units.
ChefFlow is not affiliated with recipe authors
   →  Grouper is not affiliated with recipe authors
```

Do **not** touch: `localStorage.getItem('chefflow_units')`, `localStorage.setItem('chefflow_units', ...)`, any `id="chefflow-root"` or `getElementById('chefflow-root')` (see Global Constraints).

- [ ] **Step 2: Verify no user-visible "ChefFlow" remains, and the protected ids are intact**

Run:
```bash
grep -n "ChefFlow" src/App.tsx        # expect: zero matches
grep -c "chefflow-root\|chefflow_units" src/App.tsx   # expect: unchanged count (still present)
```
Expected: first grep returns nothing; second returns the original count (identifiers untouched).

- [ ] **Step 3: Typecheck + build**

Run: `npm run lint && npm run build`
Expected: both pass, no errors.

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "rename: ChefFlow → Grouper in App.tsx user-visible strings"
```

### Task 1.2: Rename `index.html` title and `metadata.json`

**Files:**
- Modify: `index.html` (line 6)
- Modify: `metadata.json` (line 2)

- [ ] **Step 1: Set the browser tab title** (it's currently the unbranded default)

`index.html`:
```html
<title>My Google AI Studio App</title>
```
→
```html
<title>Grouper</title>
```

- [ ] **Step 2: Rename the AI Studio metadata name**

`metadata.json`:
```json
"name": "Remix: ChefFlow User Authentication",
```
→
```json
"name": "Grouper",
```

- [ ] **Step 3: Verify + build**

Run: `grep -rn "ChefFlow" index.html metadata.json` (expect zero) then `npm run build` (expect pass).

- [ ] **Step 4: Commit**

```bash
git add index.html metadata.json
git commit -m "rename: Grouper in index.html title and metadata.json"
```

### Task 1.3: Rename brand strings in `lib/outreach`

**Files:**
- Modify: `lib/outreach/geminiDrafter.js` (line 13)
- Modify: `lib/outreach/emailExtractor.js` (line 12)

- [ ] **Step 1: Edit both constants**

```
geminiDrafter.js:  const APP_NAME = 'ChefFlow';  →  const APP_NAME = 'Grouper';
emailExtractor.js: 'ChefFlow-Outreach/1.0 (beta sourcing; contact hugo@chef-m-meals.com)'
               →   'Grouper-Outreach/1.0 (beta sourcing; contact hugo@chef-m-meals.com)'
```

- [ ] **Step 2: Verify + run outreach tests** (this is the one area with tests)

Run: `grep -rn "ChefFlow" lib/outreach/` (expect zero) then `npm run test:outreach`
Expected: grep empty; tests pass.

- [ ] **Step 3: Commit**

```bash
git add lib/outreach/geminiDrafter.js lib/outreach/emailExtractor.js
git commit -m "rename: Grouper in outreach app name + user agent"
```

### Task 1.4: Browser QA + open PR

- [ ] **Step 1: Run the app and confirm the name shows everywhere**

Run: `npm run dev`, open `http://localhost:3000`. Confirm: tab title reads "Grouper"; header wordmark reads "Grouper"; the input helper text and the legal disclaimer read "Grouper". Export a PDF and confirm the title line reads "Grouper Shopping List". Open the sidebar sheet and a dialog — confirm overlays still render (portal fallback to body unaffected).

- [ ] **Step 2: Open PR**

```bash
git push -u origin rename/grouper-phase1-app-strings
gh pr create --title "Rename: ChefFlow → Grouper (Phase 1: app strings)" --body "User-visible name strings only. No identifier/color/logo changes. Protected ids (#chefflow-root, chefflow_units) intentionally untouched."
```

---

## Phase 2 — Name strings, chefflow-ops

Branch: `rename/grouper-phase2-ops-strings` (in the same repo; `chefflow-ops/` dir name stays)

### Task 2.1: Rename user-facing Discord/Notion embed strings

**Files:**
- Modify: `chefflow-ops/src/discord-publisher.ts` (line 17)
- Modify: `chefflow-ops/src/formatters/brainstorming.ts` (line 58)
- Modify: `chefflow-ops/src/formatters/announcements.ts` (line 66)

- [ ] **Step 1: Edit the three strings** (keep the version number)

```
discord-publisher.ts:  'ChefFlow v126 · Beta'            →  'Grouper v126 · Beta'
brainstorming.ts:      'ChefFlow Community Pulse'        →  'Grouper Community Pulse'
announcements.ts:      'ChefFlow Weekly Pulse — Ops Brief' → 'Grouper Weekly Pulse — Ops Brief'
```

Leave `chefflow-ops/package.json` `name`/`description` and the directory name unchanged (internal).

- [ ] **Step 2: Verify + typecheck**

Run:
```bash
grep -rn "ChefFlow" chefflow-ops/src/    # expect zero
cd chefflow-ops && npm run typecheck && cd ..
```
Expected: grep empty; typecheck passes.

- [ ] **Step 3: Commit + PR**

```bash
git add chefflow-ops/src/discord-publisher.ts chefflow-ops/src/formatters/
git commit -m "rename: Grouper in chefflow-ops Discord/Notion embed titles"
git push -u origin rename/grouper-phase2-ops-strings
gh pr create --title "Rename: ChefFlow → Grouper (Phase 2: ops embeds)" --body "Discord footer + weekly/community pulse titles. Package name + dir intentionally unchanged."
```

> Note: the next weekly Sunday-Pulse cron run will post embeds titled "Grouper". No redeploy needed beyond merging.

---

## Phase 3 — Color system (peach → coral + teal + seasonal)

Branch: `rename/grouper-phase3-colors`

**Approach:** the brand peach lives as the `--color-orange-*` ramp in `src/index.css`; components reference it via `orange-*` Tailwind classes (e.g. `text-orange-600`). Swap the ramp's *values* to a coral ramp (keeps every class working — zero component edits), then add teal + seasonal tokens. `// ponytail: keep orange-* key names holding coral values — shortest working diff; rename keys to coral-* later only if the semantic mismatch bites.`

### Task 3.1: Replace the orange ramp with a coral ramp and add teal + seasonal tokens

**Files:**
- Modify: `src/index.css` (the `@theme` block, lines ~8–17, and `:root`)

- [ ] **Step 1: Swap the ramp values to coral and add teal**

Replace the `@theme` orange ramp:
```css
@theme {
    --color-orange-50:  #FDF4EE;
    --color-orange-100: #FAE4D5;
    --color-orange-200: #F5C9AC;
    --color-orange-300: #F0B795;
    --color-orange-400: #EDA886;
    --color-orange-500: #E89765;
    --color-orange-600: #D7855A;
    --color-orange-700: #B96E47;
}
```
with the coral ramp (anchored on brand coral `#E65A32` at 500/600) plus teal tokens:
```css
@theme {
    /* Grouper coral ramp (brand primary #E65A32). Key names kept as orange-* so
       existing `orange-*` utility classes pick up coral with zero component edits. */
    --color-orange-50:  #FDF0EB;
    --color-orange-100: #FADACE;
    --color-orange-200: #F5B49E;
    --color-orange-300: #F08E6E;
    --color-orange-400: #EC7350;
    --color-orange-500: #E65A32;
    --color-orange-600: #C94E2B;
    --color-orange-700: #A63F22;

    /* Grouper teal (brand secondary) */
    --color-teal-500: #16917A;
    --color-teal-700: #2E6E6A;

    /* Seasonal accent — themes surfaces only; default = spring (Cool & Mist) */
    --color-seasonal:   #B08080;
    --color-seasonal-2: #608090;
}
```

- [ ] **Step 2: Add the seasonal overrides after `:root`**

Append inside `src/index.css` (after the `:root {…}` block):
```css
:root[data-season="summer"] { --color-seasonal:#E8B84B; --color-seasonal-2:#16917A; }
:root[data-season="autumn"] { --color-seasonal:#C06040; --color-seasonal-2:#809070; }
:root[data-season="winter"] { --color-seasonal:#A04020; --color-seasonal-2:#006040; }
```

- [ ] **Step 3: Build + browser QA**

Run: `npm run build` then `npm run dev`. Confirm the app's accent (header mark bg, primary buttons, pills, `text-orange-600` usages) now renders coral `#E65A32`, not peach. Toggle dark mode — confirm accents still read. Set `document.documentElement.dataset.season='autumn'` in the console and confirm `--color-seasonal` resolves to terracotta (no visual break; it's unused until Task 3.2 wires a surface).

- [ ] **Step 4: Commit**

```bash
git add src/index.css
git commit -m "feat(brand): swap peach ramp to coral, add teal + seasonal tokens"
```

### Task 3.2: Update `DESIGN.md` color section to match code

**Files:**
- Modify: `DESIGN.md` (§2 Color tokens / accent / `@theme` snippet)

- [ ] **Step 1: Replace the peach accent tokens** in DESIGN.md's color section with the coral core + teal + seasonal system, mirroring `GROUPER-BRAND-GUIDELINES.md` §4–§5. Remove the "single peach accent is the only saturated color" claim (retired). Keep the cream/brown neutrals.

- [ ] **Step 2: Verify + commit**

Run: `grep -n "E89765\|only saturated color" DESIGN.md` (expect zero) then:
```bash
git add DESIGN.md
git commit -m "docs(design): update DESIGN.md color tokens to coral/teal + seasonal system"
git push -u origin rename/grouper-phase3-colors
gh pr create --title "Rebrand: coral/teal color system (Phase 3)" --body "Swaps peach ramp to coral, adds teal + seasonal tokens + data-season switch. DESIGN.md synced."
```

---

## Phase 4 — Logo swap (ChefHat → Grouper G-fish mark)

Branch: `rename/grouper-phase4-logo`

**Context:** the current "logo" is the Lucide `ChefHat` icon (imported in `src/App.tsx`, used in the header at the wordmark and decoratively in empty states). Replace the **header** instance with the Grouper G-fish mark. The mark SVG lives at `Grouper Rebrand/grouper logo-…-g-logo-mark.svg` but has a baked-in dark background rect — a transparent-background variant is needed for inline/header use.

### Task 4.1: Add a transparent Grouper mark asset + favicon

**Files:**
- Create: `public/grouper-mark.svg` (transparent-bg version — remove the `<path fill="#211C16" … L1024 1024Z>` background rect from the source SVG; keep the coral/teal G paths)
- Create: `src/components/GrouperMark.tsx` (inline SVG React component, accepts `className`)
- Modify: `index.html` (add favicon link)

- [ ] **Step 1: Produce the transparent mark** — copy the source SVG, delete the full-canvas background `<path fill="#211C16" …>`, save as `public/grouper-mark.svg`. Verify it renders on both light and dark by opening the file in a browser.

- [ ] **Step 2: Create the React component**

```tsx
// src/components/GrouperMark.tsx
export function GrouperMark({ className }: { className?: string }) {
  return <img src="/grouper-mark.svg" alt="Grouper" className={className} />;
}
```

- [ ] **Step 3: Add favicon** to `index.html` `<head>`:
```html
<link rel="icon" type="image/svg+xml" href="/grouper-mark.svg" />
```

- [ ] **Step 4: Commit**

```bash
git add public/grouper-mark.svg src/components/GrouperMark.tsx index.html
git commit -m "feat(brand): add transparent Grouper mark asset, component, favicon"
```

### Task 4.2: Use the mark in the header

**Files:**
- Modify: `src/App.tsx` (header: replace the `<ChefHat …>` at the wordmark, ~line 1602; import `GrouperMark`)

- [ ] **Step 1: Import and swap the header mark**

Add import: `import { GrouperMark } from './components/GrouperMark';`
Replace the header `<ChefHat className="text-white w-4 h-4 md:w-6 md:h-6" />` with:
```tsx
<GrouperMark className="w-6 h-6 md:w-8 md:h-8" />
```
Decide per-taste whether to also render the "grouper" wordmark text beside it (from Phase 1's `<h1>Grouper</h1>`) or let the mark stand alone. Leave the decorative `ChefHat` usages in empty states (1751/1867/1920) unless replacing them too — note that choice in the PR.

- [ ] **Step 2: Build + browser QA**

Run: `npm run build && npm run dev`. Confirm the header shows the coral/teal G-fish mark, favicon shows in the tab, mark reads at small size. Check the peach-square background behind the old ChefHat (if any) still looks right with the new mark, or remove it.

- [ ] **Step 3: Commit + PR**

```bash
git add src/App.tsx
git commit -m "feat(brand): use Grouper mark in header"
git push -u origin rename/grouper-phase4-logo
gh pr create --title "Rebrand: Grouper logo mark (Phase 4)" --body "Header mark + favicon. Decorative ChefHat empty-states left as-is (note if changed)."
```

---

## Phase 5 — Off-code surfaces (manual checklist)

No code; done in each external console. Order: internal-facing first, public last.

- [ ] **Docs hygiene (this repo):** update remaining "ChefFlow" brand references in `CLAUDE.md`, `README.md`, `DESIGN.md` intro to "Grouper" (leave the `chefflow-ops` dir/path references and the `#chefflow-root`/`chefflow_units` identifier docs accurate). Commit on a `docs/grouper-rename` branch + PR.
- [ ] **Notion:** rename display titles — "ChefFlow HQ" → "Grouper HQ", "[LIVE] ChefFlow Manifest" → "[LIVE] Grouper Manifest", and DB titles as desired. Do **not** change the hardcoded Notion IDs in `CLAUDE.md` (they're stable IDs, not names). The dashboard reflects new titles on next pull.
- [ ] **Dashboard repo** (`github.com/hmonterr/chefflow-dashboard`, separate clone at `~/OneDrive/Documents/Coding/Projects/ChefFlow Dash/`): rename "ChefFlow" strings in `index.html` (title/UI). Separate branch + PR there; Vercel auto-deploys on merge. (Repo *name* can stay or be renamed later — renaming a GitHub repo adds redirect but changes the Vercel project link.)
- [ ] **Firebase console:** change the project **display name** "ChefFlow Beta" → "Grouper". Project **ID** `gen-lang-client-0380079254` stays (locked).
- [ ] **Wix:** update marketing shell copy/branding (the outer iframe host page) to Grouper — headings, meta, the Beta Access widget label.
- [ ] **Discord:** rename the server and adjust channel descriptions/webhook display names to Grouper. (The bot's embed footer/titles already ship via Phase 2.)
- [ ] **Domain:** point `grouper.chef-m-meals.com` (or `app.chef-m-meals.com`) at the app's hosting; no new domain purchase (uses the existing Chef M Meals domain per the brand guidelines).

---

## Self-Review notes
- **Coverage:** every code occurrence from the repo scan is assigned to a phase; the deliberately-skipped identifiers are enumerated in Global Constraints with rationale.
- **Ordering:** strings (1–2) before visuals (3–4) so each PR is small and reviewable; off-code (5) last since it's public-facing and depends on the code being live.
- **No schema/identifier drift:** `firestore.rules`, `src/types.ts`, Firebase IDs, portal id, and localStorage keys are explicitly untouched.
