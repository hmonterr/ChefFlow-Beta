/**
 * POST /api/outreach/send
 * Approved Email lead → Gmail draft → Status: Sent (locked).
 * Instagram leads are manual — this endpoint rejects them explicitly.
 *
 * Body: { leadId: string }
 * Response: { leadId, gmailDraftId }
 */

import { getLead, updateLead } from '../../lib/outreach/notionClient.js';
import { createGmailDraft }    from '../../lib/outreach/gmailClient.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed — use POST' });
  }

  const { leadId } = req.body || {};
  if (!leadId) return res.status(400).json({ error: 'leadId is required' });

  try {
    const lead = await getLead(leadId);

    if (lead.status !== 'Approved') {
      return res.status(409).json({
        error: `Lead is "${lead.status}" — only Approved leads can be sent`,
      });
    }

    if (lead.channel !== 'Email') {
      return res.status(422).json({
        error: 'Email leads only. Instagram leads are sent manually — set Status to Sent in Notion after you DM them.',
      });
    }

    if (!lead.email)        return res.status(422).json({ error: 'Lead has no email address' });
    if (!lead.draftSubject) return res.status(422).json({ error: 'Lead has no draft subject' });
    if (!lead.draftEmail)   return res.status(422).json({ error: 'Lead has no draft email body' });

    let gmailDraftId;
    try {
      gmailDraftId = await createGmailDraft({
        to:      lead.email,
        subject: lead.draftSubject,
        body:    lead.draftEmail,
      });
    } catch (gmailErr) {
      console.error('[send] Gmail draft failed:', gmailErr.message);
      const existingNotes = lead.notes || '';
      await updateLead(leadId, {
        notes: `${existingNotes}\n[Gmail error ${new Date().toISOString()}]: ${gmailErr.message}`.trim(),
      });
      return res.status(502).json({ error: `Gmail draft failed: ${gmailErr.message}` });
    }

    await updateLead(leadId, {
      status:        'Sent',
      lastContacted: new Date().toISOString().split('T')[0],
    });

    return res.status(200).json({ leadId, gmailDraftId });

  } catch (err) {
    console.error('[send] error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
