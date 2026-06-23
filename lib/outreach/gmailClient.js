'use strict';

/**
 * Gmail API client — creates drafts only (gmail.compose scope).
 * Never sends automatically. Founder opens Gmail and hits Send.
 *
 * Requires env vars:
 *   GMAIL_CLIENT_ID
 *   GMAIL_CLIENT_SECRET
 *   GMAIL_REFRESH_TOKEN   (generated once via desktop OAuth flow)
 *   GMAIL_FROM_EMAIL      (the sending account address)
 */

const { google } = require('googleapis');

function getAuthClient() {
  const { GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN } = process.env;

  if (!GMAIL_CLIENT_ID)     throw new Error('GMAIL_CLIENT_ID not set');
  if (!GMAIL_CLIENT_SECRET) throw new Error('GMAIL_CLIENT_SECRET not set');
  if (!GMAIL_REFRESH_TOKEN) throw new Error('GMAIL_REFRESH_TOKEN not set');

  const oauth2 = new google.auth.OAuth2(GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET);
  oauth2.setCredentials({ refresh_token: GMAIL_REFRESH_TOKEN });
  return oauth2;
}

/**
 * Encode a plain-text email as base64url (RFC 2822).
 */
function encodeRfc2822(to, from, subject, body) {
  const msg = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    `MIME-Version: 1.0`,
    `Content-Type: text/plain; charset=UTF-8`,
    `Content-Transfer-Encoding: quoted-printable`,
    '',
    body,
  ].join('\r\n');

  return Buffer.from(msg)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Creates a Gmail draft. Returns the draft ID.
 * @param {{ to: string, subject: string, body: string }} params
 * @returns {Promise<string>} Gmail draft ID
 */
async function createGmailDraft({ to, subject, body }) {
  const from = process.env.GMAIL_FROM_EMAIL;
  if (!from) throw new Error('GMAIL_FROM_EMAIL not set');
  if (!to)   throw new Error('createGmailDraft: missing recipient (to)');

  const auth   = getAuthClient();
  const gmail  = google.gmail({ version: 'v1', auth });
  const raw    = encodeRfc2822(to, from, subject, body);

  const res = await gmail.users.drafts.create({
    userId:      'me',
    requestBody: { message: { raw } },
  });

  return res.data.id;
}

module.exports = { createGmailDraft };
