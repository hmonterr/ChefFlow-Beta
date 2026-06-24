/**
 * POST /api/outreach/draft
 * Drafts outreach for a single Chef Lead via Gemini → writes to Notion → Status: Drafted.
 *
 * Body: { leadId: string }
 * Response: { leadId, channel, draftSubject?, draftEmail?, draftIgDm?, personalizationNotes }
 */

import { getLead, updateLead } from '../../lib/outreach/notionClient.js';
import { draftOutreach }       from '../../lib/outreach/geminiDrafter.js';

const DRAFTABLE_STATUSES = new Set(['Sourced', 'Drafted']);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed — use POST' });
  }

  const { leadId } = req.body || {};
  if (!leadId) return res.status(400).json({ error: 'leadId is required' });

  try {
    const lead = await getLead(leadId);

    if (!DRAFTABLE_STATUSES.has(lead.status)) {
      return res.status(409).json({
        error: `Lead is "${lead.status}" — only Sourced or Drafted leads can be (re-)drafted`,
      });
    }

    if (!lead.channel) {
      return res.status(422).json({ error: 'Lead has no Channel assigned' });
    }

    const draft = await draftOutreach(lead);
    await updateLead(leadId, { ...draft, status: 'Drafted' });

    return res.status(200).json({ leadId, channel: lead.channel, ...draft });

  } catch (err) {
    console.error('[draft] error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
