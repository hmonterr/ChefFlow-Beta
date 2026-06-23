'use strict';

/**
 * POST /api/outreach/send
 *
 * For a single Approved Email lead: creates a Gmail draft and marks the lead Sent.
 * Instagram leads are NOT handled here — those are sent manually by the founder.
 *
 * HUMAN GATE: this function only runs after the founder manually sets
 * Status → Approved in Notion. It never auto-advances from Drafted.
 *
 * Body (JSON):
 *   leadId  {string}  Notion page ID of the Approved Email lead
 *
 * Response (success):
 *   { leadId, gmailDraftId }
 *
 * Response (Gmail failure):
 *   502  { error }
 *   Lead status is NOT set to Sent on Gmail failure — error is appended to Notes.
 */

const { getLead, updateLead } = require('../../lib/outreach/notionClient');
const { createGmailDraft }    = require('../../lib/outreach/gmailClient');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed — use POST' });
  }

  const { leadId } = req.body || {};
  if (!leadId) return res.status(400).json({ error: 'leadId is required' });

  try {
    // 1. Fetch lead
    const lead = await getLead(leadId);

    // 2. Status guard — must be Approved
    if (lead.status !== 'Approved') {
      return res.status(409).json({
        error: `Lead is "${lead.status}" — only Approved leads can be sent`,
      });
    }

    // 3. Channel guard — IG leads are manual
    if (lead.channel !== 'Email') {
      return res.status(422).json({
        error: 'This endpoint handles Email leads only. Instagram leads are sent manually — update Status to Sent in Notion after you DM them.',
      });
    }

    // 4. Content guards
    if (!lead.email)        return res.status(422).json({ error: 'Lead has no email address' });
    if (!lead.draftSubject) return res.status(422).json({ error: 'Lead has no draft subject' });
    if (!lead.draftEmail)   return res.status(422).json({ error: 'Lead has no draft email body' });

    // 5. Create Gmail draft
    let gmailDraftId;
    try {
      gmailDraftId = await createGmailDraft({
        to:      lead.email,
        subject: lead.draftSubject,
        body:    lead.draftEmail,
      });
    } catch (gmailErr) {
      // Gmail failure is non-fatal to the lead record — log it in Notes
      console.error('[send] Gmail draft creation failed:', gmailErr.message);
      const existingNotes = lead.notes || '';
      await updateLead(leadId, {
        notes: `${existingNotes}\n[Gmail error ${new Date().toISOString()}]: ${gmailErr.message}`.trim(),
      });
      return res.status(502).json({ error: `Gmail draft failed: ${gmailErr.message}` });
    }

    // 6. Mark Sent — LOCKED. Set Last contacted to today.
    await updateLead(leadId, {
      status:        'Sent',
      lastContacted: new Date().toISOString().split('T')[0], // YYYY-MM-DD
    });

    return res.status(200).json({ leadId, gmailDraftId });

  } catch (err) {
    console.error('[send] error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
