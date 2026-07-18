# Grouper Master Rebrand — Orchestration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename ChefFlow → Grouper across code and off-code surfaces and apply the coral/teal brand, sequenced so the rebrand and the in-flight App.tsx decomposition (job #1) never collide on the 3,149-line `src/App.tsx`.

**Architecture:** This is an *orchestration* layer, not a rewrite. The per-task edit steps live, verified-accurate, in `docs/superpowers/plans/2026-07-14-chefflow-to-grouper-rename.md` ("the phase plan"). This master doc owns the **sequence**, the **interleave with decomposition**, and **four review corrections**. Execute phases by following the phase plan's tasks, with the deltas noted here taking precedence.

**Tech Stack:** React 19 + Vite 6 + TypeScript, Tailwind v4 (`@theme` in `src/index.css`), Firebase, `chefflow-ops` (Node/TS Discord+Notion agents). No app test runner (`npm run lint` = `tsc --noEmit`); outreach is the only tested area.

---

## Context

ChefFlow is being renamed to **Grouper** (decided 2026-07-15; "ChefFlow" is too crowded in food-tech, Grouper escapes via the fish/"thing that groups" double meaning). The 5-phase rebrand plan is written and its find-by-content strings verified against the current tree (all four App.tsx strings at 1559/1605/2109/2336, ops strings at 17/58/66, orange ramp, ChefHat at 1602 — all confirmed present).

Two things forced a master plan on top of the phase plan:
1. **A second job is in flight — the App.tsx decomposition (#1)** — which rewrites `src/App.tsx` wholesale. Phases 1 and 4 also edit `src/App.tsx`. Running a rebrand branch and the decomposition branch at the same time = guaranteed conflicts on a 3,149-line file. The rebrand must be **serialized** around the decomposition, never parallel.
2. **A review of the phase plan surfaced four corrections** (below) that need to be applied as the phases run.

Intended outcome: product correctly named and branded fast, the decomposition lands on already-branded code with no rework, and no user-facing identifier/storage/portal breakage.

---

## Global Constraints

- **New name:** `Grouper` (capital G). Never "the Grouper". Attribution: `Grouper, by Chef M Meals`. "Chef M Meals" (the business) stays; Grouper is the product name.
- **Brand colors** (source: `OneDrive/Documents/Chef M Meals/Chef Flow Project/Grouper Rebrand/GROUPER-BRAND-GUIDELINES.md`): primary coral `#E65A32`, secondary teal `#16917A`, teal-deep `#2E6E6A`. **Seasonal tokens are deferred** (see Correction 2) — coral + teal only for now.
- **DO NOT RENAME — locked identifiers (renaming = breakage or data loss, zero brand value):**
  - `chefflow_units` localStorage keys — renaming orphans every user's saved unit preference.
  - `#chefflow-root` portal id — **corrected rationale (see Correction 1)**: the id *is* present on `<SheetContent>` (`src/App.tsx:2344`) and `<DialogContent>` (`src/App.tsx:3107`), and three `DialogPortal`s look it up (2620/2759/2903). Leave every occurrence — it's an internal DOM identifier; renaming risks portal targeting breakage.
  - Firebase project ID `gen-lang-client-0380079254` + Firestore named DBs — Google-generated, locked.
  - `chefflow-ops/` directory name + its package `name` — internal; renaming breaks CI paths + git history.
- **`firestore.rules` is NOT touched** — a rename is not a schema change, so the rules↔`src/types.ts` lockstep rule does not trigger.
- **Verification gates:** `npm run lint` + `npm run build` pass; visual/portal changes get a browser QA pass; `chefflow-ops` uses `npm run typecheck`.
- **Git:** branch + PR per phase, fork-only, never push to main (CLAUDE.md absolute rule). Repo is the canonical clone `C:\Users\hmont\Projects\ChefFlow-Beta` (moved out of OneDrive).

---

## The Master Sequence

Serialize everything that touches `src/App.tsx`; run everything that doesn't whenever convenient.

| Order | Work | Branch | Touches App.tsx? | Gate before next |
|---|---|---|---|---|
| 0 | Backup (done — tag `pre-grouper-rebrand` @ `5324ba0`) | — | — | clean tree |
| 1 | **Phase 1** — app name strings | `rename/grouper-phase1-app-strings` | ✅ small | **merge** before step 3 |
| 2 | **Phase 2** — ops embed strings | `rename/grouper-phase2-ops-strings` | no | parallel-safe |
| 3 | **Phase 4** — logo swap | `rename/grouper-phase4-logo` | ✅ header | **merge** before step 4 |
| 4 | **Decomposition (#1)** — split App.tsx | (its own plan) | ✅ rewrites | its own gate |
| 5 | **Phase 3** — colors (coral+teal) | `rename/grouper-phase3-colors` | no | anytime |
| 6 | **Phase 5** — off-code checklist | `docs/grouper-rename` + consoles | no | anytime |

**Why this order:**
- **Phase 1 → Phase 4 serial:** both edit `src/App.tsx`. Phase 1 merges, then Phase 4 branches off `main`. No two open App.tsx branches at once.
- **Phase 4 before decomposition (review call, not the phase plan's original fold-in):** ships the Grouper mark in days instead of waiting for the refactor to land. `grep ChefHat src/App.tsx` finds the single header instance (line 1602) — the "hunt the monolith" cost is one grep. Phase 4 merges before the decomposition branch opens, so it stays serial. Decomposition then extracts the Header from already-branded, already-marked code.
- **Phase 2 / 3 / 5 float:** ops strings, `src/index.css`, and off-code touch nothing structural in App.tsx, so they can run in any gap, even alongside decomposition.

---

## Review Corrections (apply as phases run)

**Correction 1 — `#chefflow-root` rationale was wrong (conclusion unchanged).** The phase plan and memory say "no such element exists; portals fall back to body." False: the id is set on two conditionally-mounted elements sharing one id (invalid HTML — `getElementById` returns the first mounted). Still leave it untouched, but for the right reason (internal DOM id, portal-breakage risk), and log the duplicate-id/portal-target quirk as a **pre-existing latent bug, out of rebrand scope** — do not fix it here.

**Correction 2 — defer seasonal tokens (decision).** Phase 3 ships **coral + teal only**. Do **not** add `--color-seasonal*` tokens or the `data-season` winter/summer/autumn blocks — they'd ship dead (no surface reads them). Phase 3's Task 3.1 Step 2 (seasonal overrides) and the seasonal lines in Step 1 are **cut**. Seasonal becomes its own future phase when a surface needs theming.

**Correction 3 — Phase 4's primary QA risk is mark-on-badge color collision.** The current header ChefHat is `text-white` inside a colored badge. The new `GrouperMark` is a self-colored coral/teal `<img>` — dropped into a coral badge that's coral-on-coral and may vanish. This is the *main* Phase 4 QA check, not the footnote the phase plan makes it: put the mark on a neutral/white chip or remove the badge. Confirm at small size (`w-6 h-6`).

**Correction 4 — `test:outreach` has a known pre-existing network hang.** Phase 1 Task 1.3 gates on `npm run test:outreach`. The two-constant rename doesn't need the full suite; if it hangs, rely on `grep -rn "ChefFlow" lib/outreach/` returning zero + `npm run build`. Note the hang in the PR rather than blocking on it.

---

## Execution Tasks

### Pre-flight: Backup & restore point

Verified: app repo and `chefflow-ops` are both fully committed and pushed to GitHub (0 unpushed), `origin/main` intact at `94e799c`, `git fsck` clean. GitHub is the offsite backup. The fork-only rule means every phase ships off `main` via PR, so `main` never moves — rollback = close the PR.

- [x] **Step 1: Named restore point** — `git tag -a pre-grouper-rebrand 5324ba0` + pushed to origin. Rollback: `git reset --hard pre-grouper-rebrand`.
- [x] **Step 2: `.env.local` (`GEMINI_API_KEY`)** confirmed gitignored + untracked (lives only on this machine; store the key in a password manager).
- [ ] **Step 3 (optional, skipped):** local zip snapshot. `// ponytail: GitHub is the backup; the zip is redundant.`

### Task 0: Persist this master plan into the repo

- [x] **Step 1:** This document at `docs/superpowers/plans/2026-07-17-grouper-master-rebrand.md`.
- [x] **Step 2:** Pointer added to the top of `docs/superpowers/plans/2026-07-14-chefflow-to-grouper-rename.md`.
- [ ] **Step 3:** Commit on `docs/grouper-master-plan` branch + PR (docs-only, fork-only rule). Branched off `main`; carries both plan docs so the master is self-contained (the phase plan was not yet on `main`).

### Task 1: Phase 1 — app name strings
Follow phase plan **Tasks 1.1–1.4** verbatim (all four strings + `index.html` title + `metadata.json` + `lib/outreach` constants + browser QA + PR). Apply **Correction 4** at Task 1.3. **Merge the PR before starting Task 3.**

### Task 2: Phase 2 — ops embed strings
Follow phase plan **Task 2.1** verbatim (3 Discord/Notion titles, keep version + dir name, `npm run typecheck`, PR). Runs any time after Task 1 branches; no App.tsx dependency.

### Task 3: Phase 4 — logo swap
Follow phase plan **Tasks 4.1–4.2**, with **Correction 3** as the lead QA item. Ships on `rename/grouper-phase4-logo` off `main` after Phase 1 merged. **Merge before the decomposition branch opens.**

### Task 4: Decomposition gate (external)
The App.tsx decomposition job runs here, on branded + marked code, per its own plan. Not specified by this rebrand plan — it's a sequencing dependency. When it extracts the Header, the temporary `<h1>Grouper</h1>` wordmark (from Phase 1) and the `GrouperMark` coexistence is decided at extraction (text beside mark, or mark alone).

### Task 5: Phase 3 — colors (coral + teal only)
Follow phase plan **Task 3.1–3.2** with **Correction 2** (seasonal cut). Swap the `src/index.css` `--color-orange-*` ramp values to the coral ramp (keeps every `orange-*` class working, zero component edits), add `--color-teal-500/700`, sync `DESIGN.md`. Floats — run in any gap, even during decomposition.

### Task 6: Phase 5 — off-code checklist
Follow phase plan **Phase 5** verbatim: repo docs (`CLAUDE.md`/`README.md`/`DESIGN.md` brand refs), Notion titles, dashboard repo, Firebase display name, Wix, Discord server, domain `grouper.chef-m-meals.com`. All console/manual; user-owned per the fork-only + "I don't touch Wix" rules.

---

## Verification

Per phase (gates from Global Constraints):
- **Phase 1/3/4:** `npm run lint && npm run build` pass; then `npm run dev` on `http://localhost:3000` — confirm tab title, header wordmark/mark, helper text, disclaimer, and PDF export title all read "Grouper"; open the sidebar sheet + a dialog to confirm overlays still render (portal fallback intact).
- **Phase 2:** `cd chefflow-ops && npm run typecheck`; next weekly Sunday-Pulse cron posts "Grouper"-titled embeds (no redeploy).
- **Phase 4 lead check (Correction 3):** mark is visible against its header background at `w-6 h-6`, favicon shows in tab.
- **Cross-phase invariant:** after each App.tsx phase, `grep -n "ChefFlow" src/App.tsx` returns only what that phase hasn't reached yet (zero after Phase 1); `grep -c "chefflow-root\|chefflow_units" src/App.tsx` stays at 7 (identifiers untouched).

## Self-Review
- **Coverage:** full-repo `git grep "ChefFlow"` over tracked code (excl. `.md`/docs + locked identifiers) returned zero unassigned occurrences — the phase plan's coverage claim holds.
- **Sequencing:** every App.tsx-touching unit (Phase 1, Phase 4, decomposition) is serialized by a merge gate; non-structural work (Phase 2/3/5) floats.
- **No identifier drift:** `firestore.rules`, `src/types.ts`, Firebase IDs, `#chefflow-root`, `chefflow_units`, `chefflow-ops/` name explicitly untouched.
- **Deltas from phase plan are explicit:** four corrections + logo-timing change, each named with its rationale.
