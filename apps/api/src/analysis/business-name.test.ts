import assert from 'node:assert/strict';
import { test } from 'node:test';

import { businessNameFromTitle, distinctiveNameTokens, nonGenericTokens, strongNameTokens } from './business-name.js';

test('the domain settles which title segment is the community’s name', () => {
  assert.equal(
    businessNameFromTitle(
      'Exceptional Senior Living | Brentwood, TN | Cloverland Park',
      'cloverlandparkseniorliving.com',
    ),
    'Cloverland Park',
  );
});

test('a title that leads with the name still works', () => {
  assert.equal(
    businessNameFromTitle('Morning Pointe of Brentwood | Assisted Living in Brentwood, TN', 'morningpointe.com'),
    'Morning Pointe of Brentwood',
  );
});

test('a town-only segment is not taken for a business name', () => {
  assert.equal(
    businessNameFromTitle('Assisted Living in Brentwood, TN | Harmony at Brentwood'),
    'Harmony at Brentwood',
  );
});

test('marketing adjectives are not identifying words', () => {
  assert.deepEqual(nonGenericTokens('Exceptional Senior Living'), []);
  assert.deepEqual(distinctiveNameTokens('Cloverland Park Senior Living'), ['cloverland', 'park']);
});

test('landscape words do not identify a community on their own', () => {
  // "Park" is in half the community names in any county — and in the names of
  // unrelated businesses on the same streets.
  assert.deepEqual(strongNameTokens('Cloverland Park Senior Living'), ['cloverland']);
  assert.deepEqual(strongNameTokens('The Village at Germantown'), ['germantown']);
  // Nothing but shared vocabulary: the caller has to demand a fuller match.
  assert.deepEqual(strongNameTokens('Park Place Senior Living'), []);
});
