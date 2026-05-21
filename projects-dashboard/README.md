# projects-dashboard

Standalone kanban board for projects across all categories (Content, Community, Agency, Engineering, etc.). Mirrors the architecture of `chefflow-dashboard`: static `index.html` + Vercel serverless `/api/sync` that proxies the Notion API.

## Deploy

1. **Create the Notion DB.** Properties:
   - `Name` (title)
   - `Category` (select) — e.g. Content, Community, Agency, Engineering, Personal, Ideas
   - `Status` (select) — Idea, Active, Paused, Shipped, Archived
   - `Priority` (select) — P0, P1, P2, P3
   - `Link` (URL)
   - `Notes` (text)

2. **Move this folder to its own repo.** Push to GitHub.

3. **Deploy to Vercel.** Set env vars in the project settings:
   - `NOTION_TOKEN` — internal integration token with read+write on the DB
   - `PROJECTS_DB_ID` — the database ID from the Notion URL

4. **Share the DB with the integration** inside Notion (... → Connections → add).

## Use

- `↓ pull` — fetch latest from Notion.
- `+ project` — open the editor for a new project.
- Click any card to edit. Edits stage locally.
- `↑ push` — flush staged edits to Notion.

Columns are derived from the `Category` field; cards inside a column sort by Status (Active → Idea → Paused → Shipped → Archived) then alphabetically.
