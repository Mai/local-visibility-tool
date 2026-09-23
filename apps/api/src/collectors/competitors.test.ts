import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  competitorQueries,
  distanceMiles,
  isTargetItself,
  looksLikeSeniorLiving,
  pickCompetitors,
  type CompetitorSearchOptions,
} from './competitors.js';
import type { PlacesPlace } from './places.js';

const TARGET: CompetitorSearchOptions = {
  businessName: 'Cloverland Park Senior Living',
  websiteUrl: 'https://cloverlandparkseniorliving.com',
  zipCode: '37027',
  city: 'Brentwood',
  state: 'TN',
  primaryCareType: 'assisted_living',
  location: { latitude: 36.0331, longitude: -86.7828 },
  excludePlaceId: 'target-place',
};

function place(overrides: Partial<PlacesPlace> & { id: string; name: string }): PlacesPlace {
  const { id, name, ...rest } = overrides;
  return {
    id,
    displayName: { text: name },
    businessStatus: 'OPERATIONAL',
    location: { latitude: 36.05, longitude: -86.79 },
    ...rest,
  };
}

test('distance is measured in miles between two points', () => {
  // Brentwood TN to Franklin TN, about 9 miles apart.
  const miles = distanceMiles({ latitude: 36.0331, longitude: -86.7828 }, { latitude: 35.9251, longitude: -86.8689 });
  assert.ok(miles > 7 && miles < 11, `expected ~9 miles, got ${miles}`);
  assert.equal(distanceMiles({ latitude: 36, longitude: -86 }, { latitude: 36, longitude: -86 }), 0);
});

test('a senior living community is recognised from its Google category', () => {
  assert.equal(
    looksLikeSeniorLiving(place({ id: '1', name: 'Willow Bend', types: ['assisted_living_facility'] })),
    true,
  );
});

test('a senior living community is recognised from its name when Google miscategorises it', () => {
  // The community this tool was built against is filed by Google under "Health",
  // so the name has to be able to carry the decision on its own.
  assert.equal(
    looksLikeSeniorLiving(place({ id: '1', name: 'Cloverland Park Senior Living', types: ['health'] })),
    true,
  );
  assert.equal(looksLikeSeniorLiving(place({ id: '2', name: 'Maple Retirement Village' })), true);
  assert.equal(looksLikeSeniorLiving(place({ id: '3', name: 'Green Hills Memory Care' })), true);
});

test('businesses that merely rank for senior care are not competitors', () => {
  assert.equal(looksLikeSeniorLiving(place({ id: '1', name: 'Brentwood Senior Care Placement Advisors' })), false);
  // A referral franchise with no building, which a live search really did return.
  assert.equal(looksLikeSeniorLiving(place({ id: '4', name: 'Assisted Living Locators South Nashville' })), false);
  assert.equal(looksLikeSeniorLiving(place({ id: '2', name: 'Williamson Medical Center' })), false);
  assert.equal(looksLikeSeniorLiving(place({ id: '3', name: 'Maple Grove Apartments' })), false);
});

test('a home care agency is a competitor, not a referral service', () => {
  // "Agency" alone used to be disqualifying, which excluded real home care agencies
  // along with the placement agencies it was meant to catch.
  assert.equal(looksLikeSeniorLiving(place({ id: '5', name: "Lindsay's Loving Home Care Agency" })), true);
  assert.equal(looksLikeSeniorLiving(place({ id: '6', name: 'Visiting Angels Home Care' })), true);
});

test('the community’s own listing is never treated as a competitor', () => {
  assert.equal(isTargetItself(place({ id: 'target-place', name: 'Something Else' }), TARGET), true);
  assert.equal(
    isTargetItself(
      place({ id: 'other', name: 'Cloverland Park Memory Care', websiteUri: 'https://www.cloverlandparkseniorliving.com/memory-care' }),
      TARGET,
    ),
    true,
    'a listing on the same website domain is the same community',
  );
  assert.equal(
    isTargetItself(place({ id: 'other', name: 'Cloverland Park Senior Living' }), TARGET),
    true,
    'a campus listing its care levels separately is still the same community',
  );
  assert.equal(isTargetItself(place({ id: 'other', name: 'Brookdale Brentwood' }), TARGET), false);
});

test('closed listings and duplicates are dropped, and the rest come back nearest first', () => {
  const results: PlacesPlace[] = [
    place({ id: 'far', name: 'Franklin Assisted Living', location: { latitude: 35.9251, longitude: -86.8689 } }),
    place({ id: 'near', name: 'Brentwood Memory Care', location: { latitude: 36.04, longitude: -86.78 } }),
    place({ id: 'near', name: 'Brentwood Memory Care', location: { latitude: 36.04, longitude: -86.78 } }),
    place({ id: 'closed', name: 'Old Oaks Retirement Home', businessStatus: 'CLOSED_PERMANENTLY' }),
    place({ id: 'target-place', name: 'Cloverland Park Senior Living' }),
    place({ id: 'dentist', name: 'Brentwood Family Dentistry' }),
  ];

  const kept = pickCompetitors(results, TARGET);

  assert.deepEqual(
    kept.map((entry) => entry.place.id),
    ['near', 'far'],
  );
  assert.ok(kept[0]!.distanceMiles! < kept[1]!.distanceMiles!);
});

test('a competitor with no coordinates is kept but sorts last', () => {
  const kept = pickCompetitors(
    [
      place({ id: 'unknown', name: 'Hillside Assisted Living', location: undefined }),
      place({ id: 'known', name: 'Brentwood Memory Care', location: { latitude: 36.04, longitude: -86.78 } }),
    ],
    TARGET,
  );

  assert.deepEqual(
    kept.map((entry) => entry.place.id),
    ['known', 'unknown'],
  );
  assert.equal(kept[1]!.distanceMiles, undefined);
});

test('a result outside the radius is dropped, because Google only treats it as a hint', () => {
  const kept = pickCompetitors(
    [
      // Nashville, about 9 miles from Brentwood.
      place({ id: 'far', name: 'Nashville Assisted Living', location: { latitude: 36.1627, longitude: -86.7816 } }),
      place({ id: 'near', name: 'Brentwood Memory Care', location: { latitude: 36.04, longitude: -86.78 } }),
      place({ id: 'unknown', name: 'Hillside Retirement Home', location: undefined }),
    ],
    TARGET,
    5,
  );

  assert.deepEqual(
    kept.map((entry) => entry.place.id),
    ['near', 'unknown'],
  );
});

test('the search run is the one category chosen, not several detected ones', () => {
  assert.deepEqual(competitorQueries('assisted_living'), ['assisted living']);
  // "home care" alone returns medical supply stores on Google; the query has to be
  // specific enough to land on the same kind of business a family is choosing between.
  assert.deepEqual(competitorQueries('home_care'), ['home care agency']);
  assert.deepEqual(competitorQueries(undefined), ['senior care']);
});
