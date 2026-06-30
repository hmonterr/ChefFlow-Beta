Run a fresh search for chefs to invite to ChefFlow Beta, then save new leads to Notion and the repo.

## Step 1 — Ask which tier to search

Before doing anything else, ask the user:

> Which tier would you like to search for new leads?
> **1** — Independent / personal chefs (direct email, phone, or IG DM)
> **2** — Mid-size creator chefs (10K–5M followers)
> **3** — Community / platform plays (podcasts, chef networks, marketplaces)

Wait for their answer (1, 2, or 3) before proceeding.

## Step 2 — Load already-saved leads to avoid duplicates

Read **both** of these sources and extract every name, Instagram handle, email, and website already recorded:

- `chef-outreach-leads.md` (repo root) — the current master list
- `chef-outreach-contacted.md` (repo root) — chefs already contacted (may not exist yet; skip if missing)

Build an exclusion set from all names/handles/emails found. Any lead that matches something in this set must be skipped.

## Step 3 — Run tier-specific searches in parallel

### If Tier 1 selected:
- `independent personal chef Instagram contact email meal prep USA 2026`
- `private chef small business "book me" OR "hire me" city contact website 2026`
- `personal chef "about me" specialty cuisine contact independent chef USA 2026`
- `private chef influencers "DM to book" catering Instagram USA 2026`
- `personal chef blog contact email recipe development independent 2026`

### If Tier 2 selected:
- `chef content creator Instagram 10000 to 500000 followers recipe cooking 2026`
- `culinary influencer mid-size food creator chef contact email Instagram 2026`
- `chef YouTuber recipe creator contact business inquiry email 2026`
- `private chef social media creator growing audience contact 2026`

### If Tier 3 selected:
- `personal chef podcast community network contact sponsorship 2026`
- `chef marketplace directory partnership contact 2026`
- `culinary professional association chef network membership 2026`
- `private chef Facebook group community organizer contact 2026`

## Step 4 — Follow-up searches for promising names

For each new name surfaced, run follow-up searches to find:
- Full name
- Location / city
- Email address (preferred) or phone
- Instagram handle
- Website
- Specialty / cuisine type
- Follower count (if applicable)

**Skip any lead already in the exclusion set from Step 2.**

## Step 5 — Save new leads only

### Append to `chef-outreach-leads.md`

Add only the newly found leads into the correct tier section in `chef-outreach-leads.md`. Do not remove or rewrite existing entries. Increment numbering from where the tier left off.

### Save to Notion Chef Leads DB

Use `mcp__Notion__notion-create-pages` with parent `collection://513637ba-79ef-4929-9ea9-ca93f1c87aa6` (the **Chef Leads** DB at https://app.notion.com/p/dd28d06ab2c84962838ca82707b1f10b).

Create **one page per chef** (one row per lead) using the DB schema:
- `Name` (title) — chef or business name
- `Business` (text) — business name if different from Name
- `Channel` (select) — `"Email"` or `"Instagram"` based on primary contact method
- `City/Region` (text) — location
- `Email` (email) — email address if available
- `Phone` (phone_number) — phone if available
- `Instagram` (text) — handle including @
- `Website` (url) — full https:// URL
- `Geo ring` (select) — one of: `"San Diego"`, `"North County"`, `"SoCal"`, `"CA"`, `"National"`
- `Status` (select) — always `"Sourced"` for new leads
- `Source` (select) — `"Google"` for web search results, `"HireAChef"` / `"USPCA"` etc. if from those directories
- `Would pay?` (select) — always `"Unknown"` for new leads
- `Notes` (text) — specialty, follower count, tier number, any other context

## Step 6 — Commit and push

```
git add chef-outreach-leads.md
git commit -m "Add Tier [N] chef outreach leads — [Month Year]"
git push -u origin <current-branch>
```

---

## Output format per new lead

```
**[#]. [Name / Handle]** — [City, State]
- Email: ...
- Phone: ...
- Instagram: @...
- Website: ...
- Specialty: ...
- Notes: ...
```

---

## Tracking contacted chefs

If `chef-outreach-contacted.md` does not exist yet, create it with this header when first needed:

```markdown
# ChefFlow Outreach — Contacted Chefs

Add a chef here once outreach has been sent. Chefs in this file are
skipped on all future /chef-outreach-search runs.

| Date | Name / Handle | Tier | Method | Status |
|------|---------------|------|--------|--------|
```

---

## Outreach template (include at bottom of Notion entry)

> Hi [Name], I'm [your name] from **ChefFlow** — an AI-powered recipe and client management tool built for independent chefs. We're in beta and looking for working chefs to try it out and share feedback. It's completely free during beta. Would you be open to a quick look? [link]
