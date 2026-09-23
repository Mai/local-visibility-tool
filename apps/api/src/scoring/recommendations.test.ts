import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { CheckResult, ModuleId, ModuleResult } from '@sensi/shared';

import { assembleModule, check } from './assemble.js';
import { buildRecommendations, checkIdsWithoutRecommendations } from './recommendations.js';

/**
 * Every check the five modules produce. Written out rather than derived, so adding a
 * check without writing the advice that goes with it fails this test.
 */
const ALL_CHECK_IDS = [
  'gbp.listing_found',
  'gbp.nap_match',
  'gbp.categories',
  'gbp.hours',
  'gbp.photos',
  'gbp.description',
  'gbp.website_link',
  'gbp.questions_answers',
  'gbp.posts',
  'citations.tier1_listings',
  'citations.tier2_listings',
  'citations.nap_consistency',
  'citations.care_types',
  'citations.no_duplicates',
  'onpage.title_city',
  'onpage.meta_description',
  'onpage.headings_care_type',
  'onpage.body_locality',
  'onpage.nap_in_text',
  'onpage.local_schema',
  'onpage.embedded_map',
  'onpage.service_area_pages',
  'onpage.mobile_friendly',
  'onpage.page_speed',
  'reviews.google_rating',
  'reviews.google_volume',
  'reviews.recency',
  'reviews.owner_responses',
  'reviews.yelp_presence',
  'geo.search_presence',
  'geo.ai_answer',
  'geo.answers_questions',
  'geo.plain_description',
  'geo.care_type_detail',
  'geo.third_party_mentions',
];

function module(
  moduleId: ModuleId,
  spec: Array<{ id: string; status: CheckResult['status']; points: number; maxPoints: number }>,
): ModuleResult {
  return assembleModule(
    moduleId,
    spec.map((entry) =>
      check({
        id: entry.id,
        moduleId,
        label: entry.id,
        status: entry.status,
        points: entry.points,
        maxPoints: entry.maxPoints,
        detail: 'detail',
        whyItMatters: 'It matters.',
        ...(entry.status === 'unavailable' ? { unavailableReason: 'Google does not share it.' } : {}),
      }),
    ),
  );
}

test('every check the modules can produce has advice behind it', () => {
  assert.deepEqual(checkIdsWithoutRecommendations(ALL_CHECK_IDS), []);
});

test('there are 35 checks, matching the five modules as built', () => {
  assert.equal(ALL_CHECK_IDS.length, 35);
  assert.equal(new Set(ALL_CHECK_IDS).size, 35);
});

test('a passing check produces no recommendation', () => {
  const recommendations = buildRecommendations([
    module('gbp', [{ id: 'gbp.hours', status: 'pass', points: 2, maxPoints: 2 }]),
  ]);
  assert.deepEqual(recommendations, []);
});

test('a failed check becomes a recommendation worth the points it lost', () => {
  const recommendations = buildRecommendations([
    module('gbp', [
      { id: 'gbp.hours', status: 'fail', points: 0, maxPoints: 2 },
      { id: 'gbp.photos', status: 'pass', points: 23, maxPoints: 23 },
    ]),
  ]);

  assert.equal(recommendations.length, 1);
  const [recommendation] = recommendations;
  assert.equal(recommendation!.relatedCheckIds[0], 'gbp.hours');
  assert.equal(recommendation!.estimatedPointGain, 2);
  assert.equal(recommendation!.group, 'quick_wins');
  assert.ok(recommendation!.steps.length >= 2);
});

test('a fix is worth more when other checks in its module could not be verified', () => {
  // Half of Module A unverifiable means the checks that remain carry the whole 25
  // points between them, so the advice has to say so (PRD 5.4).
  const recommendations = buildRecommendations([
    module('gbp', [
      { id: 'gbp.hours', status: 'fail', points: 0, maxPoints: 2 },
      { id: 'gbp.photos', status: 'pass', points: 3, maxPoints: 3 },
      { id: 'gbp.posts', status: 'unavailable', points: 0, maxPoints: 20 },
    ]),
  ]);

  const hours = recommendations.find((item) => item.relatedCheckIds[0] === 'gbp.hours');
  assert.equal(hours!.estimatedPointGain, 10);
  assert.equal(hours!.impact, 'high');
});

test('advice about something Google hides is ongoing and claims no points', () => {
  const recommendations = buildRecommendations([
    module('gbp', [
      { id: 'gbp.questions_answers', status: 'unavailable', points: 0, maxPoints: 2 },
      { id: 'gbp.hours', status: 'pass', points: 23, maxPoints: 23 },
    ]),
  ]);

  assert.equal(recommendations.length, 1);
  assert.equal(recommendations[0]!.group, 'ongoing');
  assert.equal(recommendations[0]!.estimatedPointGain, 0);
});

test('the category advice survives Google not publishing the category', () => {
  const recommendations = buildRecommendations([
    module('gbp', [
      { id: 'gbp.categories', status: 'unavailable', points: 0, maxPoints: 3 },
      { id: 'gbp.hours', status: 'pass', points: 22, maxPoints: 22 },
    ]),
  ]);

  const categories = recommendations.find((item) => item.relatedCheckIds[0] === 'gbp.categories')!;
  assert.equal(categories.group, 'ongoing');
  assert.equal(categories.estimatedPointGain, 0);
  assert.match(categories.title, /main category/);
});

test('work that is never finished is ongoing, not a quick win', () => {
  const recommendations = buildRecommendations([
    module('reviews', [
      { id: 'reviews.google_volume', status: 'fail', points: 0, maxPoints: 15 },
    ]),
  ]);

  assert.equal(recommendations[0]!.group, 'ongoing');
});

test('the senior-care lead-gen directories are nice-to-have, whatever they are worth', () => {
  // Missing every tier-1 directory recovers the full 8 points — enough to sort as a
  // "strategic" item by points alone. It stays nice-to-have anyway: most of these
  // directories sell the leads they send, so being listed is optional, not a priority
  // to rank against the free mainstream platforms in citations.tier2_listings.
  const recommendations = buildRecommendations([
    module('citations', [
      { id: 'citations.tier1_listings', status: 'fail', points: 0, maxPoints: 8 },
      { id: 'citations.tier2_listings', status: 'pass', points: 3, maxPoints: 3 },
    ]),
  ]);

  const tier1 = recommendations.find((item) => item.relatedCheckIds[0] === 'citations.tier1_listings')!;
  assert.equal(tier1.impact, 'high');
  assert.equal(tier1.group, 'nice_to_have');
});

test('the list reads quick wins first, biggest gain first within each group', () => {
  const recommendations = buildRecommendations([
    module('onpage', [
      { id: 'onpage.local_schema', status: 'fail', points: 0, maxPoints: 10 },
      { id: 'onpage.title_city', status: 'fail', points: 0, maxPoints: 5 },
      { id: 'onpage.embedded_map', status: 'fail', points: 0, maxPoints: 2 },
      { id: 'onpage.body_locality', status: 'pass', points: 8, maxPoints: 8 },
    ]),
  ]);

  assert.deepEqual(
    recommendations.map((item) => [item.group, item.relatedCheckIds[0]]),
    [
      ['quick_wins', 'onpage.title_city'],
      ['quick_wins', 'onpage.embedded_map'],
      ['strategic', 'onpage.local_schema'],
    ],
  );
});

test('a warning that lost almost nothing does not earn a place on the list', () => {
  const recommendations = buildRecommendations([
    module('gbp', [
      { id: 'gbp.hours', status: 'warn', points: 24.9, maxPoints: 25 },
    ]),
  ]);
  assert.deepEqual(recommendations, []);
});

test('every recommendation is something an operator could act on unaided', () => {
  const recommendations = buildRecommendations([
    module(
      'onpage',
      [
        'onpage.title_city',
        'onpage.meta_description',
        'onpage.local_schema',
        'onpage.page_speed',
      ].map((id) => ({ id, status: 'fail' as const, points: 0, maxPoints: 6.25 })),
    ),
  ]);

  assert.equal(recommendations.length, 4);
  for (const recommendation of recommendations) {
    assert.ok(recommendation.title.length > 10, recommendation.id);
    assert.ok(recommendation.whyItMatters.length > 10, recommendation.id);
    assert.ok(recommendation.steps.length >= 2, recommendation.id);
    assert.ok(
      recommendation.steps.every((step) => step.length > 20),
      `${recommendation.id} has a step too short to follow`,
    );
  }
});
