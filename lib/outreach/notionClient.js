/**
 * Notion API client for Chef Leads DB.
 * DB ID: 513637ba-79ef-4929-9ea9-ca93f1c87aa6
 */

import { Client } from '@notionhq/client';

const notion = new Client({ auth: process.env.NOTION_TOKEN });
const DB_ID  = process.env.NOTION_CHEF_LEADS_DB_ID || '513637ba-79ef-4929-9ea9-ca93f1c87aa6';

// ─── Public API ─────────────────────────────────────────────────────────────

export async function getAllLeads() {
  const pages = [];
  let cursor;

  do {
    const res = await notion.databases.query({
      database_id: DB_ID,
      start_cursor: cursor,
      page_size: 100,
    });
    pages.push(...res.results);
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);

  return pages.map(pageToLead);
}

export async function getLead(pageId) {
  const page = await notion.pages.retrieve({ page_id: pageId });
  return pageToLead(page);
}

export async function createLead(lead) {
  return notion.pages.create({
    parent: { database_id: DB_ID },
    properties: leadToProperties(lead),
  });
}

export async function updateLead(pageId, updates) {
  return notion.pages.update({
    page_id: pageId,
    properties: leadToProperties(updates),
  });
}

// ─── Converters ─────────────────────────────────────────────────────────────

function pageToLead(page) {
  const p = page.properties;
  return {
    id:                   page.id,
    name:                 richText(p.Name?.title),
    business:             richText(p.Business?.rich_text),
    city:                 richText(p['City/Region']?.rich_text),
    geoRing:              p['Geo ring']?.select?.name   ?? '',
    website:              p.Website?.url                ?? '',
    email:                p.Email?.email                ?? '',
    instagram:            richText(p.Instagram?.rich_text),
    channel:              p.Channel?.select?.name       ?? '',
    source:               p.Source?.select?.name        ?? '',
    status:               p.Status?.select?.name        ?? '',
    draftSubject:         richText(p['Draft subject']?.rich_text),
    draftEmail:           richText(p['Draft email']?.rich_text),
    draftIgDm:            richText(p['Draft IG DM']?.rich_text),
    personalizationNotes: richText(p['Personalization notes']?.rich_text),
    notes:                richText(p.Notes?.rich_text),
  };
}

function leadToProperties(lead) {
  const props = {};

  if (defined(lead.name))
    props.Name = { title: [{ text: { content: lead.name } }] };
  if (defined(lead.business))
    props.Business = rt(lead.business);
  if (defined(lead.city))
    props['City/Region'] = rt(lead.city);
  if (defined(lead.geoRing))
    props['Geo ring'] = { select: { name: lead.geoRing } };
  if (defined(lead.website))
    props.Website = { url: lead.website || null };
  if (defined(lead.email))
    props.Email = { email: lead.email || null };
  if (defined(lead.instagram))
    props.Instagram = rt(lead.instagram);
  if (defined(lead.channel))
    props.Channel = { select: { name: lead.channel } };
  if (defined(lead.source))
    props.Source = { select: { name: lead.source } };
  if (defined(lead.status))
    props.Status = { select: { name: lead.status } };
  if (defined(lead.draftSubject))
    props['Draft subject'] = rt(lead.draftSubject);
  if (defined(lead.draftEmail))
    props['Draft email'] = rt(lead.draftEmail);
  if (defined(lead.draftIgDm))
    props['Draft IG DM'] = rt(lead.draftIgDm);
  if (defined(lead.personalizationNotes))
    props['Personalization notes'] = rt(lead.personalizationNotes);
  if (defined(lead.notes))
    props.Notes = rt(lead.notes);
  if (defined(lead.lastContacted))
    props['Last contacted'] = lead.lastContacted
      ? { date: { start: lead.lastContacted } }
      : { date: null };

  return props;
}

const richText = arr => arr?.[0]?.plain_text ?? '';
const rt       = val => ({ rich_text: [{ text: { content: val || '' } }] });
const defined  = v  => v !== undefined;
