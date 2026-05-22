# claude-dashboard

Five-level orgchart view of your work: **ME / CLIENT → CLAUDE → PROJECTS → TASKS → AGENTS**.

Static `index.html` + Vercel serverless `/api/sync` that fetches three Notion databases, stitches them by relation, and renders the tree.

> The folder is still named `projects-dashboard/` for git-history continuity. Rename when you move it to its own repo.

## Architecture

```
                ME / CLIENT
                     |
                  CLAUDE
        _____________|_______________
        |       |       |      |      |
     Proj 1  Proj 2  Proj 3  ...    Proj 5
        |       |       |
      Tasks   Tasks   Tasks
       / \    / \      |
      A   B  A   B     A     ← agents (skills) assigned per task
```

Three Notion DBs (all live under the **Claude Dashboard** page):

| DB | ID | Purpose |
|---|---|---|
| Projects             | `a4c84fa4e269446a967ee693e40203b7` | Top-level work. Name, Status, Category, Priority, Order, Repo, Notes. |
| Tasks                | `5f547c9551994a85952cd23e3489dac0` | Action items. Relation → Project, relation → Agents (skills). Status, Priority, Due, Order, Notes. |
| Skills & Automations | `6afb12e7d168466f997568875afa7d48` | The agent pool. Slash commands, skills, hooks, MCPs. |

Tasks ↔ Projects and Tasks ↔ Skills are both dual relations, so you can also see "what tasks use this agent" from inside Notion.

## Deploy

1. **Move this folder to its own repo** (`claude-dashboard`).
2. **Connect on Vercel.**
3. **Set env vars** in the Vercel project:
   - `NOTION_TOKEN` — Claude Dashboard integration token
   - `PROJECTS_DB_ID=a4c84fa4e269446a967ee693e40203b7`
   - `TASKS_DB_ID=5f547c9551994a85952cd23e3489dac0`
   - `SKILLS_DB_ID=6afb12e7d168466f997568875afa7d48`
4. **Share each DB with the integration** (Notion → ⋯ → Connections → add Claude Dashboard).

## Use

- `↓ pull` — re-fetch the graph. Auto-runs on load.
- `/` — focus filter. Filters across project, task, and agent names + notes.
- Click any **project header** → opens it in Notion.
- Click any **task** → opens it in Notion.
- Click any **agent chip** → opens that skill in Notion.

Editing happens in Notion. The dashboard is a viewer; relations make it cheap to keep accurate.

## What's where

- **`index.html`** — the static UI. Renders the 5-level tree from `/api/sync`.
- **`api/sync.js`** — fetches all three Notion DBs in parallel, normalizes properties, stitches the relation graph, returns `{ projects: [{...project, tasks: [{...task, agents: [{...skill}]}]}] }`.
- **`vercel.json`** — Vercel function config (empty body, just enables the API folder).
- **`package.json`** — declares it as a Node project.
