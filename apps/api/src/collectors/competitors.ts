/**
 * Finds the senior living communities a family choosing between options would also
 * be looking at, and reads the same public listing data for each.
 *
 * **We look by geography, not by zip code list.** The PRD asks for the target zip plus
 * two neighbouring ones. There is no free, reliable way to ask "which zips border
 * 37027" — and guessing arithmetically (37027 → 37026, 37028) puts you in a different
 * county as often as it puts you next door. So we search a radius around the
 * community's own coordinates, widening it until we have a set worth comparing, and
 * report the zip codes the search actually reached. That is the same intent, measured
 * rather than assumed.
 *
 * Nobody's website is crawled here. A competitor gets one search we were already
 * making and one listing read; their pages are their business.
 */

import {
  CARE_TYPE_SEARCH_TERMS,
  detectCareTypes,
  normalizeForKeywordMatch,
  type CareType,
} from '@sensi/shared';

import { businessNameSimilarity } from '../analysis/nap.js';
import { logger } from '../lib/logger.js';
import {
  careTypesFromPlace,
  fetchPlaceDetails,
  placesAddress,
  placesZip,
  searchPlaces,
  seniorCareTypes,
  type PlacesPlace,
} from './places.js';

/** How far out we look, in order. Five miles is "the same town" almost everywhere. */
const RADII_MILES = [5, 10, 20];

/** Enough neighbours to average, few enough to read in a table. */
const TARGET_COUNT = 5;

/** Below this we widen the search rather than compare against one or two. */
const MINIMUM_USEFUL_COUNT = 3;

const MILES_TO_METERS = 1609.34;
const EARTH_RADIUS_MILES = 3958.8;

/**
 * Name fragments that mean "this is a place old people live or are cared for".
 *
 * The care-type vocabulary catches most of it. These are the words communities use
 * in their names when they do not spell out a care type — and the reason we check
 * names at all is that Google's categories are unreliable: the community we built
 * this against is filed under "Health".
 */
const SENIOR_NAME_SIGNALS = [
  'senior',
  'seniors',
  'retirement',
  'assisted',
  'memory care',
  'nursing',
  'elder',
  'aging',
  'care home',
  'care center',
  'care centre',
  'care community',
  'living center',
  'living community',
];

/**
 * Businesses that rank for "assisted living" without being a place to live.
 *
 * The placement and referral words are the important ones and were earned live: a
 * search for assisted living near Brentwood returned "Assisted Living Locators South
 * Nashville", a referral franchise with no building, which then scored 88 and dragged
 * the operator's competitive average up with it.
 */
/*
 * "Agency" is deliberately not on this list. A referral or placement agency has no
 * building and its name says so directly ("Locators", "Advisors", "Placement"), which
 * is what actually disqualifies those below. "Agency" alone would also disqualify a
 * real home care agency, which is the correct kind of business to call itself that.
 */
const NOT_A_COMMUNITY = [
  'hospital',
  'medical center',
  'medical centre',
  'urgent care',
  'pharmacy',
  'staffing',
  'placement',
  'locators',
  'locator',
  'referral',
  'referrals',
  'advisors',
  'advisor',
  'consulting',
  'realty',
  'real estate',
  'insurance',
  'law firm',
  'attorney',
  'university',
  'college',
];

export interface CompetitorSearchOptions {
  businessName: string;
  /** The community's own website, so its own listing never appears as a rival. */
  websiteUrl?: string;
  zipCode: string;
  city?: string;
  state?: string;
  /** Which category to search as. Omitted only when nothing could be detected. */
  primaryCareType?: CareType;
  /** The community's coordinates from its Google listing, when we matched one. */
  location?: { latitude: number; longitude: number };
  /** The community's own place id. */
  excludePlaceId?: string;
  /** How many competitors to keep. Defaults to five. */
  limit?: number;
  refresh?: boolean;
}

export interface CompetitorSearchResult {
  /** Listings we are confident are rival communities, nearest first. */
  places: Array<{ place: PlacesPlace; distanceMiles?: number }>;
  /** Zip codes the search reached, the community's own first. */
  zipCodesSearched: string[];
  radiusMiles?: number;
  /** Set when we could not look for competitors at all. */
  unavailableReason?: string;
}

function hostOf(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url).hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return undefined;
  }
}

/** Straight-line distance between two points, in miles. */
export function distanceMiles(
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number },
): number {
  const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;
  const deltaLat = toRadians(to.latitude - from.latitude);
  const deltaLon = toRadians(to.longitude - from.longitude);
  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(toRadians(from.latitude)) * Math.cos(toRadians(to.latitude)) * Math.sin(deltaLon / 2) ** 2;
  return Number((2 * EARTH_RADIUS_MILES * Math.asin(Math.sqrt(a))).toFixed(1));
}

/** True when this listing is a senior living community rather than a nearby business. */
export function looksLikeSeniorLiving(place: PlacesPlace): boolean {
  const name = normalizeForKeywordMatch(place.displayName?.text ?? '');
  if (!name) return false;
  if (NOT_A_COMMUNITY.some((word) => name.includes(word))) return false;
  if (seniorCareTypes(place).length) return true;
  if (detectCareTypes(name).length) return true;
  return SENIOR_NAME_SIGNALS.some((signal) => name.includes(signal));
}

/**
 * Whether a search result is the operator's own community wearing a different hat.
 *
 * A shared website domain or the same place id is decisive. A near-identical name is
 * treated as the same community too: campuses list their assisted living and their
 * memory care separately, and telling an operator they are behind themselves is worse
 * than dropping one row from the table.
 */
export function isTargetItself(place: PlacesPlace, options: CompetitorSearchOptions): boolean {
  if (options.excludePlaceId && place.id === options.excludePlaceId) return true;
  const targetHost = hostOf(options.websiteUrl);
  if (targetHost && hostOf(place.websiteUri) === targetHost) return true;
  return businessNameSimilarity(options.businessName, place.displayName?.text) >= 0.85;
}

/**
 * The rival communities in a result set, nearest first, deduplicated by place id.
 *
 * `withinMiles` is where the radius is actually enforced. Google's Text Search treats
 * a circle as a hint and will happily return a community forty miles away when there
 * are few nearby, so "within five miles" has to be our arithmetic, not its promise.
 * A listing with no coordinates cannot be measured, and is kept rather than dropped —
 * it came back from a local search, which is some evidence of being local.
 */
export function pickCompetitors(
  places: PlacesPlace[],
  options: CompetitorSearchOptions,
  withinMiles?: number,
): Array<{ place: PlacesPlace; distanceMiles?: number }> {
  const seen = new Set<string>();
  const kept: Array<{ place: PlacesPlace; distanceMiles?: number }> = [];

  for (const place of places) {
    if (!place.id || seen.has(place.id)) continue;
    // A closed community is not competing with anyone.
    if (place.businessStatus && place.businessStatus !== 'OPERATIONAL') continue;
    if (isTargetItself(place, options)) continue;
    if (!looksLikeSeniorLiving(place)) continue;

    const to =
      place.location?.latitude !== undefined && place.location.longitude !== undefined
        ? { latitude: place.location.latitude, longitude: place.location.longitude }
        : undefined;
    const miles = options.location && to ? distanceMiles(options.location, to) : undefined;
    if (withinMiles !== undefined && miles !== undefined && miles > withinMiles) continue;

    seen.add(place.id);
    kept.push({ place, ...(miles === undefined ? {} : { distanceMiles: miles }) });
  }

  return kept.sort((a, b) => (a.distanceMiles ?? Number.MAX_SAFE_INTEGER) - (b.distanceMiles ?? Number.MAX_SAFE_INTEGER));
}

/**
 * The search that finds rivals: one category, chosen deliberately.
 *
 * This used to run the first two *detected* care types together, which is how a home
 * care agency ended up compared against assisted living communities — its own page
 * described the levels of care its clients were leaving, and "assisted living" and
 * "memory care" were the two that happened to be detected. One category, chosen by
 * `primaryCareType` rather than by whatever appeared first, means the search only
 * ever looks for the kind of business the operator actually is.
 */
export function competitorQueries(primaryCareType?: CareType): string[] {
  if (!primaryCareType) return ['senior care'];
  return [CARE_TYPE_SEARCH_TERMS[primaryCareType]];
}

/**
 * Finds nearby communities, widening the radius until the set is worth comparing.
 *
 * Without coordinates for the community — no Google listing, or a listing with no
 * location — we fall back to letting Google interpret the zip code, and report only
 * that one zip as covered.
 */
export async function findCompetitors(
  options: CompetitorSearchOptions,
): Promise<CompetitorSearchResult> {
  const limit = options.limit ?? TARGET_COUNT;
  const queries = competitorQueries(options.primaryCareType);
  const place = [options.city, options.state].filter(Boolean).join(', ') || options.zipCode;

  let found: Array<{ place: PlacesPlace; distanceMiles?: number }> = [];
  let radiusUsed: number | undefined;
  let unavailableReason: string | undefined;

  const radii = options.location ? RADII_MILES : [undefined];

  for (const radiusMiles of radii) {
    const results: PlacesPlace[] = [];

    for (const query of queries) {
      const outcome = await searchPlaces(
        radiusMiles === undefined ? `${query} in ${place}` : `${query} near ${place}`,
        {
          ...(radiusMiles !== undefined && options.location
            ? {
                circle: {
                  latitude: options.location.latitude,
                  longitude: options.location.longitude,
                  radiusMeters: Math.round(radiusMiles * MILES_TO_METERS),
                },
              }
            : {}),
          ...(options.refresh === undefined ? {} : { refresh: options.refresh }),
        },
      );

      if (!outcome.ok) {
        unavailableReason = outcome.reason;
        continue;
      }
      results.push(...outcome.places);
    }

    found = pickCompetitors(results, options, radiusMiles);
    radiusUsed = radiusMiles;
    if (found.length >= MINIMUM_USEFUL_COUNT) break;
  }

  if (!found.length) {
    return {
      places: [],
      zipCodesSearched: [options.zipCode],
      ...(radiusUsed === undefined ? {} : { radiusMiles: radiusUsed }),
      unavailableReason:
        unavailableReason ??
        'We could not find other senior living communities close enough to compare you with.',
    };
  }

  const shortlist = found.slice(0, limit);

  // One listing read each, without the reviews field. Failures are not fatal: the
  // search result already carries the name, rating, review count and category.
  const detailed = await Promise.all(
    shortlist.map(async (entry) => {
      const details = await fetchPlaceDetails(entry.place.id!, {
        withoutReviews: true,
        ...(options.refresh === undefined ? {} : { refresh: options.refresh }),
      });
      return details.ok ? { ...entry, place: details.place } : entry;
    }),
  );

  const zips = new Set<string>([options.zipCode]);
  for (const entry of detailed) {
    const zip = placesZip(entry.place);
    if (zip) zips.add(zip);
  }

  logger.info('Competitor search complete', {
    considered: found.length,
    compared: detailed.length,
    radiusMiles: radiusUsed,
    zipCodes: [...zips],
  });

  return {
    places: detailed,
    zipCodesSearched: [...zips],
    ...(radiusUsed === undefined ? {} : { radiusMiles: radiusUsed }),
  };
}

/** Care types a competitor's listing and name imply, for the comparison table. */
export function competitorCareTypes(place: PlacesPlace): CareType[] {
  const fromTypes = careTypesFromPlace(place);
  const fromName = detectCareTypes(place.displayName?.text ?? '');
  return [...new Set([...fromTypes, ...fromName])];
}

/** City and state of a competitor, for the table's second column. */
export function competitorLocality(place: PlacesPlace): { city?: string; state?: string } {
  const address = placesAddress(place);
  return {
    ...(address.city ? { city: address.city } : {}),
    ...(address.state ? { state: address.state } : {}),
  };
}
