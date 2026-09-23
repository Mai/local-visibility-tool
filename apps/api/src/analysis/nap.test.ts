import assert from 'node:assert/strict';
import { test } from 'node:test';

import { businessNameSimilarity, compareNap } from './nap.js';

test('formatting differences are not mismatches', () => {
  const comparison = compareNap(
    {
      name: 'Sunrise Meadows Senior Living, LLC',
      street: '1420 N. Peachtree Rd, Suite 200',
      city: 'Marietta',
      state: 'Tennessee',
      zipCode: '30060-1234',
      phone: '(770) 555-0142',
    },
    {
      name: 'Sunrise Meadows Senior Living',
      street: '1420 North Peachtree Road Ste 200',
      city: 'marietta',
      state: 'TN',
      zipCode: '30060',
      phone: '+1 770-555-0142',
    },
  );

  assert.equal(comparison.matches, true, comparison.mismatches.map((m) => m.field).join(','));
  assert.deepEqual(comparison.compared, ['name', 'street', 'city', 'state', 'zipCode', 'phone']);
});

test('a different phone number is reported with both values', () => {
  const comparison = compareNap(
    { phone: '770-555-0142', city: 'Marietta' },
    { phone: '770-555-9999', city: 'Marietta' },
  );

  assert.equal(comparison.matches, false);
  assert.deepEqual(comparison.mismatches, [
    { field: 'phone', onWebsite: '770-555-0142', onListing: '770-555-9999' },
  ]);
});

test('fields missing on either side are skipped, not counted as mismatches', () => {
  const comparison = compareNap({ name: 'Sunrise Meadows', phone: '7705550142' }, { name: 'Sunrise Meadows' });

  assert.equal(comparison.matches, true);
  assert.deepEqual(comparison.compared, ['name']);
});

test('a shortened business name still counts as the same community', () => {
  assert.equal(businessNameSimilarity('Sunrise Meadows Senior Living', 'Sunrise Meadows'), 1);
  assert.ok(businessNameSimilarity('Sunrise Meadows', 'Brookdale Chambrel') < 0.5);
  assert.equal(businessNameSimilarity(undefined, 'Sunrise Meadows'), 0);
});

test('a suite number on one side only is not a different address', () => {
  const comparison = compareNap(
    { street: '6030 Cloverland Drive, Suite 500' },
    { street: '6030 Cloverland Drive' },
  );

  assert.equal(comparison.matches, true);
  assert.deepEqual(comparison.compared, ['street']);
});

test('a genuinely different street is still reported', () => {
  const comparison = compareNap({ street: '6030 Cloverland Drive' }, { street: '111 Westwood Place' });

  assert.equal(comparison.matches, false);
  assert.deepEqual(comparison.mismatches.map((mismatch) => mismatch.field), ['street']);
});

test('a listing using the fuller legal name is not an inconsistency', () => {
  const comparison = compareNap(
    { name: 'Cloverland Park' },
    { name: 'Cloverland Park Senior Living' },
  );

  assert.equal(comparison.matches, true);
  assert.deepEqual(comparison.compared, ['name']);
});

test('a listing using another number the website publishes is consistent', () => {
  const comparison = compareNap(
    { phone: '(615) 442-6943' },
    { phone: '(615) 819-5150' },
    { phone: ['615-819-5150'] },
  );

  assert.equal(comparison.matches, true);
  assert.deepEqual(comparison.compared, ['phone']);
});

test('a number published nowhere on the website is still reported', () => {
  const comparison = compareNap(
    { phone: '(615) 442-6943' },
    { phone: '(615) 269-4200' },
    { phone: ['615-819-5150'] },
  );

  assert.equal(comparison.matches, false);
  assert.deepEqual(comparison.mismatches.map((mismatch) => mismatch.field), ['phone']);
});
