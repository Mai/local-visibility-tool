/**
 * Google Places API (New) client — the source for Module A (Google Business
 * Profile) and the Google half of Module D (reviews).
 *
 * Two calls per audit: one Text Search to find the community's listing, one
 * Place Details for everything the modules score. Both are cached 24h (PRD 5.4)
 * and every failure — including a missing API key — is returned as a value so a
 * check degrades to "unable to verify" instead of ending the audit.
 *
 * Field masks are mandatory on this API and they determine billing. The masks
 * below are deliberately narrow; `reviews` is the only Enterprise-SKU field we
 * request, and it is what makes the review panel possible.
 */

import { normalizePhone, type CareType } from '@sensi/shared';

import { nameTokens, nonGenericTokens } from '../analysis/business-name.js';
import { businessNameSimilarity } from '../analysis/nap.js';

import { env } from '../config/env.js';
import { withCache } from '../lib/cache.js';
import { fetchJson, postJson } from '../lib/http.js';
import { logger } from '../lib/logger.js';

const SEARCH_ENDPOINT = 'https://places.googleapis.com/v1/places:searchText';
const DETAILS_ENDPOINT = 'https://places.googleapis.com/v1/places';

const SEARCH_FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.websiteUri',
  'places.nationalPhoneNumber',
  'places.rating',
  'places.userRatingCount',
  'places.primaryType',
  'places.types',
  'places.businessStatus',
  'places.location',
].join(',');

const DETAILS_FIELD_MASK = [
  'id',
  'displayName',
  'formattedAddress',
  'addressComponents',
  'nationalPhoneNumber',
  'internationalPhoneNumber',
  'websiteUri',
  'googleMapsUri',
  'rating',
  'userRatingCount',
  'primaryType',
  'primaryTypeDisplayName',
  'types',
  'businessStatus',
  'regularOpeningHours',
  'editorialSummary',
  'photos',
  'reviews',
  'location',
].join(',');

/**
 * Competitor details. Everything the target's mask has except `reviews` — we compare
 * how complete a neighbour's listing is, not what its families wrote, and `reviews` is
 * the one field on the expensive SKU.
 */
const COMPETITOR_FIELD_MASK = DETAILS_FIELD_MASK.split(',')
  .filter((field) => field !== 'reviews')
  .join(',');

/* -------------------------------------------------------------------------- */
/* Response shapes (only the fields we read)                                  */
/* -------------------------------------------------------------------------- */

interface PlacesText {
  text?: string;
  languageCode?: string;
}

interface PlacesAddressComponent {
  longText?: string;
  shortText?: string;
  types?: string[];
}

export interface PlacesReview {
  name?: string;
  rating?: number;
  text?: PlacesText;
  originalText?: PlacesText;
  publishTime?: string;
  relativePublishTimeDescription?: string;
  authorAttribution?: { displayName?: string };
}

export interface PlacesPlace {
  id?: string;
  displayName?: PlacesText;
  formattedAddress?: string;
  addressComponents?: PlacesAddressComponent[];
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
  websiteUri?: string;
  googleMapsUri?: string;
  rating?: number;
  userRatingCount?: number;
  primaryType?: string;
  primaryTypeDisplayName?: PlacesText;
  types?: string[];
  businessStatus?: string;
  regularOpeningHours?: {
    openNow?: boolean;
    weekdayDescriptions?: string[];
    periods?: unknown[];
  };
  editorialSummary?: PlacesText;
  photos?: Array<{ name?: string; widthPx?: number; heightPx?: number }>;
  reviews?: PlacesReview[];
  location?: { latitude?: number; longitude?: number };
}

interface SearchResponse {
  places?: PlacesPlace[];
  error?: { message?: string; status?: string };
}

interface DetailsResponse extends PlacesPlace {
  error?: { message?: string; status?: string };
}

/* -------------------------------------------------------------------------- */
/* Outcomes                                                                   */
/* -------------------------------------------------------------------------- */

export interface PlacesUnavailable {
  ok: false;
  reason: string;
  /** True when the only thing missing is the API key, not the data. */
  missingKey?: boolean;
}

export interface PlaceMatch {
  ok: true;
  place: PlacesPlace;
  /** How we decided this listing is the operator's community. */
  matchedOn: 'website' | 'name_and_zip' | 'name';
  /** 0–1 confidence, used to warn the operator when the match is loose. */
  confidence: number;
  /** Other candidates, kept so the UI can offer "not your listing?" later. */
  alternatives: Array<{ id: string; name: string; formattedAddress?: string }>;
}

export interface PlaceNotFound {
  ok: false;
  notFound: true;
  reason: string;
  /** What we did see nearby, so the operator can tell whether to claim a listing. */
  alternatives: Array<{ id: string; name: string; formattedAddress?: string }>;
}

export type FindPlaceOutcome = PlaceMatch | PlaceNotFound | PlacesUnavailable;
export type PlaceDetailsOutcome = { ok: true; place: PlacesPlace } | PlacesUnavailable;

/** Google address components flattened into the fields the audit compares. */
export interface PlacesAddress {
  street?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  county?: string;
}

const MISSING_KEY: PlacesUnavailable = {
  ok: false,
  missingKey: true,
  reason:
    'Google listing checks need a Google Places API key. Add GOOGLE_PLACES_API_KEY to your environment to include them.',
};

function hostOf(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url).hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return undefined;
  }
}

/** Pulls city / state / zip out of Google's address component list. */
export function placesAddress(place: PlacesPlace): PlacesAddress {
  const components = place.addressComponents ?? [];
  const find = (type: string, short = false): string | undefined => {
    const match = components.find((component) => component.types?.includes(type));
    if (!match) return undefined;
    return (short ? match.shortText : match.longText) ?? match.longText ?? match.shortText;
  };

  const streetNumber = find('street_number');
  const route = find('route');
  const street = [streetNumber, route].filter(Boolean).join(' ') || undefined;

  const address: PlacesAddress = {};
  if (street) address.street = street;
  const city = find('locality') ?? find('postal_town') ?? find('sublocality');
  if (city) address.city = city;
  const state = find('administrative_area_level_1', true);
  if (state) address.state = state;
  const zipCode = find('postal_code');
  if (zipCode) address.zipCode = zipCode.slice(0, 5);
  const county = find('administrative_area_level_2');
  if (county) address.county = county;
  return address;
}

/** Zip from address components, falling back to the formatted address string. */
export function placesZip(place: PlacesPlace): string | undefined {
  const fromComponents = placesAddress(place).zipCode;
  if (fromComponents) return fromComponents;
  const match = place.formattedAddress?.match(/\b(\d{5})(?:-\d{4})?\b/);
  return match?.[1];
}

function summarize(place: PlacesPlace): { id: string; name: string; formattedAddress?: string } {
  return {
    id: place.id ?? '',
    name: place.displayName?.text ?? 'Unnamed listing',
    ...(place.formattedAddress ? { formattedAddress: place.formattedAddress } : {}),
  };
}

export interface FindPlaceOptions {
  businessName: string;
  websiteUrl: string;
  zipCode: string;
  city?: string;
  state?: string;
  refresh?: boolean;
}

/**
 * Picks the operator's listing out of the search results.
 *
 * A matching website domain is decisive — operators rarely share one. Otherwise a
 * strong name overlap in the right zip is accepted, and a name-only match is
 * returned with low confidence so the caller can warn.
 */
export function chooseMatch(
  places: PlacesPlace[],
  options: Pick<FindPlaceOptions, 'businessName' | 'websiteUrl' | 'zipCode'>,
): FindPlaceOutcome {
  const candidates = places.filter((place) => place.id);
  const alternatives = candidates.slice(0, 5).map(summarize);

  if (!candidates.length) {
    return {
      ok: false,
      notFound: true,
      reason: 'We could not find a Google listing for your community.',
      alternatives: [],
    };
  }

  const targetHost = hostOf(options.websiteUrl);
  if (targetHost) {
    const byWebsite = candidates.find((place) => hostOf(place.websiteUri) === targetHost);
    if (byWebsite) {
      return {
        ok: true,
        place: byWebsite,
        matchedOn: 'website',
        confidence: 1,
        alternatives: alternatives.filter((item) => item.id !== byWebsite.id),
      };
    }
  }

  // An identifying word has to appear in the candidate's name. Without that rule,
  // two unrelated communities in one zip code — "Exceptional Senior Living" and
  // "Brookdale Senior Living" — match each other on "senior living" alone.
  const identifying = nonGenericTokens(options.businessName);

  const scored = candidates
    .map((place) => {
      const candidateTokens = new Set(nameTokens(place.displayName?.text ?? ''));
      return {
        place,
        similarity: businessNameSimilarity(options.businessName, place.displayName?.text),
        identifyingHits: identifying.filter((token) => candidateTokens.has(token)).length,
        zipMatches: placesZip(place) === options.zipCode,
      };
    })
    .sort(
      (a, b) =>
        b.identifyingHits - a.identifyingHits ||
        Number(b.zipMatches) - Number(a.zipMatches) ||
        b.similarity - a.similarity,
    );

  const best = scored[0];
  // Either an identifying word matched, or — for a name made only of industry words
  // — the name is near-exact and in the right zip code. Anything less is a listing
  // that merely sounds similar.
  const nameIsCredible = identifying.length
    ? Boolean(best?.identifyingHits)
    : Boolean(best?.zipMatches && best.similarity >= 0.75);

  if (best && !nameIsCredible) {
    return {
      ok: false,
      notFound: true,
      reason:
        'We found Google listings nearby but none whose name matched your community closely enough to be sure.',
      alternatives,
    };
  }

  if (best && best.similarity >= 0.5 && best.zipMatches) {
    return {
      ok: true,
      place: best.place,
      matchedOn: 'name_and_zip',
      confidence: 0.8,
      alternatives: alternatives.filter((item) => item.id !== best.place.id),
    };
  }

  if (best && best.similarity >= 0.75) {
    return {
      ok: true,
      place: best.place,
      matchedOn: 'name',
      confidence: 0.5,
      alternatives: alternatives.filter((item) => item.id !== best.place.id),
    };
  }

  return {
    ok: false,
    notFound: true,
    reason:
      'We found Google listings nearby but none that clearly matched your community name, website or zip code.',
    alternatives,
  };
}

/** Text Search for the operator's community. */
export async function findPlace(options: FindPlaceOptions): Promise<FindPlaceOutcome> {
  if (!env.GOOGLE_PLACES_API_KEY) return MISSING_KEY;

  const locationHint = [options.city, options.state].filter(Boolean).join(', ');
  const textQuery = [options.businessName, locationHint || options.zipCode]
    .filter(Boolean)
    .join(' ');

  const cacheKey = `places:search:${textQuery}|${options.zipCode}`;

  return withCache<FindPlaceOutcome>(
    'places',
    cacheKey,
    async () => {
      const outcome = await postJson<SearchResponse>(
        SEARCH_ENDPOINT,
        { textQuery, maxResultCount: 10, languageCode: 'en', regionCode: 'US' },
        {
          label: `places:search:${textQuery}`,
          timeoutMs: 15_000,
          headers: {
            'X-Goog-Api-Key': env.GOOGLE_PLACES_API_KEY!,
            'X-Goog-FieldMask': SEARCH_FIELD_MASK,
          },
        },
      );

      if (!outcome.ok) {
        logger.warn('Places search failed', { textQuery, reason: outcome.reason });
        return {
          ok: false,
          reason: `We could not reach Google’s business directory (${outcome.reason})`,
        };
      }
      if (outcome.value.error) {
        return {
          ok: false,
          reason: `Google’s business directory refused the request (${outcome.value.error.message ?? 'unknown error'})`,
        };
      }

      return chooseMatch(outcome.value.places ?? [], options);
    },
    {
      ...(options.refresh === undefined ? {} : { refresh: options.refresh }),
      // "There is no listing for this community" is an answer and is cached. "Google
      // would not talk to us" is not.
      shouldCache: (value) => value.ok || 'notFound' in value,
    },
  );
}

export interface PlacesSearchOptions {
  maxResultCount?: number;
  /**
   * Biases results towards a circle — how the competitor search stays local.
   *
   * Text Search takes a circle as a *bias*, not a restriction (its
   * `locationRestriction` accepts only a rectangle), so results outside the radius
   * still come back and the caller has to enforce the distance itself.
   */
  circle?: { latitude: number; longitude: number; radiusMeters: number };
  refresh?: boolean;
}

export type PlacesSearchOutcome = { ok: true; places: PlacesPlace[] } | PlacesUnavailable;

/**
 * A Text Search, returned as-is for callers that do their own matching.
 *
 * `findPlace` above answers "which listing is this operator's"; this answers "what else
 * is around here", which needs the whole result set rather than one match.
 */
export async function searchPlaces(
  textQuery: string,
  options: PlacesSearchOptions = {},
): Promise<PlacesSearchOutcome> {
  if (!env.GOOGLE_PLACES_API_KEY) return MISSING_KEY;

  const { circle } = options;
  const cacheKey = `places:search:${textQuery}${
    circle ? `|${circle.latitude.toFixed(4)},${circle.longitude.toFixed(4)}@${circle.radiusMeters}` : ''
  }`;

  return withCache<PlacesSearchOutcome>(
    'places',
    cacheKey,
    async () => {
      const outcome = await postJson<SearchResponse>(
        SEARCH_ENDPOINT,
        {
          textQuery,
          maxResultCount: options.maxResultCount ?? 20,
          languageCode: 'en',
          regionCode: 'US',
          ...(circle
            ? {
                locationBias: {
                  circle: {
                    center: { latitude: circle.latitude, longitude: circle.longitude },
                    radius: circle.radiusMeters,
                  },
                },
              }
            : {}),
        },
        {
          label: `places:search:${textQuery}`,
          timeoutMs: 15_000,
          headers: {
            'X-Goog-Api-Key': env.GOOGLE_PLACES_API_KEY!,
            'X-Goog-FieldMask': SEARCH_FIELD_MASK,
          },
        },
      );

      if (!outcome.ok) {
        logger.warn('Places search failed', { textQuery, reason: outcome.reason });
        return { ok: false, reason: `We could not reach Google’s business directory (${outcome.reason})` };
      }
      if (outcome.value.error) {
        return {
          ok: false,
          reason: `Google’s business directory refused the request (${outcome.value.error.message ?? 'unknown error'})`,
        };
      }

      return { ok: true, places: (outcome.value.places ?? []).filter((place) => place.id) };
    },
    {
      ...(options.refresh === undefined ? {} : { refresh: options.refresh }),
      shouldCache: (value) => value.ok,
    },
  );
}

/** Full details for a place id, including up to five reviews. */
export async function fetchPlaceDetails(
  placeId: string,
  options: { refresh?: boolean; withoutReviews?: boolean } = {},
): Promise<PlaceDetailsOutcome> {
  if (!env.GOOGLE_PLACES_API_KEY) return MISSING_KEY;

  const mask = options.withoutReviews ? COMPETITOR_FIELD_MASK : DETAILS_FIELD_MASK;
  // The mask is part of the key: a response fetched without reviews must never be
  // handed to a caller that needs them.
  const cacheKey = `places:details:${options.withoutReviews ? 'lite:' : ''}${placeId}`;

  return withCache<PlaceDetailsOutcome>(
    'places',
    cacheKey,
    async () => {
      const outcome = await fetchJson<DetailsResponse>(
        `${DETAILS_ENDPOINT}/${encodeURIComponent(placeId)}`,
        {
          label: `places:details:${placeId}`,
          timeoutMs: 15_000,
          headers: {
            'X-Goog-Api-Key': env.GOOGLE_PLACES_API_KEY!,
            'X-Goog-FieldMask': mask,
          },
        },
      );

      if (!outcome.ok) {
        return {
          ok: false,
          reason: `We could not read your Google listing (${outcome.reason})`,
        };
      }
      if (outcome.value.error) {
        return {
          ok: false,
          reason: `Google refused to share the listing details (${outcome.value.error.message ?? 'unknown error'})`,
        };
      }

      return { ok: true, place: outcome.value };
    },
    {
      ...(options.refresh === undefined ? {} : { refresh: options.refresh }),
      shouldCache: (value) => value.ok,
    },
  );
}

/** The listing's phone in the 10-digit form the NAP comparison uses. */
export function placesPhone(place: PlacesPlace): string | undefined {
  return normalizePhone(place.nationalPhoneNumber ?? place.internationalPhoneNumber);
}

/** Google place types that indicate the listing is categorised as senior care. */
const SENIOR_CARE_GOOGLE_TYPES = new Set([
  'assisted_living_facility',
  'nursing_home',
  'retirement_home',
  'elder_care',
  'senior_citizen_center',
  'hospice',
  'home_health_care_service',
]);

/**
 * Types that say nothing about what a business does.
 *
 * Every senior living community in the market we tested against — five operators,
 * including two national brands — comes back as `primaryType: 'health'` with types
 * `['point_of_interest', 'health', 'service', 'establishment']`. Their Business
 * Profiles certainly do carry a real category; Maps shows it. The API at this access
 * level simply does not publish it. So a listing whose every type is one of these has
 * no *visible* category, which is not the same as a wrong one.
 */
const GENERIC_PLACE_TYPES = new Set([
  'point_of_interest',
  'establishment',
  'health',
  'service',
  'premise',
  'subpremise',
]);

/**
 * True when Google published a category specific enough to judge.
 *
 * The evidence-asymmetry rule from Phase 3 again: a category we can read is evidence,
 * and one we cannot read is not evidence of a bad category.
 */
export function hasPublishedCategory(place: PlacesPlace): boolean {
  const types = place.types ?? [];
  if (!types.length && !place.primaryType) return false;
  const candidates = place.primaryType ? [place.primaryType, ...types] : types;
  return candidates.some((type) => !GENERIC_PLACE_TYPES.has(type));
}

/** True when the listing's primary category is a senior-care category. */
export function hasSeniorCarePrimaryType(place: PlacesPlace): boolean {
  return Boolean(place.primaryType && SENIOR_CARE_GOOGLE_TYPES.has(place.primaryType));
}

/** All senior-care categories on the listing, primary or not. */
export function seniorCareTypes(place: PlacesPlace): string[] {
  return (place.types ?? []).filter((type) => SENIOR_CARE_GOOGLE_TYPES.has(type));
}

/** Care types implied by the listing's own categories and description. */
export function careTypesFromPlace(place: PlacesPlace): CareType[] {
  const careTypes: CareType[] = [];
  const types = new Set(place.types ?? []);
  if (types.has('assisted_living_facility')) careTypes.push('assisted_living');
  if (types.has('nursing_home')) careTypes.push('skilled_nursing');
  if (types.has('retirement_home')) careTypes.push('independent_living');
  if (types.has('home_health_care_service')) careTypes.push('home_care');
  return careTypes;
}
