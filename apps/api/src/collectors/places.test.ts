import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  careTypesFromPlace,
  chooseMatch,
  hasPublishedCategory,
  placesAddress,
  type PlacesPlace,
} from './places.js';

const TARGET: PlacesPlace = {
  id: 'places/target',
  displayName: { text: 'Sunrise Meadows Senior Living' },
  websiteUri: 'https://www.sunrisemeadows.example/',
  formattedAddress: '1420 Peachtree Rd, Marietta, GA 30060, USA',
};

const NEIGHBOUR: PlacesPlace = {
  id: 'places/neighbour',
  displayName: { text: 'Peachtree Gardens Assisted Living' },
  websiteUri: 'https://peachtreegardens.example/',
  formattedAddress: '90 Cobb Pkwy, Marietta, GA 30060, USA',
};

const OPTIONS = {
  businessName: 'Sunrise Meadows Senior Living',
  websiteUrl: 'https://sunrisemeadows.example/',
  zipCode: '30060',
};

test('a matching website domain decides the match outright', () => {
  const result = chooseMatch([NEIGHBOUR, TARGET], OPTIONS);

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.place.id, 'places/target');
  assert.equal(result.matchedOn, 'website');
  assert.equal(result.confidence, 1);
  assert.deepEqual(
    result.alternatives.map((item) => item.id),
    ['places/neighbour'],
  );
});

test('without a website link, a strong name match in the right zip is accepted', () => {
  const noWebsite: PlacesPlace = { ...TARGET, websiteUri: undefined };
  const result = chooseMatch([NEIGHBOUR, noWebsite], OPTIONS);

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.place.id, 'places/target');
  assert.equal(result.matchedOn, 'name_and_zip');
});

test('a name match in the wrong zip is returned with low confidence', () => {
  const otherTown: PlacesPlace = {
    ...TARGET,
    websiteUri: undefined,
    formattedAddress: '5 Main St, Arlington, VA 22201, USA',
  };
  const result = chooseMatch([otherTown], OPTIONS);

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.matchedOn, 'name');
  assert.equal(result.confidence, 0.5);
});

test('unrelated listings are reported as not found, with what we did see', () => {
  const result = chooseMatch([NEIGHBOUR], OPTIONS);

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.ok('notFound' in result && result.notFound);
  if (!('notFound' in result)) return;
  assert.deepEqual(
    result.alternatives.map((item) => item.name),
    ['Peachtree Gardens Assisted Living'],
  );
});

test('an empty result set is not found rather than an error', () => {
  const result = chooseMatch([], OPTIONS);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.ok('notFound' in result);
});

test('address components are flattened into comparable fields', () => {
  const address = placesAddress({
    addressComponents: [
      { longText: '1420', types: ['street_number'] },
      { longText: 'Peachtree Road', shortText: 'Peachtree Rd', types: ['route'] },
      { longText: 'Marietta', types: ['locality'] },
      { longText: 'Georgia', shortText: 'GA', types: ['administrative_area_level_1'] },
      { longText: 'Cobb County', types: ['administrative_area_level_2'] },
      { longText: '30060', types: ['postal_code'] },
    ],
  });

  assert.deepEqual(address, {
    street: '1420 Peachtree Road',
    city: 'Marietta',
    // The state comes back as the abbreviation, which is what listings show.
    state: 'GA',
    zipCode: '30060',
    county: 'Cobb County',
  });
});

test('Google categories map onto our care types', () => {
  assert.deepEqual(
    careTypesFromPlace({ types: ['assisted_living_facility', 'nursing_home'] }),
    ['assisted_living', 'skilled_nursing'],
  );
  assert.deepEqual(careTypesFromPlace({ types: ['apartment_building'] }), []);
});

test('a listing filed only under generic types has no category we can judge', () => {
  // What Places returns for every senior living community we have looked at.
  assert.equal(
    hasPublishedCategory({
      primaryType: 'health',
      types: ['point_of_interest', 'health', 'service', 'establishment'],
    }),
    false,
  );
  assert.equal(hasPublishedCategory({}), false);
  // A real category, right or wrong, is something we can judge.
  assert.equal(
    hasPublishedCategory({ primaryType: 'assisted_living_facility', types: ['assisted_living_facility'] }),
    true,
  );
  assert.equal(
    hasPublishedCategory({ primaryType: 'apartment_building', types: ['apartment_building', 'establishment'] }),
    true,
  );
  // Specific enough anywhere in the list counts: the primary may be the bucket while
  // the operator's real categories sit alongside it.
  assert.equal(hasPublishedCategory({ primaryType: 'health', types: ['health', 'nursing_home'] }), true);
});
