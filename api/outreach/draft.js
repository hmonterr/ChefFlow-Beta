'use strict';

/**
 * POST /api/outreach/draft
 *
 * Calls Gemini to draft outreach for a single Chef Lead, then writes the draft
 * fields to Notion and sets Status → Drafted.
 *
 * Only processes leads with Status: Sourced (or re-drafts Drafted leads).
 * Does NOT advance to Approved — that is a human step in Notion.
 *
 * Body (JSON):
 *   leadId  {string}  Notion page ID of the Chef Lead
 *
 * Response:
 *   { leadId, channel, draftSubject?, draftEmail?, draftIgDm?, personalizationNotes }
 */

const { getLead, updateLead } = require('../../lib/outreach/notionClient');
const { draftOutreach }       = require('../../lib/outreach/geminiDrafter');

const DRAFTABLE_STATUSES = new Set(['Sourced', 'Drafted']);

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed — use POST' });
  }

  const { leadId } = req.body || {};
  if (!leadId) return res.status(400).json({ error: 'leadId is required' });

  try {
    // 1. Fetch lead
    const lead = await getLead(leadId);

    // 2. Status guard
    if (!DRAFTABLE_STATUSES.has(lead.status)) {
      return res.status(409).json({
        error: `Lead is "${lead.status}" — only Sourced or Drafted leads can be (re-)drafted`,
      });
    }

    // 3. Channel guard
    if (!lead.channel) {
      return res.status(422).json({ error: 'Lead has no Channel assigned (Email or Instagram)' });
    }

    // 4. Call Gemini
    const draft = await draftOutreach(lead);

    // 5. Write draft fields + flip status to Drafted
    await updateLead(leadId, { ...draft, status: 'Drafted' });

    return res.status(200).json({ leadId, channel: lead.channel, ...draft });

  } catch (err) {
    console.error('[draft] error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
