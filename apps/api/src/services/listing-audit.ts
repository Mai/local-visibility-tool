/**
 * Runs the listing half of an audit: the Google Business Profile (Module A), the
 * review picture (Module D) and the review theme panel.
 *
 * Kept separate from the website half so each can fail on its own — a missing
 * Google key must not stop the on-page checks, and an unreachable website must not
 * stop the listing checks. Phase 6's orchestrator runs both and merges the result.
 */

import type { CareType, ModuleResult, Nap, ReviewSnapshot, ReviewThemes } from '@sensi/shared';

import type { NapAlternates } from '../analysis/nap.js';
import { analyzeReviews, type ReviewText } from '../analysis/review-themes.js';
import {
  careTypesFromPlace,
  fetchPlaceDetails,
  findPlace,
  placesAddress,
  placesPhone,
  type FindPlaceOutcome,
  type PlacesPlace,
} from '../collectors/places.js';
import { fetchYelpReviews, findYelpBusiness } from '../collectors/yelp.js';
import { logger } from '../lib/logger.js';
import { napFromPlace, scoreGbp } from '../modules/gbp.js';
import { scoreReviews } from '../modules/reviews.js';

export interface ListingAuditOptions {
  businessName: string;
  websiteUrl: string;
  zipCode: string;
  city?: string;
  state?: string;
  /** NAP as published on the operator's own website, for the match check. */
  websiteNap: Nap;
  /** Other names, addresses and numbers the website publishes. */
  napAlternates?: NapAlternates;
  careTypes: CareType[];
  refresh?: boolean;
  /** Evaluation time, injectable so the recency check is testable. */
  now?: Date;
}

export interface ListingAuditResult {
  gbp: ModuleResult;
  reviews: ModuleResult;
  reviewSnapshots: ReviewSnapshot[];
  reviewThemes?: ReviewThemes;
  /** The matched listing, for the competitor comparison and the report header. */
  place?: PlacesPlace;
  googlePlaceId?: string;
  matchedOn?: 'website' | 'name_and_zip' | 'name';
  /** Care types the Google listing itself implies. */
  careTypesFromListing: CareType[];
  /** Authoritative city/state from the listing, when we matched one. */
  listingCity?: string;
  listingState?: string;
  warnings: string[];
}

/** Newest publish time among the reviews a source shared with us. */
function newestReviewAt(dates: Array<string | undefined>): string | undefined {
  const parsed = dates
    .filter((date): date is string => typeof date === 'string')
    .map((date) => ({ date, timestamp: Date.parse(date) }))
    .filter((entry) => !Number.isNaN(entry.timestamp))
    .sort((a, b) => b.timestamp - a.timestamp);
  return parsed[0]?.date;
}

/** Reviews left within the last 90 days, counted from the shared sample only. */
function countRecent(dates: Array<string | undefined>, now: Date): number {
  const cutoff = now.getTime() - 90 * 24 * 60 * 60 * 1000;
  return dates.filter((date) => {
    if (!date) return false;
    const timestamp = Date.parse(date);
    return !Number.isNaN(timestamp) && timestamp >= cutoff;
  }).length;
}

function googleSnapshot(place: PlacesPlace | undefined, lookup: FindPlaceOutcome, now: Date): ReviewSnapshot {
  if (!place) {
    const reason = lookup.ok
      ? 'Your Google listing details could not be read this time.'
      : 'notFound' in lookup
        ? 'We could not find your Google listing, so there were no Google reviews to read.'
        : lookup.reason;
    return { source: 'google', unavailableReason: reason };
  }

  const dates = (place.reviews ?? []).map((review) => review.publishTime);
  const snapshot: ReviewSnapshot = { source: 'google' };
  if (typeof place.rating === 'number') snapshot.rating = place.rating;
  if (typeof place.userRatingCount === 'number') snapshot.reviewCount = place.userRatingCount;
  const newest = newestReviewAt(dates);
  if (newest) snapshot.mostRecentReviewAt = newest;
  if (dates.some(Boolean)) snapshot.reviewsInLast90Days = countRecent(dates, now);
  return snapshot;
}

export async function runListingAudit(options: ListingAuditOptions): Promise<ListingAuditResult> {
  const now = options.now ?? new Date();
  const warnings: string[] = [];
  const refresh = options.refresh;

  const lookup = await findPlace({
    businessName: options.businessName,
    websiteUrl: options.websiteUrl,
    zipCode: options.zipCode,
    ...(options.city ? { city: options.city } : {}),
    ...(options.state ? { state: options.state } : {}),
    ...(refresh === undefined ? {} : { refresh }),
  });

  let place: PlacesPlace | undefined;

  if (lookup.ok) {
    if (lookup.matchedOn === 'name') {
      warnings.push(
        'We matched a Google listing by name only — its website and zip code did not match yours, so double-check the listing we found is really yours.',
      );
    }
    const details = await fetchPlaceDetails(lookup.place.id!, {
      ...(refresh === undefined ? {} : { refresh }),
    });
    if (details.ok) {
      place = details.place;
    } else {
      warnings.push(`Some Google listing checks were skipped: ${details.reason}`);
      // The search result still carries rating, categories and the website link.
      place = lookup.place;
    }
  } else if ('notFound' in lookup) {
    warnings.push(
      'We could not find a Google Business Profile for your community. If you have one, make sure its name, address and website match your site.',
    );
  } else {
    warnings.push(`Google listing checks were skipped: ${lookup.reason}`);
  }

  const listingAddress = place ? placesAddress(place) : undefined;
  const listingPhone = place ? placesPhone(place) : undefined;

  // Yelp is matched on the listing's phone when we have one — far more reliable
  // than a name search alone.
  const yelpMatch = await findYelpBusiness({
    businessName: options.businessName,
    zipCode: options.zipCode,
    ...(listingAddress?.city ?? options.city ? { city: listingAddress?.city ?? options.city! } : {}),
    ...(listingAddress?.state ?? options.state ? { state: listingAddress?.state ?? options.state! } : {}),
    ...(listingPhone ? { phone: listingPhone } : {}),
    ...(refresh === undefined ? {} : { refresh }),
  });

  let yelpSnapshot: ReviewSnapshot = { source: 'yelp' };
  const yelpReviewTexts: ReviewText[] = [];

  if (yelpMatch.ok) {
    yelpSnapshot = { source: 'yelp' };
    if (typeof yelpMatch.business.rating === 'number') yelpSnapshot.rating = yelpMatch.business.rating;
    if (typeof yelpMatch.business.reviewCount === 'number') {
      yelpSnapshot.reviewCount = yelpMatch.business.reviewCount;
    }

    const reviews = await fetchYelpReviews(yelpMatch.business.id, {
      ...(refresh === undefined ? {} : { refresh }),
    });
    if (reviews.ok) {
      const newest = newestReviewAt(reviews.reviews.map((review) => review.publishedAt));
      if (newest) yelpSnapshot.mostRecentReviewAt = newest;
      for (const review of reviews.reviews) {
        yelpReviewTexts.push({
          source: 'yelp',
          ...(review.rating === undefined ? {} : { rating: review.rating }),
          ...(review.text ? { text: review.text } : {}),
          ...(review.publishedAt ? { publishedAt: review.publishedAt } : {}),
        });
      }
    }
  } else if ('notFound' in yelpMatch) {
    // Not an error: plenty of communities simply are not on Yelp.
    yelpSnapshot = { source: 'yelp' };
  } else {
    yelpSnapshot = { source: 'yelp', unavailableReason: yelpMatch.reason };
    if (!yelpMatch.missingKey) warnings.push(`Yelp checks were skipped: ${yelpMatch.reason}`);
  }

  const reviewSnapshots: ReviewSnapshot[] = [googleSnapshot(place, lookup, now), yelpSnapshot];

  const googleReviewTexts: ReviewText[] = (place?.reviews ?? []).map((review) => ({
    source: 'google' as const,
    ...(review.rating === undefined ? {} : { rating: review.rating }),
    ...(review.originalText?.text ?? review.text?.text
      ? { text: review.originalText?.text ?? review.text!.text! }
      : {}),
    ...(review.publishTime ? { publishedAt: review.publishTime } : {}),
  }));

  const allReviewTexts = [...googleReviewTexts, ...yelpReviewTexts];
  const reviewThemes = allReviewTexts.length
    ? analyzeReviews(allReviewTexts, { businessName: options.businessName })
    : undefined;

  // Themes need review wording. Ratings and counts are easy to get; the words are
  // not — Google shares a handful, Yelp shares none at our level of access. Say so
  // rather than showing an empty panel.
  if (!reviewThemes && (place || yelpMatch.ok)) {
    warnings.push(
      'We found your listings but could not read the wording of any reviews, so the review themes ' +
        'and keywords are not included. Google shares only a few review texts with outside tools, ' +
        'and Yelp shares none.',
    );
  }

  const gbp = scoreGbp({
    lookup,
    ...(place ? { place } : {}),
    websiteNap: options.websiteNap,
    ...(options.napAlternates ? { napAlternates: options.napAlternates } : {}),
    websiteUrl: options.websiteUrl,
    careTypes: options.careTypes,
    ...(listingAddress?.city ?? options.city ? { city: listingAddress?.city ?? options.city! } : {}),
  });

  const reviews = scoreReviews({ snapshots: reviewSnapshots, now });

  logger.info('Listing audit complete', {
    businessName: options.businessName,
    matched: lookup.ok,
    gbpPoints: gbp.points,
    reviewPoints: reviews.points,
    reviewTexts: allReviewTexts.length,
  });

  return {
    gbp,
    reviews,
    reviewSnapshots,
    ...(reviewThemes ? { reviewThemes } : {}),
    ...(place ? { place } : {}),
    ...(place?.id ? { googlePlaceId: place.id } : {}),
    ...(lookup.ok ? { matchedOn: lookup.matchedOn } : {}),
    careTypesFromListing: place ? careTypesFromPlace(place) : [],
    ...(listingAddress?.city ? { listingCity: listingAddress.city } : {}),
    ...(listingAddress?.state ? { listingState: listingAddress.state } : {}),
    warnings,
  };
}

/** Re-exported so the route can build a website NAP without importing the module. */
export { napFromPlace };
