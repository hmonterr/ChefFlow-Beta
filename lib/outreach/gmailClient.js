/**
 * Gmail API client — creates drafts only (gmail.compose scope).
 */

import { google } from 'googleapis';

function getAuthClient() {
  const { GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN } = process.env;
  if (!GMAIL_CLIENT_ID)     throw new Error('GMAIL_CLIENT_ID not set');
  if (!GMAIL_CLIENT_SECRET) throw new Error('GMAIL_CLIENT_SECRET not set');
  if (!GMAIL_REFRESH_TOKEN) throw new Error('GMAIL_REFRESH_TOKEN not set');

  const oauth2 = new google.auth.OAuth2(GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET);
  oauth2.setCredentials({ refresh_token: GMAIL_REFRESH_TOKEN });
  return oauth2;
}

function encodeRfc2822(to, from, subject, body) {
  const msg = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    `MIME-Version: 1.0`,
    `Content-Type: text/plain; charset=UTF-8`,
    '',
    body,
  ].join('\r\n');

  return Buffer.from(msg).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function createGmailDraft({ to, subject, body }) {
  const from = process.env.GMAIL_FROM_EMAIL;
  if (!from) throw new Error('GMAIL_FROM_EMAIL not set');
  if (!to)   throw new Error('createGmailDraft: missing recipient');

  const auth  = getAuthClient();
  const gmail = google.gmail({ version: 'v1', auth });
  const raw   = encodeRfc2822(to, from, subject, body);

  const res = await gmail.users.drafts.create({
    userId:      'me',
    requestBody: { message: { raw } },
  });

  return res.data.id;
}
