'use strict';

/**
 * POST /api/outreach/source
 *
 * Sources personal chef leads from Google Places and writes new ones to Notion.
 * Deduplicates against all existing Notion leads before writing.
 *
 * Body (JSON):
 *   ring   {string}  Geo ring to search: 'San Diego'|'North County'|'SoCal'|'all'
 *                    Default: 'San Diego'
 *   limit  {number}  Max new leads to add per call. Default: 20, max: 50.
 *
 * Response:
 *   { added, skipped, errors }
 */

const { getAllLeads, createLead }         = require('../../lib/outreach/notionClient');
const { searchPersonalChefs, SEARCH_SEEDS } = require('../../lib/outreach/placesAdapter');
const { extractEmail }                    = require('../../lib/outreach/emailExtractor');
const { isDuplicate }                     = require('../../lib/outreach/dedupe');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed — use POST' });
  }

  const { ring = 'San Diego', limit = 20 } = req.body || {};
  const cap = Math.min(Number(limit) || 20, 50);

  const results = { added: 0, skipped: 0, errors: [] };

  try {
    // 1. Load all existing leads once for deduplication
    const existingLeads = await getAllLeads();

    // 2. Determine which seeds to query
    const seeds = ring === 'all'
      ? SEARCH_SEEDS
      : SEARCH_SEEDS.filter(s => s.ring === ring);

    if (seeds.length === 0) {
      return res.status(400).json({ error: `Unknown ring: "${ring}"` });
    }

    // Accumulates leads added this run (for within-run dedupe)
    const addedThisRun = [];

    // 3. Query each seed location in geo-priority order
    outerLoop:
    for (const seed of seeds) {
      let places;
      try {
        places = await searchPersonalChefs(seed, cap);
      } catch (err) {
        results.errors.push({ seed: seed.city, error: err.message });
        continue;
      }

      for (const place of places) {
        if (!place.name) continue;

        // Dedupe against Notion + within-run additions
        if (isDuplicate(place, [...existingLeads, ...addedThisRun])) {
          results.skipped++;
          continue;
        }

        // Extract email from website (non-fatal if none found)
        let email = null;
        if (place.website) {
          email = await extractEmail(place.website).catch(() => null);
        }

        // Channel rule: Email if we found a public address, else Instagram
        const lead = {
          ...place,
          email:   email || null,
          channel: email ? 'Email' : 'Instagram',
        };

        // Write to Notion
        try {
          await createLead(lead);
          addedThisRun.push(lead);
          results.added++;
        } catch (err) {
          results.errors.push({ lead: lead.name, error: err.message });
        }

        if (results.added >= cap) break outerLoop;
      }
    }

    return res.status(200).json(results);

  } catch (err) {
    console.error('[source] fatal:', err);
    return res.status(500).json({ error: err.message });
  }
};
