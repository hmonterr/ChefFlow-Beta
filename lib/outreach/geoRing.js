// Geo ring assignment for the Chef Outreach Engine.
// Rings ordered nearest-first: San Diego → North County → SoCal → CA → National.

const RING_MAP = {
  'San Diego': [
    'san diego', 'la jolla', 'encinitas', 'carlsbad', 'chula vista',
    'del mar', 'solana beach', 'coronado', 'el cajon', 'santee',
    'escondido', 'poway', 'rancho santa fe', 'bonita', 'national city',
    'lemon grove', 'spring valley', 'lakeside', 'ramona', 'alpine',
    'pt loma', 'point loma', 'mission hills', 'north park', 'hillcrest',
    'ocean beach', 'pacific beach', 'mission beach', 'bay park',
    'kensington', 'talmadge', 'college area', 'city heights', 'skyline',
  ],
  'North County': [
    'oceanside', 'vista', 'san marcos', 'fallbrook', 'temecula', 'murrieta',
    'bonsall', 'rainbow', 'valley center', 'camp pendleton', 'san clemente',
  ],
  SoCal: [
    'los angeles', 'orange', 'anaheim', 'riverside', 'san bernardino',
    'long beach', 'pasadena', 'irvine', 'santa ana', 'huntington beach',
    'glendale', 'burbank', 'torrance', 'pomona', 'ontario',
    'rancho cucamonga', 'santa monica', 'beverly hills', 'malibu',
    'palm springs', 'palm desert', 'oxnard', 'ventura', 'santa barbara',
    'thousand oaks', 'simi valley', 'san pedro', 'redondo beach',
    'hermosa beach', 'manhattan beach', 'newport beach', 'laguna beach',
    'dana point', 'san juan capistrano',
  ],
};

const CA_PATTERN = /,\s*CA\b|,\s*California\b|\bCA\s*\d{5}/i;

/**
 * Assigns a Geo ring label to a city/region string.
 * @param {string} city
 * @returns {'San Diego'|'North County'|'SoCal'|'CA'|'National'}
 */
export function assignGeoRing(city) {
  if (!city) return 'National';
  const normalized = city.toLowerCase().trim();

  for (const [ring, cities] of Object.entries(RING_MAP)) {
    if (cities.some(c => normalized.includes(c))) {
      return ring;
    }
  }

  if (CA_PATTERN.test(city)) return 'CA';

  return 'National';
}
