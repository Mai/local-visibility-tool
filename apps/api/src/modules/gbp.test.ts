import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Nap } from '@sensi/shared';

import type { FindPlaceOutcome, PlacesPlace } from '../collectors/places.js';
import { GBP_MAX_CHECK_POINTS, scoreGbp, type GbpInput } from './gbp.js';

const WEBSITE_NAP: Nap = {
  name: 'Sunrise Meadows Senior Living',
  street: '1420 Peachtree Road',
  city: 'Marietta',
  state: 'GA',
  zipCode: '30060',
  phone: '7705550142',
};

const COMPLETE_PLACE: PlacesPlace = {
  id: 'places/abc123',
  displayName: { text: 'Sunrise Meadows Senior Living' },
  formattedAddress: '1420 Peachtree Rd, Marietta, GA 30060, USA',
  addressComponents: [
    { longText: '1420', types: ['street_number'] },
    { longText: 'Peachtree Road', shortText: 'Peachtree Rd', types: ['route'] },
    { longText: 'Marietta', types: ['locality'] },
    { longText: 'Georgia', shortText: 'GA', types: ['administrative_area_level_1'] },
    { longText: '30060', types: ['postal_code'] },
  ],
  nationalPhoneNumber: '(770) 555-0142',
  websiteUri: 'https://sunrisemeadows.example/',
  googleMapsUri: 'https://maps.google.com/?cid=1',
  rating: 4.7,
  userRatingCount: 64,
  primaryType: 'assisted_living_facility',
  primaryTypeDisplayName: { text: 'Assisted living facility' },
  types: ['assisted_living_facility', 'point_of_interest'],
  businessStatus: 'OPERATIONAL',
  regularOpeningHours: {
    weekdayDescriptions: [
      'Monday: Open 24 hours',
      'Tuesday: Open 24 hours',
      'Wednesday: Open 24 hours',
      'Thursday: Open 24 hours',
      'Friday: Open 24 hours',
      'Saturday: Open 24 hours',
      'Sunday: Open 24 hours',
    ],
  },
  editorialSummary: { text: 'Assisted living and memory care community in Marietta, Georgia.' },
  photos: Array.from({ length: 14 }, (_value, index) => ({ name: `photo-${index}` })),
};

function matchedLookup(place: PlacesPlace): FindPlaceOutcome {
  return { ok: true, place, matchedOn: 'website', confidence: 1, alternatives: [] };
}

function input(overrides: Partial<GbpInput> = {}): GbpInput {
  return {
    lookup: matchedLookup(COMPLETE_PLACE),
    place: COMPLETE_PLACE,
    websiteNap: WEBSITE_NAP,
    websiteUrl: 'https://sunrisemeadows.example/',
    careTypes: ['assisted_living', 'memory_care'],
    city: 'Marietta',
    ...overrides,
  };
}

test('module check points sum to the PRD weight of 25', () => {
  const module = scoreGbp(input());
  const total = module.checks.reduce((sum, check) => sum + check.maxPoints, 0);
  assert.equal(total, GBP_MAX_CHECK_POINTS);
  assert.equal(total, 25);
});

test('a well-tended listing scores full marks on everything we can see', () => {
  const module = scoreGbp(input());

  const scored = module.checks.filter((check) => check.status !== 'unavailable');
  assert.ok(
    scored.every((check) => check.status === 'pass'),
    scored.filter((check) => check.status !== 'pass').map((check) => check.id).join(', '),
  );
  // Q&A and Posts are not in Google's public data, so they leave the denominator.
  assert.deepEqual(
    module.checks.filter((check) => check.status === 'unavailable').map((check) => check.id),
    ['gbp.questions_answers', 'gbp.posts'],
  );
  assert.equal(module.percent, 100);
  assert.equal(module.points, 25);
});

test('no Google listing fails the listing check and leaves the rest unverifiable', () => {
  const module = scoreGbp(
    input({
      lookup: {
        ok: false,
        notFound: true,
        reason: 'not found',
        alternatives: [{ id: 'places/other', name: 'Other Community' }],
      },
      place: undefined,
    }),
  );

  const listing = module.checks.find((check) => check.id === 'gbp.listing_found')!;
  assert.equal(listing.status, 'fail');
  assert.equal(module.points, 0);
  assert.equal(module.percent, 0);
});

test('a mismatched phone number fails the consistency check outright', () => {
  const module = scoreGbp(
    input({
      websiteNap: { ...WEBSITE_NAP, phone: '7705559999' },
    }),
  );

  const nap = module.checks.find((check) => check.id === 'gbp.nap_match')!;
  assert.equal(nap.status, 'fail');
  assert.equal(nap.points, 0);
  assert.match(nap.detail, /phone number/);
});

test('a name-only difference is a warning, not a failure', () => {
  const module = scoreGbp(
    input({
      websiteNap: { ...WEBSITE_NAP, name: 'Sunrise Meadows of Cobb County' },
    }),
  );

  const nap = module.checks.find((check) => check.id === 'gbp.nap_match')!;
  assert.equal(nap.status, 'warn');
  assert.equal(nap.points, 2);
});

test('a listing categorised as something other than senior care fails the category check', () => {
  const module = scoreGbp(
    input({
      place: {
        ...COMPLETE_PLACE,
        primaryType: 'apartment_building',
        primaryTypeDisplayName: { text: 'Apartment building' },
        types: ['apartment_building'],
      },
    }),
  );

  const categories = module.checks.find((check) => check.id === 'gbp.categories')!;
  assert.equal(categories.status, 'fail');
  assert.match(categories.detail, /Apartment building/);
});

test('a senior care category that is not primary earns partial credit', () => {
  const module = scoreGbp(
    input({
      place: {
        ...COMPLETE_PLACE,
        primaryType: 'apartment_building',
        primaryTypeDisplayName: { text: 'Apartment building' },
        types: ['apartment_building', 'assisted_living_facility'],
      },
    }),
  );

  const categories = module.checks.find((check) => check.id === 'gbp.categories')!;
  assert.equal(categories.status, 'warn');
  assert.equal(categories.points, 1.5);
});

test('a category Google will not publish is unverifiable, not a failure', () => {
  // What every senior living community in the market we tested against comes back as.
  // Their Business Profiles do carry a real category — Maps shows it — but the API at
  // this access level publishes only the bucket, so the whole market was failing a
  // check about a field we cannot read.
  const module = scoreGbp(
    input({
      place: {
        ...COMPLETE_PLACE,
        primaryType: 'health',
        primaryTypeDisplayName: { text: 'Health' },
        types: ['point_of_interest', 'health', 'service', 'establishment'],
      },
    }),
  );

  const categories = module.checks.find((check) => check.id === 'gbp.categories')!;
  assert.equal(categories.status, 'unavailable');
  assert.equal(categories.points, 0);
  // The advice survives even though the score does not.
  assert.match(categories.detail, /senior home care/);
  assert.match(categories.unavailableReason!, /broad category/);
  // And the three points leave the denominator instead of being lost.
  assert.equal(module.percent, 100);
});

test('a temporarily closed listing is flagged as a warning', () => {
  const module = scoreGbp(
    input({ place: { ...COMPLETE_PLACE, businessStatus: 'CLOSED_TEMPORARILY' } }),
  );

  const listing = module.checks.find((check) => check.id === 'gbp.listing_found')!;
  assert.equal(listing.status, 'warn');
  assert.match(listing.detail, /temporarily closed/);
});

test('thin photo coverage is scored honestly', () => {
  const withFive = scoreGbp(input({ place: { ...COMPLETE_PLACE, photos: [{}, {}, {}, {}, {}] } }));
  const withNone = scoreGbp(input({ place: { ...COMPLETE_PLACE, photos: [] } }));

  assert.equal(withFive.checks.find((check) => check.id === 'gbp.photos')!.status, 'warn');
  const none = withNone.checks.find((check) => check.id === 'gbp.photos')!;
  assert.equal(none.status, 'fail');
  assert.match(none.detail, /no photos at all/);
});

test('a missing API key leaves the module unscored rather than at zero', () => {
  const module = scoreGbp(
    input({
      lookup: { ok: false, missingKey: true, reason: 'Google listing checks need a Google Places API key.' },
      place: undefined,
    }),
  );

  assert.equal(module.points, 0);
  assert.ok(module.unavailableReason);
  assert.ok(module.checks.every((check) => check.status === 'unavailable'));
});

test('a listing pointing at someone else’s website is a warning with the host named', () => {
  const module = scoreGbp(
    input({ place: { ...COMPLETE_PLACE, websiteUri: 'https://portfolio-site.example/communities/1' } }),
  );

  const link = module.checks.find((check) => check.id === 'gbp.website_link')!;
  assert.equal(link.status, 'warn');
  assert.match(link.detail, /portfolio-site\.example/);
});

test('a description we cannot see is unverifiable, not a lost point', () => {
  // Google publishes only its own editorial blurb to tools. The description the
  // operator writes in their Business Profile is never exposed, so its absence here
  // says nothing about whether they filled it in — the live listing for a real
  // community came back this way with a perfectly good profile behind it.
  const { editorialSummary, ...withoutDescription } = COMPLETE_PLACE;
  const module = scoreGbp(
    input({ lookup: matchedLookup(withoutDescription), place: withoutDescription }),
  );

  const check = module.checks.find((candidate) => candidate.id === 'gbp.description');
  assert.equal(check?.status, 'unavailable');
  assert.equal(check?.points, 0);
  assert.match(check?.unavailableReason ?? '', /does not share the description/);
  // Its 2 points leave the denominator, so everything else still scores full marks.
  assert.equal(module.percent, 100);
});
