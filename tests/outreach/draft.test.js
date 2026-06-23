'use strict';

/**
 * Tests for api/outreach/draft.js
 *
 * External boundaries mocked:
 *   - notionClient  (getLead, updateLead)
 *   - geminiDrafter (draftOutreach)
 *
 * Tests cover: status guards, channel guard, Gemini output written to Notion,
 *              re-drafting a Drafted lead, error propagation.
 */

jest.mock('../../lib/outreach/notionClient');
jest.mock('../../lib/outreach/geminiDrafter');

const { getLead, updateLead } = require('../../lib/outreach/notionClient');
const { draftOutreach }       = require('../../lib/outreach/geminiDrafter');
const handler                 = require('../../api/outreach/draft');
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

const MOCK_EMAIL_DRAFT = {
  draftSubject:         'Quick question from a fellow SD chef',
  draftEmail:           'Hey Maria, I built a tool for personal chefs...',
  personalizationNotes: 'Focuses on private dining',
};

const MOCK_IG_DRAFT = {
  draftIgDm:            'Hey! I built a free app for personal chefs...',
  personalizationNotes: '(no website data)',
};

beforeEach(() => {
  jest.clearAllMocks();
  getLead.mockResolvedValue({ ...fixtures.sourced });
  draftOutreach.mockResolvedValue(MOCK_EMAIL_DRAFT);
  updateLead.mockResolvedValue({});
});

// ─── Happy paths ─────────────────────────────────────────────────────────────

test('drafts email lead and writes fields to Notion', async () => {
  const res = mockRes();
  await handler(mockReq({ leadId: fixtures.sourced.id }), res);

  expect(res._status).toBe(200);
  expect(draftOutreach).toHaveBeenCalledWith(expect.objectContaining({ channel: 'Email' }));

  const notionUpdate = updateLead.mock.calls[0][1];
  expect(notionUpdate.status).toBe('Drafted');
  expect(notionUpdate.draftSubject).toBe(MOCK_EMAIL_DRAFT.draftSubject);
  expect(notionUpdate.draftEmail).toBe(MOCK_EMAIL_DRAFT.draftEmail);
});

test('response includes leadId, channel, and draft fields', async () => {
  const res = mockRes();
  await handler(mockReq({ leadId: fixtures.sourced.id }), res);

  expect(res._body).toMatchObject({
    leadId:       fixtures.sourced.id,
    channel:      'Email',
    draftSubject: MOCK_EMAIL_DRAFT.draftSubject,
    draftEmail:   MOCK_EMAIL_DRAFT.draftEmail,
  });
});

test('re-drafts a lead that is already in Drafted status', async () => {
  getLead.mockResolvedValue({ ...fixtures.drafted });

  const res = mockRes();
  await handler(mockReq({ leadId: fixtures.drafted.id }), res);

  expect(res._status).toBe(200);
  expect(draftOutreach).toHaveBeenCalled();
});

test('drafts IG DM for Instagram channel lead', async () => {
  getLead.mockResolvedValue({
    ...fixtures.sourced,
    channel: 'Instagram',
    email:   '',
  });
  draftOutreach.mockResolvedValue(MOCK_IG_DRAFT);

  const res = mockRes();
  await handler(mockReq({ leadId: 'ig-lead-id' }), res);

  expect(res._status).toBe(200);
  const notionUpdate = updateLead.mock.calls[0][1];
  expect(notionUpdate.draftIgDm).toBe(MOCK_IG_DRAFT.draftIgDm);
  expect(notionUpdate.status).toBe('Drafted');
});

// ─── Status guards ───────────────────────────────────────────────────────────

test('rejects Approved leads', async () => {
  getLead.mockResolvedValue({ ...fixtures.approved });

  const res = mockRes();
  await handler(mockReq({ leadId: fixtures.approved.id }), res);

  expect(res._status).toBe(409);
  expect(draftOutreach).not.toHaveBeenCalled();
});

test('rejects Sent leads', async () => {
  getLead.mockResolvedValue({ ...fixtures.approved, status: 'Sent' });

  const res = mockRes();
  await handler(mockReq({ leadId: 'sent-id' }), res);

  expect(res._status).toBe(409);
});

// ─── Channel guard ───────────────────────────────────────────────────────────

test('rejects lead with no channel assigned', async () => {
  getLead.mockResolvedValue({ ...fixtures.sourced, channel: '' });

  const res = mockRes();
  await handler(mockReq({ leadId: 'no-channel-id' }), res);

  expect(res._status).toBe(422);
  expect(draftOutreach).not.toHaveBeenCalled();
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

// ─── Error propagation ───────────────────────────────────────────────────────

test('returns 500 when Gemini throws', async () => {
  draftOutreach.mockRejectedValue(new Error('Gemini API timeout'));

  const res = mockRes();
  await handler(mockReq({ leadId: fixtures.sourced.id }), res);

  expect(res._status).toBe(500);
  expect(res._body.error).toMatch('Gemini API timeout');
  // Notion update should NOT have been called
  expect(updateLead).not.toHaveBeenCalled();
});
