# skills-dashboard

Static kanban board for skills, slash commands, hooks, MCPs, and agents — the "Agentic OS" backbone. Same architecture as `chefflow-dashboard`: static `index.html` + Vercel serverless `/api/sync` that proxies the Notion API.

Each card represents a runnable thing; clicking the trigger copies it to the clipboard. Integrations row shows which services the skill touches.

> The directory is still named `projects-dashboard/` for git-history continuity. Rename on the next major bump.

## Deploy

1. **The Notion DB is already set up** at `91d42207-837c-4485-8712-286487903cc8` (titled "Skills & Automations", under the "Claude Dashboard" page).

   Schema:
   - `Name` (title)
   - `Category` (select) — Plan, Build, Ship, Quality, Knowledge, Meta
   - `Type` (select) — Skill, Slash, Hook, MCP, Agent, Settings
   - `Trigger` (rich_text) — `/command-name` or event name
   - `Frequency` (select) — Daily, Weekly, On demand, Scheduled, On event
   - `Status` (select) — Idea, Draft, Active, Paused, Shipped, Archived
   - `Integrations` (multi_select) — GitHub, Notion, Vercel, Firebase, Discord, Gmail, Google, X, Browser, Filesystem, Shell
   - `Link` (URL)
   - `Notes` (text)

2. **Move this folder to its own repo.** Push to GitHub.

3. **Deploy to Vercel.** Set env vars in the project settings:
   - `NOTION_TOKEN` — internal integration token with read+write on the DB
   - `SKILLS_DB_ID=6afb12e7d168466f997568875afa7d48`
     (legacy `PROJECTS_DB_ID` is also accepted as a fallback)

4. **Share the DB with the integration** inside Notion (... → Connections → add).

## Use

- `↓ pull` — fetch latest from Notion.
- `+ skill` (or `n`) — open the editor for a new skill.
- `/` — focus filter. Filters search name, category, type, trigger, integrations, notes.
- Click a card's trigger — copies it to clipboard.
- Click anywhere else on a card — edit.
- `↑ push` — flush staged edits to Notion.
- Archived skills are hidden by default; filter (`/`) reveals them.

Columns are the six default categories; cards inside sort by Status (Active → Draft → Idea → Paused → Shipped → Archived) then alphabetically.
