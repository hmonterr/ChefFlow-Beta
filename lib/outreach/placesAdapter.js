'use strict';

/**
 * Google Places API v1 (New) adapter for the Chef Outreach Engine.
 * Uses the Text Search endpoint to find personal chefs by location.
 *
 * Returns normalised lead shapes ready for dedupe + email extraction.
 */

const { assignGeoRing } = require('./geoRing');

const PLACES_SEARCH_URL = 'https://places.googleapis.com/v1/places:searchText';
const FETCH_TIMEOUT_MS  = 12_000;

// Ordered geo seeds: nearest ring first.
// Callers can filter by ring or pass a specific seed.
const SEARCH_SEEDS = [
  // ── San Diego ring ──────────────────────────────────────────────────────
  { query: 'personal chef San Diego CA',    city: 'San Diego, CA',    ring: 'San Diego'   },
  { query: 'personal chef La Jolla CA',     city: 'La Jolla, CA',     ring: 'San Diego'   },
  { query: 'personal chef Encinitas CA',    city: 'Encinitas, CA',    ring: 'San Diego'   },
  { query: 'personal chef Carlsbad CA',     city: 'Carlsbad, CA',     ring: 'San Diego'   },
  { query: 'personal chef Chula Vista CA',  city: 'Chula Vista, CA',  ring: 'San Diego'   },
  { query: 'personal chef Del Mar CA',      city: 'Del Mar, CA',      ring: 'San Diego'   },
  // ── North County ────────────────────────────────────────────────────────
  { query: 'personal chef Oceanside CA',    city: 'Oceanside, CA',    ring: 'North County' },
  { query: 'personal chef Vista CA',        city: 'Vista, CA',        ring: 'North County' },
  { query: 'personal chef Temecula CA',     city: 'Temecula, CA',     ring: 'North County' },
  // ── SoCal ────────────────────────────────────────────────────────────────
  { query: 'personal chef Los Angeles CA',  city: 'Los Angeles, CA',  ring: 'SoCal'        },
  { query: 'personal chef Orange County CA',city: 'Orange County, CA',ring: 'SoCal'        },
];

// Types returned by Places that indicate non-personal-chef businesses
const EXCLUDED_TYPES = new Set([
  'supermarket', 'grocery_or_supermarket', 'convenience_store',
  'meal_delivery', 'fast_food_restaurant', 'restaurant',
]);

/**
 * Query Places API for one seed location.
 * @param {typeof SEARCH_SEEDS[0]} seed
 * @param {number} [maxResults=20]
 * @returns {Promise<Array>} normalised lead objects (no email yet)
 */
async function searchPersonalChefs(seed, maxResults = 20) {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) throw new Error('GOOGLE_PLACES_API_KEY not set');

  const body = {
    textQuery:      seed.query,
    maxResultCount: Math.min(maxResults, 20), // Places API max per request
  };

  const res = await fetch(PLACES_SEARCH_URL, {
    method:  'POST',
    headers: {
      'Content-Type':    'application/json',
      'X-Goog-Api-Key':  apiKey,
      'X-Goog-FieldMask': [
        'places.displayName',
        'places.websiteUri',
        'places.formattedAddress',
        'places.businessStatus',
        'places.types',
      ].join(','),
    },
    body:   JSON.stringify(body),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Places API ${res.status}: ${detail}`);
  }

  const data   = await res.json();
  const places = (data.places || []).filter(isLikelyPersonalChef);

  return places.map(p => normalizeLead(p, seed));
}

// ─── Filters / normalisers ──────────────────────────────────────────────────

function isLikelyPersonalChef(place) {
  if (place.businessStatus && place.businessStatus !== 'OPERATIONAL') return false;

  const types = place.types || [];
  if (types.some(t => EXCLUDED_TYPES.has(t))) return false;

  const name = (place.displayName?.text || '').toLowerCase();
  const EXCLUDED_NAMES = ['catering company', 'meal prep', 'food truck', 'meal kit'];
  if (EXCLUDED_NAMES.some(n => name.includes(n))) return false;

  return true;
}

function normalizeLead(place, seed) {
  const address  = place.formattedAddress || '';
  const cityMatch = address.match(/([^,]+),\s*CA/i);
  const city     = cityMatch ? cityMatch[1].trim() + ', CA' : seed.city;

  return {
    name:     place.displayName?.text || '',
    business: place.displayName?.text || '',
    website:  place.websiteUri || null,
    email:    null,   // populated later by emailExtractor
    instagram: null,
    city,
    geoRing:  seed.ring || assignGeoRing(city),
    source:   'GooglePlaces',
    status:   'Sourced',
    channel:  null,   // determined after email extraction
  };
}

module.exports = { searchPersonalChefs, SEARCH_SEEDS };
