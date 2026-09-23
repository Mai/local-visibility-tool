/**
 * Module D — Reviews and Reputation (15 points, PRD 4.2).
 *
 * Google is the primary source and Yelp the secondary one. Two honest limits shape
 * the checks: Google shares only a sample of reviews with outside tools, and it
 * shares no owner replies at all. Where that limits us we say so in the finding
 * rather than inventing a number (PRD 5.4).
 */

import type { CheckResult, ModuleResult, ReviewSnapshot } from '@sensi/shared';

import { assembleModule, check } from '../scoring/assemble.js';

const MODULE = 'reviews' as const;

/** Rating families read as "good" for a senior living community. */
const STRONG_RATING = 4.5;
const ACCEPTABLE_RATING = 4;

/** Review counts that make a rating look credible. */
const STRONG_REVIEW_COUNT = 25;
const MINIMUM_REVIEW_COUNT = 10;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface ReviewsInput {
  snapshots: ReviewSnapshot[];
  /** Evaluation time, passed in so recency is deterministic in tests. */
  now: Date;
}

function snapshotFor(snapshots: ReviewSnapshot[], source: ReviewSnapshot['source']): ReviewSnapshot | undefined {
  return snapshots.find((snapshot) => snapshot.source === source);
}

function daysSince(iso: string | undefined, now: Date): number | undefined {
  if (!iso) return undefined;
  const timestamp = Date.parse(iso);
  if (Number.isNaN(timestamp)) return undefined;
  return Math.floor((now.getTime() - timestamp) / DAY_MS);
}

function describeAge(days: number): string {
  if (days < 45) return `${days} days ago`;
  const months = Math.round(days / 30);
  if (months < 18) return `about ${months} months ago`;
  return `about ${Math.round(days / 365)} years ago`;
}

/* -------------------------------------------------------------------------- */
/* Individual checks                                                          */
/* -------------------------------------------------------------------------- */

function checkRating(google: ReviewSnapshot | undefined): CheckResult {
  const base = {
    id: 'reviews.google_rating',
    moduleId: MODULE,
    label: 'Your Google star rating',
    maxPoints: 4,
    whyItMatters:
      'The star rating next to your name is the first thing families see, and most will not call a community rated below 4 stars.',
  } as const;

  if (!google || google.rating === undefined) {
    return check({
      ...base,
      status: 'unavailable',
      points: 0,
      detail: 'We could not read your Google star rating.',
      unavailableReason: google?.unavailableReason ?? 'Your Google listing could not be read this time.',
    });
  }

  const rating = google.rating;
  if (rating >= STRONG_RATING) {
    return check({
      ...base,
      status: 'pass',
      points: 4,
      detail: `Your Google rating is ${rating.toFixed(1)} stars — strong.`,
      evidence: { rating },
    });
  }
  if (rating >= ACCEPTABLE_RATING) {
    return check({
      ...base,
      status: 'warn',
      points: 2.5,
      detail: `Your Google rating is ${rating.toFixed(1)} stars. Getting it above ${STRONG_RATING} makes a visible difference to enquiries.`,
      evidence: { rating },
    });
  }

  return check({
    ...base,
    status: 'fail',
    points: 0,
    detail: `Your Google rating is ${rating.toFixed(1)} stars, which is below what most families will consider. Asking recent, happy families to review you is the fastest way to move it.`,
    evidence: { rating },
  });
}

function checkVolume(google: ReviewSnapshot | undefined): CheckResult {
  const base = {
    id: 'reviews.google_volume',
    moduleId: MODULE,
    label: 'You have enough Google reviews to look established',
    maxPoints: 3,
    whyItMatters:
      'A 5-star rating from three people convinces nobody. Review count is also one of the signals Google uses to order local results.',
  } as const;

  if (!google || google.reviewCount === undefined) {
    return check({
      ...base,
      status: 'unavailable',
      points: 0,
      detail: 'We could not count your Google reviews.',
      unavailableReason: google?.unavailableReason ?? 'Your Google listing could not be read this time.',
    });
  }

  const count = google.reviewCount;
  if (count >= STRONG_REVIEW_COUNT) {
    return check({
      ...base,
      status: 'pass',
      points: 3,
      detail: `You have ${count} Google reviews.`,
      evidence: { reviewCount: count },
    });
  }
  if (count >= MINIMUM_REVIEW_COUNT) {
    return check({
      ...base,
      status: 'warn',
      points: 1.5,
      detail: `You have ${count} Google reviews. Getting to ${STRONG_REVIEW_COUNT} would make your rating far more convincing.`,
      evidence: { reviewCount: count },
    });
  }

  return check({
    ...base,
    status: 'fail',
    points: 0,
    detail: `You have only ${count} Google review${count === 1 ? '' : 's'}. Ask the families of recent move-ins — most will say yes if you ask.`,
    evidence: { reviewCount: count },
  });
}

/**
 * Recency, scored from the sample of reviews Google shares.
 *
 * A recent review in the sample proves the flow is healthy. A stale sample is only
 * weak evidence, so it earns a warning with the sample size spelled out — never a
 * confident "you have no recent reviews".
 */
function checkRecency(snapshots: ReviewSnapshot[], now: Date): CheckResult {
  const base = {
    id: 'reviews.recency',
    moduleId: MODULE,
    label: 'Families are still leaving you reviews',
    maxPoints: 3,
    whyItMatters:
      'Reviews age. A steady trickle of new ones tells families your community is well run today, and tells Google your listing is active.',
  } as const;

  const dates = snapshots
    .map((snapshot) => ({ source: snapshot.source, days: daysSince(snapshot.mostRecentReviewAt, now) }))
    .filter((entry): entry is { source: ReviewSnapshot['source']; days: number } => entry.days !== undefined);

  if (!dates.length) {
    return check({
      ...base,
      status: 'unavailable',
      points: 0,
      detail: 'We could not tell when your most recent review was left.',
      unavailableReason:
        'Neither Google nor Yelp shared review dates with us this time, so we could not check how fresh your reviews are.',
    });
  }

  const newest = dates.reduce((best, entry) => (entry.days < best.days ? entry : best));

  if (newest.days <= 90) {
    return check({
      ...base,
      status: 'pass',
      points: 3,
      detail: `Your most recent review was left ${describeAge(newest.days)}.`,
      evidence: { daysSinceNewestReview: newest.days, source: newest.source },
    });
  }
  if (newest.days <= 365) {
    return check({
      ...base,
      status: 'warn',
      points: 1.5,
      detail: `The newest review we could see was ${describeAge(newest.days)}. Google only shows outside tools a handful of reviews, so you may have newer ones — but if not, start asking.`,
      evidence: { daysSinceNewestReview: newest.days, source: newest.source },
    });
  }

  return check({
    ...base,
    status: 'fail',
    points: 0,
    detail: `The newest review we could see was ${describeAge(newest.days)}. A review page that looks abandoned worries families.`,
    evidence: { daysSinceNewestReview: newest.days, source: newest.source },
  });
}

function checkOwnerResponses(google: ReviewSnapshot | undefined): CheckResult {
  const base = {
    id: 'reviews.owner_responses',
    moduleId: MODULE,
    label: 'You reply to the reviews you receive',
    maxPoints: 3,
    whyItMatters:
      'A calm, human reply — especially to a critical review — is often more persuasive to the next family than the review itself.',
  } as const;

  const rate = google?.ownerResponseRate;
  if (rate === undefined) {
    return check({
      ...base,
      status: 'unavailable',
      points: 0,
      detail: 'Open your Google listing and check how many reviews have a reply from you.',
      unavailableReason:
        'Google does not share owner replies with outside tools, so we could not measure this. Aim to reply to every review, and to critical ones within a day.',
    });
  }

  const percent = Math.round(rate * 100);
  if (rate >= 0.8) {
    return check({
      ...base,
      status: 'pass',
      points: 3,
      detail: `You have replied to ${percent}% of your reviews.`,
      evidence: { ownerResponseRate: rate },
    });
  }
  if (rate >= 0.4) {
    return check({
      ...base,
      status: 'warn',
      points: 1.5,
      detail: `You have replied to ${percent}% of your reviews. Replying to all of them, good and bad, is the goal.`,
      evidence: { ownerResponseRate: rate },
    });
  }

  return check({
    ...base,
    status: 'fail',
    points: 0,
    detail: `You have replied to ${percent}% of your reviews. Start with the critical ones.`,
    evidence: { ownerResponseRate: rate },
  });
}

function checkYelp(yelp: ReviewSnapshot | undefined): CheckResult {
  const base = {
    id: 'reviews.yelp_presence',
    moduleId: MODULE,
    label: 'You have a Yelp listing with reviews',
    maxPoints: 2,
    whyItMatters:
      'Yelp matters less than Google for senior care, but it still shows up in search results and some families check it before calling.',
  } as const;

  if (!yelp) {
    return check({
      ...base,
      status: 'unavailable',
      points: 0,
      detail: 'We could not check Yelp this time.',
      unavailableReason: 'Yelp could not be checked during this audit.',
    });
  }
  if (yelp.unavailableReason && yelp.rating === undefined && yelp.reviewCount === undefined) {
    return check({
      ...base,
      status: 'unavailable',
      points: 0,
      detail: 'We could not check Yelp this time.',
      unavailableReason: yelp.unavailableReason,
    });
  }

  const rating = yelp.rating;
  const count = yelp.reviewCount ?? 0;

  if (rating === undefined) {
    return check({
      ...base,
      status: 'fail',
      points: 0,
      detail:
        'We did not find a Yelp listing for your community. Claiming one is free and takes a few minutes.',
    });
  }
  if (rating >= ACCEPTABLE_RATING && count >= 3) {
    return check({
      ...base,
      status: 'pass',
      points: 2,
      detail: `Your Yelp listing shows ${rating.toFixed(1)} stars from ${count} review${count === 1 ? '' : 's'}.`,
      evidence: { rating, reviewCount: count },
    });
  }

  return check({
    ...base,
    status: 'warn',
    points: 1,
    detail: `Your Yelp listing shows ${rating.toFixed(1)} stars from ${count} review${count === 1 ? '' : 's'} — thin enough that it is not helping you yet.`,
    evidence: { rating, reviewCount: count },
  });
}

/* -------------------------------------------------------------------------- */

export function scoreReviews(input: ReviewsInput): ModuleResult {
  const google = snapshotFor(input.snapshots, 'google');
  const yelp = snapshotFor(input.snapshots, 'yelp');

  const checks: CheckResult[] = [
    checkRating(google),
    checkVolume(google),
    checkRecency(input.snapshots, input.now),
    checkOwnerResponses(google),
    checkYelp(yelp),
  ];

  return assembleModule(MODULE, checks);
}

/** Total points the module's checks can award — must equal the PRD weight of 15. */
export const REVIEWS_MAX_CHECK_POINTS = 15;
