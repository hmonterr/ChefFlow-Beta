/**
 * POST /api/outreach/source
 * Sources personal chef leads from Google Places → Notion Chef Leads DB.
 *
 * Body: { ring?: string, limit?: number }
 * Response: { added, skipped, errors }
 */

import { getAllLeads, createLead }              from '../../lib/outreach/notionClient.js';
import { searchPersonalChefs, SEARCH_SEEDS }   from '../../lib/outreach/placesAdapter.js';
import { extractEmail }                         from '../../lib/outreach/emailExtractor.js';
import { isDuplicate }                          from '../../lib/outreach/dedupe.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed — use POST' });
  }

  const { ring = 'San Diego', limit = 20 } = req.body || {};
  const cap = Math.min(Number(limit) || 20, 50);

  const results = { added: 0, skipped: 0, errors: [] };

  try {
    const existingLeads = await getAllLeads();

    const seeds = ring === 'all'
      ? SEARCH_SEEDS
      : SEARCH_SEEDS.filter(s => s.ring === ring);

    if (seeds.length === 0) {
      return res.status(400).json({ error: `Unknown ring: "${ring}"` });
    }

    const addedThisRun = [];

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

        if (isDuplicate(place, [...existingLeads, ...addedThisRun])) {
          results.skipped++;
          continue;
        }

        let email = null;
        if (place.website) {
          email = await extractEmail(place.website).catch(() => null);
        }

        const lead = {
          ...place,
          email:   email || null,
          channel: email ? 'Email' : 'Instagram',
        };

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
}
