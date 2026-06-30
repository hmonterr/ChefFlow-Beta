Run a fresh search for independent personal/private chefs to invite to ChefFlow Beta, then save the results to Notion Scratchpad.

## Steps

1. Run these web searches **in parallel**:
   - `independent personal chef Instagram contact email meal prep USA 2026`
   - `private chef small business "book me" OR "hire me" city contact website 2026`
   - `personal chef "about me" specialty cuisine contact independent chef USA 2026`
   - `private chef influencers Instagram DM to book catering 2026`
   - `personal chef podcast blog contact email recipe development 2026`

2. For any promising names surfaced, run follow-up searches to get:
   - Full name
   - Location / city
   - Email address (preferred) or phone
   - Instagram handle
   - Website
   - Specialty / cuisine type
   - Follower count if applicable

3. Compile into three tiers:
   - **Tier 1 (target: 30+ leads)** — Independent/personal chefs with direct contact info (email, phone, or IG DM). These are the first outreach priority.
   - **Tier 2** — Mid-size creator chefs (10K–5M followers) reachable via inquiry email or DM.
   - **Tier 3** — Community/platform plays (podcasts, chef networks, marketplaces) — pitch last, after messaging is validated.

4. Save to Notion Scratchpad DB (`collection://c98a70e0-6d64-411a-97db-1ff6d3c598a4`) using `mcp__Notion__notion-create-pages` with:
   - Property `Thought`: `Chef Outreach Leads — [Month Year]`
   - Content: the full compiled list in Notion Markdown, including tiers, contact info, and outreach priority order

5. Also overwrite `chef-outreach-leads.md` in the repo root with the updated list.

6. Commit and push to the current branch with message: `Refresh chef outreach leads — [Month Year]`

## Output format for each lead (Tier 1)

```
**[#]. [Name / Handle]** — [City, State]
- Email: ...
- Phone: ...
- Instagram: @...
- Website: ...
- Specialty: ...
- Notes: ...
```

## Outreach template to include at bottom

> Hi [Name], I'm [your name] from **ChefFlow** — an AI-powered recipe and client management tool built for independent chefs. We're in beta and looking for working chefs to try it out and share feedback. It's completely free during beta. Would you be open to a quick look? [link]
