# CLAUDE.md — ChefFlow

Project-level instructions for Claude Code sessions in this repo.

## ChefFlow Session Init (mandatory — run at the start of every session)

At session start, before any task, run these three reads **in parallel**. Do not ask the user if you should — just do it.

```
Read dashboard/index.html                                         # agent status + roadmap
Notion fetch 34a8323a-3222-80a6-8406-fbc811b4d0e3               # [LIVE] ChefFlow Manifest
Notion fetch 1bae33c60e91414aa2355d4c7628be29 (Bug Vault DB)     # open bugs
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
| Bug Vault DB | `1bae33c60e91414aa2355d4c7628be29` |
| Task Queue (Feature Ledger) | `1057d26d826e440684b5b0867ddc0fd7` |
| Session Dashboard | `3618323a-3222-818e-bcce-d927efa2a67b` |
| ChefFlow HQ | `3618323a-3222-8194-ba96-d96db8502a30` |

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

## Dashboard sync rule (always)

Any time Notion task/agent/roadmap statuses change during a session, update `dashboard/index.html` **in the same pass** — not later, not in a follow-up. The two must stay in lockstep.

Concretely: when a task is marked done in Notion (Task Queue, Bug Vault, or Ops Log), or an agent status changes, or a roadmap week flips state — immediately update the corresponding HTML in `dashboard/index.html`:
- Agent checklist item done → `class="check-item"` → `class="check-item done"`, `check-box unchecked` → `check-box checked">✓`
- Agent status pill → match actual state (`status-setup` / `status-live` / `status-retired`)
- Week task done → `class="week-task"` → `class="week-task done"`, empty `wt-check` → `wt-check">✓`
- Week complete → `tl-active` → `tl-done`, `wt-active">Active Now` → `wt-done">Complete`
- Week becomes active → `tl-next` → `tl-active`, `wt-next">Upcoming` → `wt-active">Active Now`

Commit `dashboard/index.html` together with whatever else changed that session. Never leave the dashboard stale.

## Safety defaults

- Always `/guard` when touching prod-adjacent code (Firebase rules, deploy configs, Discord production tokens).
- claude-mem is the source of truth for "what did we change last week" — do not re-derive from git unless asked.
- Notion is the source of truth for tasks and bugs (Bug Vault / Task Queue / Ops Log).
- The PostToolUse hook in `.claude/settings.json` auto-runs `/audit` on `firestore.rules` edits — don't disable it without a reason.
