import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { ReviewSnapshot } from '@sensi/shared';

import { REVIEWS_MAX_CHECK_POINTS, scoreReviews } from './reviews.js';

const NOW = new Date('2026-08-18T12:00:00Z');

function daysAgo(days: number): string {
  return new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}

const STRONG: ReviewSnapshot[] = [
  {
    source: 'google',
    rating: 4.7,
    reviewCount: 64,
    mostRecentReviewAt: daysAgo(12),
    ownerResponseRate: 0.9,
  },
  { source: 'yelp', rating: 4.5, reviewCount: 11, mostRecentReviewAt: daysAgo(40) },
];

test('module check points sum to the PRD weight of 15', () => {
  const module = scoreReviews({ snapshots: STRONG, now: NOW });
  const total = module.checks.reduce((sum, check) => sum + check.maxPoints, 0);
  assert.equal(total, REVIEWS_MAX_CHECK_POINTS);
  assert.equal(total, 15);
});

test('a strong reputation scores full marks', () => {
  const module = scoreReviews({ snapshots: STRONG, now: NOW });

  assert.ok(
    module.checks.every((check) => check.status === 'pass'),
    module.checks.filter((check) => check.status !== 'pass').map((check) => check.id).join(', '),
  );
  assert.equal(module.points, 15);
  assert.equal(module.indicator, 'green');
});

test('owner replies are unavailable when Google does not share them, and leave the denominator', () => {
  const snapshots: ReviewSnapshot[] = [
    { source: 'google', rating: 4.7, reviewCount: 64, mostRecentReviewAt: daysAgo(12) },
    { source: 'yelp', rating: 4.5, reviewCount: 11 },
  ];
  const module = scoreReviews({ snapshots, now: NOW });

  const responses = module.checks.find((check) => check.id === 'reviews.owner_responses')!;
  assert.equal(responses.status, 'unavailable');
  assert.equal(responses.points, 0);
  // 12 of 12 available points earned, rescaled onto the module's weight of 15.
  assert.equal(module.percent, 100);
  assert.equal(module.points, 15);
});

test('a weak rating and thin review count are failures with plain-language advice', () => {
  const module = scoreReviews({
    snapshots: [
      { source: 'google', rating: 3.2, reviewCount: 4, mostRecentReviewAt: daysAgo(20) },
      { source: 'yelp' },
    ],
    now: NOW,
  });

  const rating = module.checks.find((check) => check.id === 'reviews.google_rating')!;
  const volume = module.checks.find((check) => check.id === 'reviews.google_volume')!;
  assert.equal(rating.status, 'fail');
  assert.match(rating.detail, /3\.2 stars/);
  assert.equal(volume.status, 'fail');
  assert.match(volume.detail, /only 4 Google reviews/);
});

test('recency is a warning when the sample is stale and a failure only when it is very old', () => {
  const stale = scoreReviews({
    snapshots: [{ source: 'google', rating: 4.6, reviewCount: 30, mostRecentReviewAt: daysAgo(200) }],
    now: NOW,
  });
  const abandoned = scoreReviews({
    snapshots: [{ source: 'google', rating: 4.6, reviewCount: 30, mostRecentReviewAt: daysAgo(900) }],
    now: NOW,
  });

  const staleCheck = stale.checks.find((check) => check.id === 'reviews.recency')!;
  assert.equal(staleCheck.status, 'warn');
  // The wording must admit that Google only shares a sample.
  assert.match(staleCheck.detail, /handful of reviews/);

  assert.equal(abandoned.checks.find((check) => check.id === 'reviews.recency')!.status, 'fail');
});

test('the newest review across sources wins the recency check', () => {
  const module = scoreReviews({
    snapshots: [
      { source: 'google', rating: 4.6, reviewCount: 30, mostRecentReviewAt: daysAgo(300) },
      { source: 'yelp', rating: 4, reviewCount: 5, mostRecentReviewAt: daysAgo(10) },
    ],
    now: NOW,
  });

  const recency = module.checks.find((check) => check.id === 'reviews.recency')!;
  assert.equal(recency.status, 'pass');
  assert.equal(recency.evidence?.['source'], 'yelp');
});

test('no Yelp listing is a failure with a claim-it prompt, not an unavailable', () => {
  const module = scoreReviews({
    snapshots: [
      { source: 'google', rating: 4.6, reviewCount: 30, mostRecentReviewAt: daysAgo(10) },
      { source: 'yelp' },
    ],
    now: NOW,
  });

  const yelp = module.checks.find((check) => check.id === 'reviews.yelp_presence')!;
  assert.equal(yelp.status, 'fail');
  assert.match(yelp.detail, /Claiming one is free/);
});

test('a missing Yelp key leaves the Yelp check unverifiable instead of failing it', () => {
  const module = scoreReviews({
    snapshots: [
      { source: 'google', rating: 4.6, reviewCount: 30, mostRecentReviewAt: daysAgo(10) },
      { source: 'yelp', unavailableReason: 'Yelp checks need a Yelp Fusion API key.' },
    ],
    now: NOW,
  });

  const yelp = module.checks.find((check) => check.id === 'reviews.yelp_presence')!;
  assert.equal(yelp.status, 'unavailable');
  assert.match(yelp.unavailableReason ?? '', /Yelp Fusion API key/);
});

test('with no review data at all the module reports itself unscored', () => {
  const module = scoreReviews({ snapshots: [{ source: 'google', unavailableReason: 'no listing' }], now: NOW });

  assert.ok(module.checks.every((check) => check.status === 'unavailable'));
  assert.equal(module.points, 0);
  assert.ok(module.unavailableReason);
});
