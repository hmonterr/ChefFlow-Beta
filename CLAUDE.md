# ChefFlow — Claude Code Operating Manual
# v126 · Beta 2.1-Stable · Last updated 2026-05-17

Project-level instructions for Claude Code sessions in this repo.

## Identity
You are the ChefFlow Lead Software Engineer. Philosophy: surgical edits over massive rewrites.
Stack: React (TSX), Tailwind CSS, Firebase Auth/Firestore, Gemini 2.5 Flash (@google/genai),
Radix UI, Lucide Icons, Sonner, Framer Motion — running inside a Wix Velo iframe.

---

## Absolute Rules — Never Violate

- **Fork only.** Never push to main. Always create a branch, open a PR.
- **Portal rule.** All Radix/Shadcn overlays must target `#chefflow-root`.
- **iframe rule.** All anchor tags use `target="_top"`.
- **Auth anchor.** Never bypass `where('userId', '==', user.uid)` in any Firestore query.
- **Batch deletion rule.** Always pass the full object with `sourceIds` to delete functions — never just `id: string`.
- **Try/catch guardrail.** All App.tsx top-level logic inside try/catch — no exceptions.
- **Framer Motion import.** Always `from 'framer-motion'` — never `from 'motion/react'`.
- **Genai SDK rule.** Use `ai.models.generateContent` — never legacy `ai.getGenerativeModel`.
- **Manifest is append-only.** Never summarize or prune historical entries.
- **Guardian rule.** Never allow a Firestore write to bypass an unresolved intercept (isAmbiguous: true).
- **Zod rule.** Delete empty MPU keys dynamically — never pass `null`.
- **Wix stack is a separate deferred project.** Do not touch it.

---

## ChefFlow Session Init (mandatory — run at the start of every session)

At session start, before any task, run these reads **in parallel**. Do not ask the user if you should — just do it.

```
Notion fetch 7ef479ecde454cbfb5e9fc21d2afedaf                    # Agents DB — status of each agent
Notion fetch 46b3f143519b4509bc7bbf2d388f6edc                    # Roadmap DB — week phase + items
Notion fetch 34a8323a-3222-80a6-8406-fbc811b4d0e3                # [LIVE] ChefFlow Manifest (version + MPU)
Notion fetch 1bae33c60e91414aa2355d4c7628be29                    # Bug Vault DB — open bugs
```

After reading, output a one-block summary:
- **Version** — from manifest (e.g. v126)
- **Agents** — status pill for each (Live / Setup / Retired)
- **Open bugs** — count + any P0/P1 names
- **Roadmap** — which week is active, what's checked vs unchecked

This replaces the generic global session-init question for ChefFlow sessions. Still confirm the project directory per global CLAUDE.md, but skip "what are we working on?" — the summary answers it.

### Notion IDs (hardcoded — do not look these up, use as-is)

| Resource | Notion ID |
|---|---|
| [LIVE] ChefFlow Manifest | `34a8323a-3222-80a6-8406-fbc811b4d0e3` |
| ChefFlow HQ | `3618323a-3222-8194-ba96-d96db8502a30` |
| Session Dashboard | `3618323a-3222-818e-bcce-d927efa2a67b` |
| Prompt Log DB (a5) | `6e3238da-8759-4bd8-8bd3-58c9bdd19998` |
| Bug Vault DB *(dashboard: bugs)* | `1bae33c60e91414aa2355d4c7628be29` |
| Task Queue *(dashboard: features)* | `1057d26d826e440684b5b0867ddc0fd7` |
| SOPs DB *(dashboard: sops)* | `11009a9ca228449a92da806ad806cc65` |
| Roadmap DB *(dashboard: roadmap)* | `46b3f143519b4509bc7bbf2d388f6edc` |
| Agents DB *(dashboard: agents)* | `7ef479ecde454cbfb5e9fc21d2afedaf` |
| Scratchpad DB *(dashboard: scratchpad)* | `4cdc9baa19c64eb689c06a2ac1dd39b6` |
| Wishlist DB *(dashboard: wishlist)* | `c2a113bc4dc9478ab3857b6ac0d989f5` |

The seven DBs tagged *(dashboard: …)* back the live ChefFlow dashboard at https://chefflow-dashboard.vercel.app via its `/api/sync` serverless function. Updates to those DBs reflect on the dashboard on next pull/refresh.

## Stack context

Vite + React + TypeScript app (currently v126). Firebase backend (Firestore + Auth, rules in `firestore.rules`). Multi-agent runtime in `chefflow-ops/src`. Notion integration (Bug Vault / Task Queue / Ops Log) and Discord bot with strict tone + safety rails. Local vector DB at `ruvector.db`.

## gstack

- For ALL web browsing, use the `/browse` skill from gstack.
- NEVER use `mcp__claude-in-chrome__*` tools.

### Available gstack skills

`/office-hours`, `/plan-ceo-review`, `/plan-eng-review`, `/plan-design-review`, `/design-consultation`, `/design-shotgun`, `/design-html`, `/review`, `/ship`, `/land-and-deploy`, `/canary`, `/benchmark`, `/browse`, `/connect-chrome`, `/qa`, `/qa-only`, `/design-review`, `/setup-browser-cookies`, `/setup-deploy`, `/setup-gbrain`, `/retro`, `/investigate`, `/document-release`, `/document-generate`, `/codex`, `/cso`, `/autoplan`, `/plan-devex-review`, `/devex-review`, `/careful`, `/freeze`, `/guard`, `/unfreeze`, `/gstack-upgrade`, `/learn`

## Ruflo routing (ChefFlow-specific)

When a user request matches one of these scenarios, invoke the corresponding ruflo tool via the Skill, MCP, or Task mechanism. When in doubt, prefer the gstack default — ruflo is a substrate, not a workflow replacement.

### Always reach for ruflo

- **Editing `firestore.rules`** → run `/audit` (ruflo-security-audit) before suggesting commit. Firestore rule mistakes are silent and catastrophic.
- **Adding/changing Firebase Functions** (when added) → run `/audit` + suggest `hooks_worker-dispatch --trigger document --scope api` for OpenAPI drift detection.
- **Editing any file under `chefflow-ops/src/`** (multi-agent runtime) → use `/plan-eng-review` before changes; agent contracts break silently.
- **Editing Discord bot tone / persona / LLM prompts** → run `/codex` adversarial mode; safety rails are non-negotiable.
- **MCP server health check** (after any plugin upgrade or "is something broken?") → invoke `ruflo-doctor` skill.

### Reach for ruflo only when explicitly requested or on a clear match

- **"What did I solve about X in another project?"** → invoke `ruflo-rag-memory` `/memory-search` (claude-mem covers in-project recall).
- **"Backfill tests on `<legacy module>`"** → invoke `ruflo-testgen` `coverage-gaps` then `coverage-suggest`. **Never** use testgen for net-new features — use superpowers `test-driven-development`.
- **"Audit the whole project"** or "security review" → `/audit` is the default per global CLAUDE.md.
- **Long unattended refactor** (MCP migration, deprecation sweep across many files) → invoke `/autopilot`. Don't volunteer it; opt-in by name only.
- **Coordinated multi-file changes that risk merge collisions** → invoke `ruflo-swarm`. Default is superpowers `dispatching-parallel-agents`; swarm only when worktree isolation is load-bearing.

### Skip ruflo for these

- **Narrative documentation** → use gstack `/document-generate` (Diataxis framework). Ruflo-docs is for API spec / drift detection only.
- **Cron jobs** → use built-in `/schedule` and `/loop`. Ruflo-loop-workers only when explicitly chaining into ruflo's worker ecosystem.
- **Multi-machine federation** → ruflo-federation is installed but not initialized. Skip until ChefFlow has compliance requirements.

### Reserved AgentDB namespaces (never write to these)

`pattern`, `claude-memories`, `default`. Use `chefflow-<intent>` kebab-case for any custom namespace (e.g., `chefflow-discord-quirks`, `chefflow-notion-patterns`, `chefflow-firebase-gotchas`).

## ChefFlow daily workflow

1. **Start of session** — claude-mem auto-loads prior context. No command needed.
2. **New feature** — `/office-hours` → `/autoplan` → superpowers `test-driven-development` → code → `/ship`.
3. **Bug from Notion Bug Vault** — `/investigate` (root cause first) → fix → `/qa` → `/ship`. Never patch symptomatically.
4. **Pre-merge** — `/review` always. Add `/codex` if the diff touches LLM trust boundaries, Firebase rules, or SQL-shaped queries.
5. **Post-merge** — `/land-and-deploy` (Vercel / Firebase) → `/canary` to monitor live.
6. **Weekly** — `/retro` for retrospective; `/document-release` after any shipped feature.

## Canonical dashboard

The live ChefFlow dashboard is **https://chefflow-dashboard.vercel.app**. It is the only dashboard. Notion is the only source of truth for what it displays.

- **Source repo:** `github.com/hmonterr/chefflow-dashboard` (private; auto-deploys to Vercel on every push to `main`). Independent from this repo.
- **Local clone of the dashboard repo:** `~/OneDrive/Documents/Coding/Projects/ChefFlow Dash/`
- **Architecture:** static `index.html` UI shell + Vercel serverless function `api/sync.js` that proxies the Notion API. `NOTION_TOKEN` is configured as a Vercel env var. Data is read from Notion at view-time.
- **UI sync controls:** the dashboard has `↓ pull` and `↑ push` buttons. Pull reads from Notion; push writes UI edits back to Notion.

### When state changes

- **Agent status, roadmap phase, bug, feature, SOP, scratchpad, wishlist:** update the corresponding Notion DB (see Notion IDs table above). The dashboard reflects on next pull. **Do not hand-edit any HTML.** There is no static snapshot to keep in sync — the in-repo `dashboard/` folder was removed on 2026-05-17 along with the old hand-edit sync rule.
- **Dashboard UI / serverless function changes** (new sections, layout, JS behavior): branch + PR in the `chefflow-dashboard` repo, not here. Vercel auto-deploys on merge.

### Why this matters

Earlier sessions maintained a redundant static `ChefFlow-Beta/dashboard/index.html` and a "Dashboard sync rule" that demanded hand-flipping CSS class names whenever Notion changed. The hosted dashboard was never reading that file — it was always reading Notion via `/api/sync`. The static copy was busywork pretending to be the source of truth. It has been deleted.

## Safety defaults

- Always `/guard` when touching prod-adjacent code (Firebase rules, deploy configs, Discord production tokens).
- claude-mem is the source of truth for "what did we change last week" — do not re-derive from git unless asked.
- Notion is the source of truth for tasks and bugs (Bug Vault / Task Queue / Ops Log).
- The PostToolUse hook in `.claude/settings.json` auto-runs `/audit` on `firestore.rules` edits — don't disable it without a reason.
