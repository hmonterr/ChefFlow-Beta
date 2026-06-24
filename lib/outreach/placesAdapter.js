/**
 * Google Places API v1 (New) adapter.
 */

import { assignGeoRing } from './geoRing.js';

const PLACES_SEARCH_URL = 'https://places.googleapis.com/v1/places:searchText';
const FETCH_TIMEOUT_MS  = 12_000;

export const SEARCH_SEEDS = [
  { query: 'personal chef San Diego CA',    city: 'San Diego, CA',    ring: 'San Diego'    },
  { query: 'personal chef La Jolla CA',     city: 'La Jolla, CA',     ring: 'San Diego'    },
  { query: 'personal chef Encinitas CA',    city: 'Encinitas, CA',    ring: 'San Diego'    },
  { query: 'personal chef Carlsbad CA',     city: 'Carlsbad, CA',     ring: 'San Diego'    },
  { query: 'personal chef Chula Vista CA',  city: 'Chula Vista, CA',  ring: 'San Diego'    },
  { query: 'personal chef Del Mar CA',      city: 'Del Mar, CA',      ring: 'San Diego'    },
  { query: 'personal chef Oceanside CA',    city: 'Oceanside, CA',    ring: 'North County' },
  { query: 'personal chef Vista CA',        city: 'Vista, CA',        ring: 'North County' },
  { query: 'personal chef Temecula CA',     city: 'Temecula, CA',     ring: 'North County' },
  { query: 'personal chef Los Angeles CA',  city: 'Los Angeles, CA',  ring: 'SoCal'        },
  { query: 'personal chef Orange County CA',city: 'Orange County, CA',ring: 'SoCal'        },
];

const EXCLUDED_TYPES = new Set([
  'supermarket', 'grocery_or_supermarket', 'convenience_store',
  'meal_delivery', 'fast_food_restaurant', 'restaurant',
]);

export async function searchPersonalChefs(seed, maxResults = 20) {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) throw new Error('GOOGLE_PLACES_API_KEY not set');

  const res = await fetch(PLACES_SEARCH_URL, {
    method:  'POST',
    headers: {
      'Content-Type':     'application/json',
      'X-Goog-Api-Key':   apiKey,
      'X-Goog-FieldMask': 'places.displayName,places.websiteUri,places.formattedAddress,places.businessStatus,places.types',
    },
    body:   JSON.stringify({ textQuery: seed.query, maxResultCount: Math.min(maxResults, 20) }),
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

function isLikelyPersonalChef(place) {
  if (place.businessStatus && place.businessStatus !== 'OPERATIONAL') return false;
  const types = place.types || [];
  if (types.some(t => EXCLUDED_TYPES.has(t))) return false;
  const name = (place.displayName?.text || '').toLowerCase();
  if (['catering company', 'meal prep', 'food truck', 'meal kit'].some(n => name.includes(n))) return false;
  return true;
}

function normalizeLead(place, seed) {
  const address   = place.formattedAddress || '';
  const cityMatch = address.match(/([^,]+),\s*CA/i);
  const city      = cityMatch ? cityMatch[1].trim() + ', CA' : seed.city;

  return {
    name:      place.displayName?.text || '',
    business:  place.displayName?.text || '',
    website:   place.websiteUri || null,
    email:     null,
    instagram: null,
    city,
    geoRing:   seed.ring || assignGeoRing(city),
    source:    'GooglePlaces',
    status:    'Sourced',
    channel:   null,
  };
}
