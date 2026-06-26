'use strict';

/**
 * Tests for api/outreach/send.js
 *
 * External boundaries mocked:
 *   - notionClient (getLead, updateLead)
 *   - gmailClient  (createGmailDraft)
 *
 * Tests cover: happy path, all guards, Gmail failure path, IG rejection,
 *              Sent lock (only Approved passes), Notes on Gmail error.
 */

jest.mock('../../lib/outreach/notionClient');
jest.mock('../../lib/outreach/gmailClient');

const { getLead, updateLead } = require('../../lib/outreach/notionClient');
const { createGmailDraft }    = require('../../lib/outreach/gmailClient');
const handler                 = require('../../api/outreach/send').default;
const fixtures                = require('./fixtures/leadRecord.json');

function mockRes() {
  const res = { _status: 200, _body: null };
  res.status = (code) => { res._status = code; return res; };
  res.json   = (body)  => { res._body  = body; return res; };
  return res;
}

function mockReq(body = {}) {
  return { method: 'POST', body };
}

const MOCK_DRAFT_ID = 'gmail-draft-xyz';

beforeEach(() => {
  jest.clearAllMocks();
  getLead.mockResolvedValue({ ...fixtures.approved });
  createGmailDraft.mockResolvedValue(MOCK_DRAFT_ID);
  updateLead.mockResolvedValue({});
});

// ─── Happy path ──────────────────────────────────────────────────────────────

test('creates Gmail draft and marks lead Sent', async () => {
  const res = mockRes();
  await handler(mockReq({ leadId: fixtures.approved.id }), res);

  expect(res._status).toBe(200);
  expect(res._body).toEqual({ leadId: fixtures.approved.id, gmailDraftId: MOCK_DRAFT_ID });

  expect(createGmailDraft).toHaveBeenCalledWith({
    to:      fixtures.approved.email,
    subject: fixtures.approved.draftSubject,
    body:    fixtures.approved.draftEmail,
  });

  const notionUpdate = updateLead.mock.calls[0][1];
  expect(notionUpdate.status).toBe('Sent');
  expect(notionUpdate.lastContacted).toMatch(/^\d{4}-\d{2}-\d{2}$/);
});

// ─── Status guards ───────────────────────────────────────────────────────────

test('rejects Sourced leads', async () => {
  getLead.mockResolvedValue({ ...fixtures.sourced });
  const res = mockRes();
  await handler(mockReq({ leadId: fixtures.sourced.id }), res);
  expect(res._status).toBe(409);
  expect(createGmailDraft).not.toHaveBeenCalled();
});

test('rejects Drafted leads', async () => {
  getLead.mockResolvedValue({ ...fixtures.drafted });
  const res = mockRes();
  await handler(mockReq({ leadId: fixtures.drafted.id }), res);
  expect(res._status).toBe(409);
  expect(createGmailDraft).not.toHaveBeenCalled();
});

test('rejects already-Sent leads', async () => {
  getLead.mockResolvedValue({ ...fixtures.approved, status: 'Sent' });
  const res = mockRes();
  await handler(mockReq({ leadId: 'sent-lead' }), res);
  expect(res._status).toBe(409);
});

// ─── Channel guard (IG is manual) ────────────────────────────────────────────

test('rejects Instagram leads with 422', async () => {
  getLead.mockResolvedValue({ ...fixtures.approvedIg });
  const res = mockRes();
  await handler(mockReq({ leadId: fixtures.approvedIg.id }), res);
  expect(res._status).toBe(422);
  expect(createGmailDraft).not.toHaveBeenCalled();
});

// ─── Content guards ───────────────────────────────────────────────────────────

test('rejects lead with missing email address', async () => {
  getLead.mockResolvedValue({ ...fixtures.approved, email: '' });
  const res = mockRes();
  await handler(mockReq({ leadId: 'no-email-lead' }), res);
  expect(res._status).toBe(422);
});

test('rejects lead with missing draft subject', async () => {
  getLead.mockResolvedValue({ ...fixtures.approved, draftSubject: '' });
  const res = mockRes();
  await handler(mockReq({ leadId: 'no-subject-lead' }), res);
  expect(res._status).toBe(422);
});

test('rejects lead with missing draft body', async () => {
  getLead.mockResolvedValue({ ...fixtures.approved, draftEmail: '' });
  const res = mockRes();
  await handler(mockReq({ leadId: 'no-body-lead' }), res);
  expect(res._status).toBe(422);
});

// ─── Gmail failure path ──────────────────────────────────────────────────────

test('returns 502 on Gmail API failure and logs error to Notes', async () => {
  createGmailDraft.mockRejectedValue(new Error('invalid_grant'));

  const res = mockRes();
  await handler(mockReq({ leadId: fixtures.approved.id }), res);

  expect(res._status).toBe(502);
  expect(res._body.error).toMatch('invalid_grant');

  // Status must NOT be set to Sent
  const statusUpdate = updateLead.mock.calls.find(c => c[1]?.status === 'Sent');
  expect(statusUpdate).toBeUndefined();

  // Error should be appended to Notes
  const notesUpdate = updateLead.mock.calls.find(c => c[1]?.notes);
  expect(notesUpdate).toBeDefined();
  expect(notesUpdate[1].notes).toMatch('invalid_grant');
});

// ─── Input validation ────────────────────────────────────────────────────────

test('returns 400 when leadId is missing', async () => {
  const res = mockRes();
  await handler(mockReq({}), res);
  expect(res._status).toBe(400);
});

test('returns 405 for non-POST requests', async () => {
  const res = mockRes();
  await handler({ method: 'GET', body: {} }, res);
  expect(res._status).toBe(405);
});
