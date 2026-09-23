/**
 * The citation directories checked by Module B, with the strategy used to
 * check each one. Ordered roughly by how much they matter to senior care.
 */

import type { CareType } from './care-types.js';

export const DIRECTORY_IDS = [
  'google',
  'yelp',
  'a_place_for_mom',
  'caring_com',
  'senior_advisor',
  'medicare_gov',
  'bing_places',
  'apple_maps',
  'facebook',
  'healthgrades',
  'yellowpages',
] as const;

export type DirectoryId = (typeof DIRECTORY_IDS)[number];

/**
 * How a directory listing gets verified, in the order the checker tries them.
 * - `api`      — a first-party API returns the listing (Google Places, Yelp Fusion)
 * - `serp`     — targeted `site:` search via Serper.dev finds the listing's URL
 * - `scrape`   — the listing page itself is read to verify the details it shows
 *
 * Most directories disallow crawling their search pages in robots.txt, which we
 * respect (PRD 5.4), so `serp` locates the listing and `scrape` only ever opens
 * the one page it found.
 */
export type CheckStrategy = 'api' | 'scrape' | 'serp';

export interface DirectoryDefinition {
  id: DirectoryId;
  /** Name shown to the operator. */
  label: string;
  domain: string;
  /** Preferred check strategy, then fallbacks in order. */
  strategies: readonly CheckStrategy[];
  /**
   * When set, the directory only counts for communities offering one of these
   * care types (e.g. Medicare.gov only covers skilled nursing / home care).
   */
  appliesToCareTypes?: readonly CareType[];
  /**
   * Tier 1 is the senior-care-specific lead-generation directories (A Place for Mom
   * and its peers) — most of them sell the leads they send, so being listed is worth
   * doing for free but not worth prioritizing (see `Recommendation.group`'s
   * `nice_to_have`). Tier 2 is the mainstream, general-purpose platforms — Yelp, Bing,
   * Apple Maps, Facebook, YellowPages — families search for any kind of business, not
   * only senior care, and nobody has to pay to be found on them.
   */
  tier: 1 | 2;
  /**
   * Lead-generation directories publish their own call-tracking number instead of
   * the community's, by design. Reporting that as a phone mismatch would be advice
   * the operator cannot act on, so the phone is left out of their NAP comparison.
   */
  usesTrackingPhoneNumbers?: true;
  /** Covered by another module, so Module B does not re-check it. */
  coveredByModule?: 'A';
}

export const DIRECTORIES: readonly DirectoryDefinition[] = [
  {
    id: 'google',
    label: 'Google Business Profile',
    domain: 'google.com',
    strategies: ['api'],
    tier: 1,
    coveredByModule: 'A',
  },
  {
    id: 'yelp',
    label: 'Yelp',
    domain: 'yelp.com',
    strategies: ['api', 'serp'],
    // Tier 2, not 1: Yelp is a mainstream platform everybody searches, not a senior-care
    // lead-gen site — see the `tier` field's own doc comment.
    tier: 2,
  },
  {
    id: 'a_place_for_mom',
    label: 'A Place for Mom',
    domain: 'aplaceformom.com',
    strategies: ['serp', 'scrape'],
    tier: 1,
    usesTrackingPhoneNumbers: true,
  },
  {
    id: 'caring_com',
    label: 'Caring.com',
    domain: 'caring.com',
    strategies: ['serp', 'scrape'],
    tier: 1,
    usesTrackingPhoneNumbers: true,
  },
  {
    id: 'senior_advisor',
    label: 'SeniorAdvisor.com',
    domain: 'senioradvisor.com',
    strategies: ['serp', 'scrape'],
    tier: 1,
    usesTrackingPhoneNumbers: true,
  },
  {
    id: 'medicare_gov',
    label: 'Medicare.gov',
    domain: 'medicare.gov',
    strategies: ['serp', 'scrape'],
    appliesToCareTypes: ['skilled_nursing', 'home_care'],
    // Tier 2: a free, official government directory, not a paid senior-care lead-gen
    // site — closer in kind to Bing or Yelp than to A Place for Mom.
    tier: 2,
  },
  {
    id: 'bing_places',
    label: 'Bing Places',
    domain: 'bing.com',
    strategies: ['serp'],
    tier: 2,
  },
  {
    id: 'apple_maps',
    label: 'Apple Maps',
    domain: 'apple.com',
    strategies: ['serp'],
    tier: 2,
  },
  {
    id: 'facebook',
    label: 'Facebook Business Page',
    domain: 'facebook.com',
    strategies: ['serp'],
    tier: 2,
  },
  {
    id: 'healthgrades',
    label: 'Healthgrades',
    domain: 'healthgrades.com',
    strategies: ['serp', 'scrape'],
    appliesToCareTypes: ['memory_care', 'skilled_nursing'],
    // Tier 1: a specialist medical-provider directory, not a mainstream, general-
    // purpose one like Yelp or Bing — families end up there searching for care
    // specifically, the same way they end up at A Place for Mom.
    tier: 1,
  },
  {
    id: 'yellowpages',
    label: 'YellowPages',
    domain: 'yellowpages.com',
    strategies: ['serp', 'scrape'],
    tier: 2,
  },
];

export const DIRECTORY_BY_ID: Record<DirectoryId, DirectoryDefinition> = Object.fromEntries(
  DIRECTORIES.map((directory) => [directory.id, directory]),
) as Record<DirectoryId, DirectoryDefinition>;

/**
 * The directories Module B should check for a community offering `careTypes`.
 * Care-type-specific directories are skipped when they don't apply, and
 * Google is excluded because Module A already covers it.
 */
export function directoriesForCareTypes(
  careTypes: readonly CareType[],
): DirectoryDefinition[] {
  return DIRECTORIES.filter((directory) => {
    if (directory.coveredByModule) return false;
    if (!directory.appliesToCareTypes) return true;
    return directory.appliesToCareTypes.some((careType) => careTypes.includes(careType));
  });
}
