/**
 * Yelp Fusion client — the second review source for Module D.
 *
 * Yelp's free tier is small (500 calls/day), so an audit spends at most two:
 * one business match and one review excerpt fetch. Both are cached 24h.
 *
 * Yelp is a secondary signal: senior living communities are unevenly represented
 * there, so "no Yelp listing" is reported as information, never as a failure.
 */

import { normalizePhone } from '@sensi/shared';

import { nameTokens, nonGenericTokens } from '../analysis/business-name.js';
import { businessNameSimilarity } from '../analysis/nap.js';

import { env } from '../config/env.js';
import { withCache } from '../lib/cache.js';
import { fetchJson } from '../lib/http.js';
import { logger } from '../lib/logger.js';

const SEARCH_ENDPOINT = 'https://api.yelp.com/v3/businesses/search';
const REVIEWS_ENDPOINT = 'https://api.yelp.com/v3/businesses';

export interface YelpBusiness {
  id: string;
  name: string;
  url?: string;
  rating?: number;
  reviewCount?: number;
  phone?: string;
  street?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  isClosed?: boolean;
  /** Category titles as Yelp shows them, e.g. "Assisted Living Facilities". */
  categories?: string[];
}

export interface YelpReview {
  rating?: number;
  text?: string;
  publishedAt?: string;
}

export interface YelpUnavailable {
  ok: false;
  reason: string;
  missingKey?: boolean;
}

export interface YelpNotFound {
  ok: false;
  notFound: true;
  reason: string;
}

export type YelpMatchOutcome = { ok: true; business: YelpBusiness } | YelpNotFound | YelpUnavailable;
export type YelpReviewsOutcome = { ok: true; reviews: YelpReview[] } | YelpUnavailable;

interface YelpSearchResponse {
  businesses?: Array<{
    id?: string;
    name?: string;
    url?: string;
    rating?: number;
    review_count?: number;
    phone?: string;
    display_phone?: string;
    is_closed?: boolean;
    categories?: Array<{ alias?: string; title?: string }>;
    location?: {
      address1?: string;
      city?: string;
      state?: string;
      zip_code?: string;
    };
  }>;
  error?: { code?: string; description?: string };
}

interface YelpReviewsResponse {
  reviews?: Array<{
    rating?: number;
    text?: string;
    time_created?: string;
  }>;
  error?: { code?: string; description?: string };
}

const MISSING_KEY: YelpUnavailable = {
  ok: false,
  missingKey: true,
  reason:
    'Yelp checks need a Yelp Fusion API key. Add YELP_API_KEY to your environment to include them.',
};

function authHeaders(): Record<string, string> {
  return { Authorization: `Bearer ${env.YELP_API_KEY!}` };
}

/** Maps and picks the best Yelp candidate. Exported for tests. */
export function chooseYelpMatch(
  response: YelpSearchResponse,
  options: { businessName: string; zipCode: string; phone?: string },
): YelpMatchOutcome {
  const businesses = (response.businesses ?? [])
    .filter((business): business is NonNullable<typeof business> & { id: string; name: string } =>
      Boolean(business?.id && business.name),
    )
    .map((business): YelpBusiness => {
      const mapped: YelpBusiness = { id: business.id, name: business.name };
      if (business.url) mapped.url = business.url;
      if (typeof business.rating === 'number') mapped.rating = business.rating;
      if (typeof business.review_count === 'number') mapped.reviewCount = business.review_count;
      const phone = normalizePhone(business.phone ?? business.display_phone);
      if (phone) mapped.phone = phone;
      if (business.location?.address1) mapped.street = business.location.address1;
      if (business.location?.city) mapped.city = business.location.city;
      if (business.location?.state) mapped.state = business.location.state;
      if (business.location?.zip_code) mapped.zipCode = business.location.zip_code.slice(0, 5);
      if (business.is_closed !== undefined) mapped.isClosed = business.is_closed;
      const categories = (business.categories ?? [])
        .map((category) => category.title)
        .filter((title): title is string => Boolean(title));
      if (categories.length) mapped.categories = categories;
      return mapped;
    });

  if (!businesses.length) {
    return { ok: false, notFound: true, reason: 'No Yelp listing was found for your community.' };
  }

  // A matching phone number is decisive; otherwise require a strong name overlap.
  if (options.phone) {
    const byPhone = businesses.find((business) => business.phone === options.phone);
    if (byPhone) return { ok: true, business: byPhone };
  }

  // Overlap alone is not enough: "Exceptional Senior Living" and "Brookdale Senior
  // Living" share two of three words while being different companies. At least one
  // identifying word has to appear in the candidate's name.
  const identifying = nonGenericTokens(options.businessName);

  const scored = businesses
    .map((business) => {
      const candidateTokens = new Set(nameTokens(business.name));
      return {
        business,
        similarity: businessNameSimilarity(options.businessName, business.name),
        identifyingHits: identifying.filter((token) => candidateTokens.has(token)).length,
        zipMatches: business.zipCode === options.zipCode,
      };
    })
    .sort(
      (a, b) =>
        b.identifyingHits - a.identifyingHits ||
        Number(b.zipMatches) - Number(a.zipMatches) ||
        b.similarity - a.similarity,
    );

  const best = scored[0];
  if (best) {
    const strongEnough = identifying.length
      ? best.identifyingHits > 0 && best.similarity >= 0.5
      // Nothing in the name identifies them at all, so only a near-exact name in
      // the right zip code is safe to claim as theirs.
      : best.zipMatches && best.similarity >= 0.75;
    if (strongEnough) return { ok: true, business: best.business };
  }

  return {
    ok: false,
    notFound: true,
    reason: 'We found Yelp listings nearby but none that clearly matched your community.',
  };
}

export interface FindYelpOptions {
  businessName: string;
  zipCode: string;
  city?: string;
  state?: string;
  phone?: string;
  refresh?: boolean;
}

export async function findYelpBusiness(options: FindYelpOptions): Promise<YelpMatchOutcome> {
  if (!env.YELP_API_KEY) return MISSING_KEY;

  const location = [options.city, options.state].filter(Boolean).join(', ') || options.zipCode;
  const query = new URLSearchParams({
    term: options.businessName,
    location,
    limit: '10',
  });

  return withCache<YelpMatchOutcome>(
    'yelp',
    `yelp:search:${options.businessName}|${location}`,
    async () => {
      const outcome = await fetchJson<YelpSearchResponse>(`${SEARCH_ENDPOINT}?${query.toString()}`, {
        label: `yelp:search:${options.businessName}`,
        timeoutMs: 15_000,
        headers: authHeaders(),
      });

      if (!outcome.ok) {
        logger.warn('Yelp search failed', { reason: outcome.reason });
        return { ok: false, reason: `We could not reach Yelp (${outcome.reason})` };
      }
      if (outcome.value.error) {
        return {
          ok: false,
          reason: `Yelp refused the request (${outcome.value.error.description ?? 'unknown error'})`,
        };
      }

      return chooseYelpMatch(outcome.value, {
        businessName: options.businessName,
        zipCode: options.zipCode,
        ...(options.phone ? { phone: options.phone } : {}),
      });
    },
    { ...(options.refresh === undefined ? {} : { refresh: options.refresh }) },
  );
}

/**
 * What we tell an operator when Yelp will not share review text. Yelp answers the
 * reviews endpoint with `404 NOT_FOUND` for every business — even ones it happily
 * describes through search — when the key's access level excludes review excerpts.
 * The listing's star rating and review count still come through search.
 */
export const YELP_REVIEW_TEXT_UNAVAILABLE =
  'Yelp does not share the text of reviews at our level of access, so its star rating and ' +
  'review count are included but its wording is not.';

/**
 * Up to three review excerpts, when the key's access level allows them.
 * Star rating and review count come from the search match either way.
 */
export async function fetchYelpReviews(
  businessId: string,
  options: { refresh?: boolean } = {},
): Promise<YelpReviewsOutcome> {
  if (!env.YELP_API_KEY) return MISSING_KEY;

  return withCache<YelpReviewsOutcome>(
    'yelp',
    `yelp:reviews:${businessId}`,
    async () => {
      const outcome = await fetchJson<YelpReviewsResponse>(
        `${REVIEWS_ENDPOINT}/${encodeURIComponent(businessId)}/reviews?limit=3&sort_by=yelp_sort`,
        { label: `yelp:reviews:${businessId}`, timeoutMs: 15_000, headers: authHeaders() },
      );

      if (!outcome.ok) {
        if (outcome.status === 404) return { ok: false, reason: YELP_REVIEW_TEXT_UNAVAILABLE };
        return { ok: false, reason: `We could not read your Yelp reviews (${outcome.reason})` };
      }
      if (outcome.value.error) {
        return {
          ok: false,
          reason: `Yelp refused to share reviews (${outcome.value.error.description ?? 'unknown error'})`,
        };
      }

      const reviews: YelpReview[] = (outcome.value.reviews ?? []).map((review) => ({
        ...(typeof review.rating === 'number' ? { rating: review.rating } : {}),
        ...(review.text ? { text: review.text } : {}),
        ...(review.time_created ? { publishedAt: review.time_created } : {}),
      }));

      return { ok: true, reviews };
    },
    { ...(options.refresh === undefined ? {} : { refresh: options.refresh }) },
  );
}
