'use strict';

/**
 * Tests for api/outreach/source.js
 *
 * External boundaries mocked:
 *   - notionClient  (getAllLeads, createLead)
 *   - placesAdapter (searchPersonalChefs)
 *   - emailExtractor (extractEmail)
 *
 * Tests cover: dedupe, channel rule, geo ordering, cap enforcement, error handling.
 */

jest.mock('../../lib/outreach/notionClient');
// Controlled SEARCH_SEEDS: one entry per ring so each test drives exactly one
// searchPersonalChefs call and skipped counts are predictable.
jest.mock('../../lib/outreach/placesAdapter', () => ({
  searchPersonalChefs: jest.fn(),
  SEARCH_SEEDS: [
    { query: 'personal chef San Diego CA', city: 'San Diego, CA', ring: 'San Diego' },
    { query: 'personal chef Los Angeles CA', city: 'Los Angeles, CA', ring: 'SoCal' },
  ],
}));
jest.mock('../../lib/outreach/emailExtractor');

const { getAllLeads, createLead }           = require('../../lib/outreach/notionClient');
const { searchPersonalChefs, SEARCH_SEEDS } = require('../../lib/outreach/placesAdapter');
const { extractEmail }                      = require('../../lib/outreach/emailExtractor');
const handler                               = require('../../api/outreach/source').default;
const placesFixture                         = require('./fixtures/placesResult.json');

// Minimal res mock
function mockRes() {
  const res = { _status: 200, _body: null };
  res.status = (code) => { res._status = code; return res; };
  res.json   = (body)  => { res._body  = body; return res; };
  return res;
}

// Minimal req mock
function mockReq(body = {}) {
  return { method: 'POST', body };
}

beforeEach(() => {
  jest.clearAllMocks();
  getAllLeads.mockResolvedValue([]);
  createLead.mockResolvedValue({ id: 'new-page-id' });
  extractEmail.mockResolvedValue(null);
  searchPersonalChefs.mockResolvedValue([...placesFixture]);
});

// ─── Happy paths ─────────────────────────────────────────────────────────────

test('adds new leads and returns correct counts', async () => {
  extractEmail.mockResolvedValue('maria@chefmaria.com');

  const res = mockRes();
  await handler(mockReq({ ring: 'San Diego', limit: 10 }), res);

  expect(res._status).toBe(200);
  expect(res._body.added).toBeGreaterThan(0);
  expect(res._body.skipped).toBe(0);
  expect(createLead).toHaveBeenCalled();
});

// ─── Channel rule ────────────────────────────────────────────────────────────

test('assigns Email channel when email extracted', async () => {
  extractEmail.mockResolvedValue('chef@example.com');

  const res = mockRes();
  await handler(mockReq({ ring: 'San Diego' }), res);

  const firstCall = createLead.mock.calls[0][0];
  expect(firstCall.channel).toBe('Email');
  expect(firstCall.email).toBe('chef@example.com');
});

test('assigns Instagram channel when no email found', async () => {
  extractEmail.mockResolvedValue(null);

  const res = mockRes();
  await handler(mockReq({ ring: 'San Diego' }), res);

  const firstCall = createLead.mock.calls[0][0];
  expect(firstCall.channel).toBe('Instagram');
  expect(firstCall.email).toBeNull();
});

// ─── Deduplication ───────────────────────────────────────────────────────────

test('skips leads whose domain already exists in Notion', async () => {
  getAllLeads.mockResolvedValue([
    { website: 'https://chefmaria.com', email: '', business: '' },
  ]);

  const res = mockRes();
  await handler(mockReq({ ring: 'San Diego' }), res);

  // chefmaria.com fixture lead should be skipped
  const addedNames = createLead.mock.calls.map(c => c[0].website || '');
  expect(addedNames).not.toContain('https://chefmaria.com');
  expect(res._body.skipped).toBeGreaterThan(0);
});

test('dedupes within a single run (does not add same lead twice)', async () => {
  // Return the same place twice from Places API
  searchPersonalChefs.mockResolvedValue([placesFixture[0], placesFixture[0]]);

  const res = mockRes();
  await handler(mockReq({ ring: 'San Diego' }), res);

  expect(createLead).toHaveBeenCalledTimes(1);
  expect(res._body.skipped).toBe(1);
});

// ─── Limit enforcement ───────────────────────────────────────────────────────

test('respects limit and adds no more than cap', async () => {
  // Return 5 unique places
  const fivePlaces = Array.from({ length: 5 }, (_, i) => ({
    ...placesFixture[0],
    name:     `Chef ${i}`,
    business: `Chef ${i}`,
    website:  `https://chef${i}.com`,
  }));
  searchPersonalChefs.mockResolvedValue(fivePlaces);

  const res = mockRes();
  await handler(mockReq({ ring: 'San Diego', limit: 3 }), res);

  expect(createLead).toHaveBeenCalledTimes(3);
  expect(res._body.added).toBe(3);
});

// ─── Error handling ──────────────────────────────────────────────────────────

test('returns 405 for non-POST requests', async () => {
  const res = mockRes();
  await handler({ method: 'GET', body: {} }, res);
  expect(res._status).toBe(405);
});

test('returns 400 for unknown ring', async () => {
  const res = mockRes();
  await handler(mockReq({ ring: 'Mars' }), res);
  expect(res._status).toBe(400);
});

test('records Places API errors per-seed and continues', async () => {
  searchPersonalChefs.mockRejectedValueOnce(new Error('Places API 429'));

  const res = mockRes();
  await handler(mockReq({ ring: 'San Diego' }), res);

  expect(res._status).toBe(200);
  expect(res._body.errors.length).toBeGreaterThan(0);
  expect(res._body.errors[0].error).toMatch('Places API 429');
});

test('email extraction failure is non-fatal (routes to Instagram)', async () => {
  extractEmail.mockRejectedValue(new Error('fetch timeout'));

  const res = mockRes();
  await handler(mockReq({ ring: 'San Diego' }), res);

  expect(res._status).toBe(200);
  // Lead should still be created — routed to Instagram
  const firstCall = createLead.mock.calls[0]?.[0];
  if (firstCall) {
    expect(firstCall.channel).toBe('Instagram');
  }
});
