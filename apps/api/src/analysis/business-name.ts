/**
 * Working out what a community is actually called, and which words in that name
 * identify it.
 *
 * This matters more than it looks. Every listing match — Google, Yelp, nine
 * directories — is anchored on the name, and senior living names are mostly made of
 * the same dozen words. "Exceptional Senior Living" and "Brookdale Senior Living"
 * share two words out of three while being different companies in different towns,
 * so a matcher that counts word overlap alone will confidently return the wrong
 * business. Only the distinctive words count.
 */

import { normalizeForKeywordMatch } from '@sensi/shared';

/**
 * Words that appear in half the senior living names in the country, plus the
 * marketing adjectives operators put in page titles. None of them identify anyone.
 */
export const GENERIC_NAME_WORDS = new Set([
  'senior',
  'seniors',
  'living',
  'life',
  'lifestyle',
  'lifestyles',
  'community',
  'communities',
  'retirement',
  'care',
  'caring',
  'assisted',
  'independent',
  'memory',
  'nursing',
  'skilled',
  'rehabilitation',
  'rehab',
  'health',
  'healthcare',
  'center',
  'centre',
  'the',
  'and',
  'for',
  'inc',
  'llc',
  'group',
  'services',
  'service',
  'home',
  'homes',
  'residence',
  'residences',
  'residential',
  'apartments',
  'exceptional',
  'welcome',
  'best',
  'premier',
  'luxury',
  'affordable',
  'official',
  'website',
]);

/** Words of three letters or more, lowercased and stripped of punctuation. */
export function nameTokens(text: string): string[] {
  return normalizeForKeywordMatch(text)
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 2);
}

/** Tokens that are not industry boilerplate. Empty when the name is all boilerplate. */
export function nonGenericTokens(text: string): string[] {
  return nameTokens(text).filter((token) => !GENERIC_NAME_WORDS.has(token));
}

/**
 * Landscape words. Senior living names are built from these — Park, Village, Manor,
 * Meadows — and so are the names of unrelated businesses on the same streets. On
 * "park" alone we matched "CareNow Urgent Care - Brentwood Health Park" to Cloverland
 * Park, so a word from this list is never enough on its own to claim a listing.
 */
const LANDSCAPE_NAME_WORDS = new Set([
  'park', 'parks', 'place', 'plaza', 'square', 'commons', 'court', 'courtyard',
  'village', 'villas', 'villa', 'manor', 'house', 'lodge', 'inn', 'club', 'estates',
  'gardens', 'garden', 'grove', 'groves', 'meadow', 'meadows', 'farm', 'farms',
  'oak', 'oaks', 'wood', 'woods', 'woodland', 'pine', 'pines', 'maple', 'cedar', 'willow',
  'hill', 'hills', 'ridge', 'summit', 'heights', 'bluff', 'point', 'pointe', 'terrace',
  'valley', 'glen', 'creek', 'river', 'lake', 'lakes', 'springs', 'spring', 'brook',
  'cove', 'harbor', 'harbour', 'haven', 'landing', 'crossing', 'trace', 'bend',
  'view', 'vista', 'ranch', 'trail', 'way', 'north', 'south', 'east', 'west',
]);

/**
 * The words that could only be this community: identifying words with the landscape
 * vocabulary taken out. Empty when a name is built entirely from shared words
 * ("Park Place"), in which case the caller has to demand a fuller match instead.
 */
export function strongNameTokens(text: string): string[] {
  return nonGenericTokens(text).filter((token) => !LANDSCAPE_NAME_WORDS.has(token));
}

/**
 * The parts of a business name that identify it. Falls back to every token when a
 * name is nothing but generic words ("The Senior Living Community"), because
 * something has to be matched on.
 */
export function distinctiveNameTokens(businessName: string): string[] {
  const distinctive = nonGenericTokens(businessName);
  return distinctive.length ? distinctive : nameTokens(businessName);
}

/**
 * Title segments that name a place rather than a business: "Brentwood, TN",
 * "Assisted Living in Brentwood, TN".
 */
const LOCATION_SEGMENT_RE = /,\s*[A-Za-z]{2}\.?$|\bin\s+[A-Z]/;

function compact(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * The community's name out of a page title.
 *
 * Titles are built from segments — "Exceptional Senior Living | Brentwood, TN |
 * Cloverland Park" — and the community's name is not reliably the first one. The
 * domain settles it: an operator's domain nearly always spells the community's name,
 * so the segment the domain also contains is the name.
 */
export function businessNameFromTitle(title: string, host?: string): string | undefined {
  const segments = title
    .split(/[|–—•·:]|\s-\s/)
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 1);
  if (!segments.length) return undefined;

  if (host) {
    const hostCompact = compact(host.replace(/^www\./i, ''));
    const inDomain = segments.find((segment) => {
      const key = compact(segment);
      return key.length > 3 && hostCompact.includes(key);
    });
    if (inDomain) return inDomain;
  }

  // Otherwise the first segment that says more than "Assisted Living" and is not
  // just the town.
  const named = segments.filter((segment) => !LOCATION_SEGMENT_RE.test(segment));
  const meaningful = named.find((segment) => nonGenericTokens(segment).length > 0);
  return meaningful ?? named[0] ?? segments[0];
}
