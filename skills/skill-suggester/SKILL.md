---
name: skill-suggester
description: Scans recent Claude Code transcripts and Notion (Bug Vault, Task Queue, Scratchpad) for repeated patterns and surfaces candidate skills, slash commands, and hooks. Use when the user asks "what should I automate", "suggest skills", "what am I doing repeatedly", or runs it on a schedule via /loop. Outputs a markdown digest and files high-confidence suggestions to the Wishlist DB.
---

# skill-suggester

Your job: find repetition. Repetition is the signal for automation.

## Scope

Two data sources, scanned together:

1. **Claude Code transcripts** at `~/.claude/projects/*/`. Each subdir is a project; `.jsonl` files are sessions, one JSON event per line.
2. **Notion DBs** (via the `mcp__*__notion-*` tools):
   - Bug Vault — `1bae33c60e91414aa2355d4c7628be29`
   - Task Queue — `1057d26d826e440684b5b0867ddc0fd7`
   - Scratchpad — `4cdc9baa19c64eb689c06a2ac1dd39b6`
   - Wishlist (write target) — `c2a113bc4dc9478ab3857b6ac0d989f5`

## Workflow

### 1. Determine window

Default window is **the last 7 days**. If the user specifies one ("last month", "since Monday"), honor it.

### 2. Gather transcript signal

List `~/.claude/projects/` subdirs. For each, find `.jsonl` files modified within the window. For each session, extract:

- **Bash commands run** — from `tool_use` events where `name == "Bash"`. Pull the `command` field.
- **Files edited repeatedly** — `tool_use` for `Edit`/`Write`, capture `file_path`.
- **Manual sequences** — user messages where the user repeats an instruction Claude has already received (signals friction).
- **Corrections** — user messages containing "no, you should", "always do", "never", "remember to", "from now on" (signals a missing durable rule).

Use `Bash` with `grep` / `jq` to extract efficiently. Don't dump entire transcripts into context — extract first, then read summaries.

Example extraction pass:
```bash
# Top recurring Bash commands across recent sessions
find ~/.claude/projects -name '*.jsonl' -mtime -7 -print0 \
  | xargs -0 grep -h '"name":"Bash"' \
  | jq -r 'select(.message.content) | .message.content[]?
           | select(.type=="tool_use" and .name=="Bash") | .input.command' 2>/dev/null \
  | sort | uniq -c | sort -rn | head -30
```

Adjust the jq path to match the actual transcript schema you find — schemas drift, so probe one file first with `head -1 <file> | jq .` to confirm shape.

### 3. Gather Notion signal

Use the Notion MCP tools:

- `notion-fetch` the three source DBs.
- For Bug Vault: cluster bug titles by keyword. Recurring keywords (>=3 bugs touching the same area in the window) → candidate for a guardrail hook or a focused skill.
- For Task Queue: look for tasks with similar shapes ("add X to Y screen", "fix Z in W component") — patterns suggest a generator.
- For Scratchpad: ad-hoc workflows documented there are prime candidates to formalize into a skill.

### 4. Score candidates

For each candidate, score on two axes (1–5 each):

- **Confidence** — how clearly is this a repeated pattern? Hard count of occurrences.
- **Impact** — how much friction does it remove? Saves 10 seconds × 50 times = high. One-off 30-minute task = low.

Total score = confidence × impact. Threshold for Wishlist filing: **>= 16** (e.g. 4×4).

### 5. Write the digest

Write to `~/.claude/skill-suggestions-YYYY-MM-DD.md`. Structure:

```markdown
# Skill suggestions — YYYY-MM-DD

Window: <start> → <end>
Sessions scanned: <N>
Notion entries scanned: <N>

## High-confidence (filed to Wishlist)

### <Suggestion name>
- **Kind:** skill | slash command | hook | settings change
- **Evidence:** <count> occurrences across <N> sessions. Examples: …
- **Proposal:** <what to build, 2–3 sentences>
- **Score:** <confidence>×<impact> = <total>

## Medium-confidence (review)

…

## Weak signal (noted, not filed)

…

## Patterns from Notion

- Bug Vault hotspots: …
- Task Queue clusters: …
- Scratchpad workflows worth formalizing: …
```

### 6. File high-confidence to Wishlist

For each suggestion scoring >= 16, call `mcp__*__notion-create-pages` with parent set to the Wishlist DB (`c2a113bc4dc9478ab3857b6ac0d989f5`). Include:

- **Title:** the suggestion name
- **Tag:** `suggested-skill` (or whichever property the Wishlist DB uses for categorization — fetch its schema first)
- **Body:** the proposal + evidence summary + link/path to the digest file

Don't duplicate — first query the Wishlist DB for existing titles and skip near-matches.

### 7. Report

Output to the user (in chat):

- Path to the digest file.
- Count of suggestions in each tier.
- Names of items filed to Wishlist.

Keep it under 10 lines.

## Guardrails

- **Read-only on transcripts.** Never modify files under `~/.claude/projects/`.
- **No silent Wishlist spam.** If you'd file more than 5 entries in one run, ask the user to confirm before writing.
- **Schema probe.** Notion DB schemas evolve. Always fetch the target DB once and read its `properties` before writing — don't hardcode property names other than the DB IDs.
- **Privacy.** Transcripts may contain secrets, API tokens, customer data. Never include raw transcript content in the digest — only summarize patterns. Never write transcript content to Notion.
- **Don't suggest what already exists.** Cross-check candidates against `~/.claude/skills/` and `.claude/skills/` in the current project — if a skill with the same purpose exists, skip it.

## Scheduling

The user can run this on a cadence with the gstack `/loop` skill:

```
/loop 1d /skill-suggester
```

Or wire it to a SessionStart hook in `~/.claude/settings.json` so it runs once when a session starts after a >24h gap.
