import assert from 'node:assert/strict';
import { test } from 'node:test';

import { compareListingPage } from './directory-nap.js';
import type { PageSnapshot } from '../types/site.js';

const WEBSITE_NAP = {
  name: 'Brookdale Chambrel Brentwood',
  street: '8005 Chambrel Way',
  city: 'Brentwood',
  state: 'TN',
  zipCode: '37027',
  phone: '6153732441',
};

function page(overrides: Partial<PageSnapshot> = {}): PageSnapshot {
  return {
    requestedUrl: 'https://www.caring.com/x',
    finalUrl: 'https://www.caring.com/x',
    roles: ['directory_listing'],
    hasViewportMeta: true,
    headings: [],
    bodyText: '',
    textBlocks: [],
    wordCount: 0,
    phonesInText: [],
    addressesInText: [],
    localitiesInText: [],
    structuredData: { types: [], hasLocalBusiness: false, hasSeniorCareType: false, invalidBlocks: 0 },
    hasEmbeddedMap: false,
    internalLinks: [],
    careTypes: [],
    questionHeadings: [],
    questionSections: [],
    fetchedVia: 'playwright',
    ...overrides,
  };
}

test('a listing showing the same address and phone matches', () => {
  const comparison = compareListingPage(
    page({
      addressesInText: ['8005 Chambrel Way'],
      localitiesInText: [{ city: 'Brentwood', state: 'TN', zipCode: '37027' }],
      phonesInText: ['6153732441'],
    }),
    WEBSITE_NAP,
  );

  assert.equal(comparison.matches, true);
  assert.deepEqual(comparison.mismatches, []);
  assert.deepEqual(comparison.compared.sort(), ['city', 'phone', 'street', 'zipCode']);
});

test('a suite number on one side only still matches', () => {
  const comparison = compareListingPage(
    page({ addressesInText: ['8005 Chambrel Way, Suite 100'] }),
    { street: '8005 Chambrel Way' },
  );
  assert.equal(comparison.matches, true);
});

test('nearby communities on the page do not create a mismatch', () => {
  const comparison = compareListingPage(
    page({
      addressesInText: ['1 Other Road', '8005 Chambrel Way', '99 Elsewhere Drive'],
      localitiesInText: [
        { city: 'Nashville', state: 'TN', zipCode: '37215' },
        { city: 'Brentwood', state: 'TN', zipCode: '37027' },
      ],
    }),
    WEBSITE_NAP,
  );
  assert.equal(comparison.matches, true);
});

test('an address only in the page text cannot contradict the website', () => {
  // A Place for Mom publishes no street address; the one on the page belongs to a
  // community in its "nearby options" panel. Nothing here is evidence about us.
  const comparison = compareListingPage(
    page({ addressesInText: ['870 Oak Meadow Drive'], phonesInText: ['8005551234'] }),
    WEBSITE_NAP,
  );

  assert.deepEqual(comparison.mismatches, []);
  assert.deepEqual(comparison.compared, []);
  assert.equal(comparison.matches, undefined);
  assert.match(comparison.reason ?? '', /did not show an address/);
});

test('the directory’s own record of the business may contradict the website', () => {
  const comparison = compareListingPage(
    page({
      addressesInText: ['870 Oak Meadow Drive'],
      structuredData: {
        types: [],
        hasLocalBusiness: true,
        hasSeniorCareType: false,
        invalidBlocks: 0,
        postalAddress: { street: '1 Other Road', city: 'Brentwood', zipCode: '37027' },
      },
    }),
    WEBSITE_NAP,
  );

  assert.equal(comparison.matches, false);
  assert.deepEqual(comparison.mismatches, [
    { field: 'street', onWebsite: '8005 Chambrel Way', onListing: '1 Other Road' },
  ]);
  // The city and zip in that record agree, so they are compared and pass.
  assert.deepEqual(comparison.compared.sort(), ['city', 'street', 'zipCode']);
});

test('a lead-gen directory’s tracking number is not held against the operator', () => {
  const comparison = compareListingPage(
    page({ addressesInText: ['8005 Chambrel Way'], phonesInText: ['8005551234'] }),
    WEBSITE_NAP,
    { ignorePhone: true },
  );

  assert.equal(comparison.matches, true);
  assert.equal(comparison.compared.includes('phone'), false);
});

test('structured data on the listing page is compared too', () => {
  const comparison = compareListingPage(
    page({
      structuredData: {
        types: ['LocalBusiness'],
        hasLocalBusiness: true,
        hasSeniorCareType: false,
        invalidBlocks: 0,
        postalAddress: { street: '8005 Chambrel Way', city: 'Brentwood', zipCode: '37027' },
        telephone: '(615) 373-2441',
      },
    }),
    WEBSITE_NAP,
  );

  assert.equal(comparison.matches, true);
});

test('a page with no contact detail at all is not comparable', () => {
  const comparison = compareListingPage(page(), WEBSITE_NAP);
  assert.equal(comparison.matches, undefined);
  assert.deepEqual(comparison.compared, []);
  assert.ok(comparison.reason);
});

test('a listing showing the website’s other phone number is consistent', () => {
  const comparison = compareListingPage(
    page({ phonesInText: ['6158195150'] }),
    WEBSITE_NAP,
    { alternates: { phone: ['615-819-5150'] } },
  );

  assert.equal(comparison.matches, true);
  assert.deepEqual(comparison.compared, ['phone']);
});
