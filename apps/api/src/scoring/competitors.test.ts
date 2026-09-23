import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { CompetitorSearchResult } from '../collectors/competitors.js';
import type { PlacesPlace } from '../collectors/places.js';

import { COMPARED_MODULES, buildComparison, scorePlace, toCompetitor } from './competitors.js';

const NOW = new Date('2026-08-18T12:00:00Z');

function place(overrides: Partial<PlacesPlace> & { id: string; name: string }): PlacesPlace {
  const { id, name, ...rest } = overrides;
  return {
    id,
    displayName: { text: name },
    businessStatus: 'OPERATIONAL',
    formattedAddress: '100 Main St, Brentwood, TN 37027, USA',
    addressComponents: [
      { longText: '100', types: ['street_number'] },
      { longText: 'Main St', types: ['route'] },
      { longText: 'Brentwood', types: ['locality'] },
      { longText: 'Tennessee', shortText: 'TN', types: ['administrative_area_level_1'] },
      { longText: '37027', types: ['postal_code'] },
    ],
    ...rest,
  };
}

/** A well-tended listing: senior care category, full hours, photos, website, reviews. */
function strongPlace(id: string, name: string, rating = 4.8, reviewCount = 60): PlacesPlace {
  return place({
    id,
    name,
    primaryType: 'assisted_living_facility',
    types: ['assisted_living_facility'],
    websiteUri: `https://${id}.example.com`,
    regularOpeningHours: { weekdayDescriptions: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] },
    photos: Array.from({ length: 14 }, (_unused, index) => ({ name: `photo-${index}` })),
    rating,
    userRatingCount: reviewCount,
  });
}

/** A neglected one: wrong category, no hours, no photos, no website, few reviews. */
function weakPlace(id: string, name: string): PlacesPlace {
  return place({
    id,
    name,
    // A category Google does publish, and the wrong one — a listing whose category is
    // only the generic "health" bucket is unverifiable rather than wrong, so it would
    // not be testing anything here.
    primaryType: 'apartment_building',
    primaryTypeDisplayName: { text: 'Apartment building' },
    types: ['apartment_building'],
    rating: 3.4,
    userRatingCount: 4,
  });
}

test('a competitor is scored on the listing and review modules only', () => {
  const { scores } = scorePlace(strongPlace('a', 'Willow Bend Assisted Living'), NOW);

  assert.deepEqual(Object.keys(scores.moduleScores).sort(), [...COMPARED_MODULES].sort());
  assert.deepEqual(COMPARED_MODULES, ['gbp', 'reviews']);
  assert.deepEqual(scores.notEvaluated, []);
});

test('a well-tended listing outscores a neglected one', () => {
  const strong = scorePlace(strongPlace('a', 'Willow Bend Assisted Living'), NOW).scores;
  const weak = scorePlace(weakPlace('b', 'Old Oaks Senior Living'), NOW).scores;

  assert.ok(strong.totalScore > weak.totalScore, `${strong.totalScore} vs ${weak.totalScore}`);
  assert.equal(strong.totalScore, 100);
});

test('what a competitor’s public record cannot show is left out, not scored zero', () => {
  const { modules } = scorePlace(strongPlace('a', 'Willow Bend Assisted Living'), NOW);
  const gbp = modules.find((module) => module.moduleId === 'gbp')!;
  const reviews = modules.find((module) => module.moduleId === 'reviews')!;

  // No website of theirs was read, so the NAP comparison has nothing to compare.
  assert.equal(gbp.checks.find((check) => check.id === 'gbp.nap_match')!.status, 'unavailable');
  // Review dates, owner replies and Yelp all need calls we do not make for a neighbour.
  for (const id of ['reviews.recency', 'reviews.owner_responses', 'reviews.yelp_presence']) {
    assert.equal(reviews.checks.find((check) => check.id === id)!.status, 'unavailable', id);
  }
  // And the checks that survive still add up to a full score.
  assert.equal(reviews.percent, 100);
});

test('a listing with no reviews at all is scored on its listing alone', () => {
  const bare = place({
    id: 'c',
    name: 'Quiet Hills Memory Care',
    primaryType: 'assisted_living_facility',
    types: ['assisted_living_facility'],
    regularOpeningHours: { weekdayDescriptions: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] },
    photos: [{ name: 'photo-1' }],
    websiteUri: 'https://quiet-hills.example.com',
  });

  const { scores } = scorePlace(bare, NOW);
  assert.deepEqual(scores.notEvaluated, ['reviews']);
  assert.equal(scores.moduleScores.reviews, undefined);
  assert.ok(scores.totalScore > 0);
});

test('a competitor row carries what the table needs', () => {
  const competitor = toCompetitor(
    { place: strongPlace('a', 'Willow Bend Assisted Living'), distanceMiles: 2.4 },
    NOW,
  )!;

  assert.equal(competitor.name, 'Willow Bend Assisted Living');
  assert.equal(competitor.googlePlaceId, 'a');
  assert.equal(competitor.zipCode, '37027');
  assert.equal(competitor.distanceMiles, 2.4);
  assert.equal(competitor.rating, 4.8);
  assert.equal(competitor.reviewCount, 60);
  assert.deepEqual(competitor.careTypes, ['assisted_living']);
});

function search(places: PlacesPlace[]): CompetitorSearchResult {
  return {
    places: places.map((entry, index) => ({ place: entry, distanceMiles: index + 1 })),
    zipCodesSearched: ['37027', '37067'],
    radiusMiles: 5,
  };
}

test('a leading community ranks first and is told so', () => {
  const comparison = buildComparison({
    targetPlace: strongPlace('target', 'Cloverland Park Senior Living', 4.9, 80),
    search: search([weakPlace('a', 'Old Oaks Senior Living'), weakPlace('b', 'Hillside Retirement Home')]),
    now: NOW,
  })!;

  assert.equal(comparison.targetRank, 1);
  assert.equal(comparison.setSize, 3);
  assert.ok(comparison.targetScore > comparison.averageCompetitorScore);
  assert.equal(comparison.insights.find((insight) => insight.moduleId === 'overall')!.standing, 'leading');
});

test('a trailing community is told how many are ahead of it', () => {
  const comparison = buildComparison({
    targetPlace: weakPlace('target', 'Cloverland Park Senior Living'),
    search: search([
      strongPlace('a', 'Willow Bend Assisted Living'),
      strongPlace('b', 'Franklin Memory Care'),
      strongPlace('c', 'Green Hills Senior Living'),
    ]),
    now: NOW,
  })!;

  assert.equal(comparison.targetRank, 4);
  const overall = comparison.insights.find((insight) => insight.moduleId === 'overall')!;
  assert.equal(overall.standing, 'trailing');
  // The score and the average both appear, so rank cannot be read as worse or better
  // than the gap actually is.
  assert.match(overall.message, new RegExp(`${comparison.targetScore} out of 100`));
  assert.match(overall.message, /3 of them are ahead of you/);

  const rating = comparison.insights.find((insight) => insight.message.includes('star'))!;
  assert.equal(rating.standing, 'trailing');
});

test('the comparison says what it compared, and what it did not', () => {
  const comparison = buildComparison({
    targetPlace: strongPlace('target', 'Cloverland Park Senior Living'),
    search: search([strongPlace('a', 'Willow Bend Assisted Living')]),
    now: NOW,
  })!;

  assert.deepEqual(comparison.comparedModules, ['gbp', 'reviews']);
  assert.match(comparison.basis, /website/i);
  assert.deepEqual(comparison.zipCodesSearched, ['37027', '37067']);
  assert.equal(comparison.radiusMiles, 5);
});

test('the review-count callout names the number, because that is what operators act on', () => {
  const comparison = buildComparison({
    targetPlace: strongPlace('target', 'Cloverland Park Senior Living', 4.5, 12),
    search: search([
      strongPlace('a', 'Willow Bend Assisted Living', 4.5, 90),
      strongPlace('b', 'Franklin Memory Care', 4.5, 70),
    ]),
    now: NOW,
  })!;

  const volume = comparison.insights.find((insight) => insight.message.includes('12 Google reviews'))!;
  assert.equal(volume.standing, 'trailing');
  assert.match(volume.message, /2 nearby communities have more/);
});

test('with no listing of our own there is nothing to compare like-for-like', () => {
  assert.equal(
    buildComparison({ search: search([strongPlace('a', 'Willow Bend Assisted Living')]), now: NOW }),
    undefined,
  );
});

test('with no neighbours found there is no comparison', () => {
  assert.equal(
    buildComparison({
      targetPlace: strongPlace('target', 'Cloverland Park Senior Living'),
      search: { places: [], zipCodesSearched: ['37027'], unavailableReason: 'Nothing nearby.' },
      now: NOW,
    }),
    undefined,
  );
});
