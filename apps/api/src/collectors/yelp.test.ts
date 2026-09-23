import assert from 'node:assert/strict';
import { test } from 'node:test';

import { chooseYelpMatch } from './yelp.js';

const RESPONSE = {
  businesses: [
    {
      id: 'peachtree-gardens',
      name: 'Peachtree Gardens Assisted Living',
      rating: 3.5,
      review_count: 8,
      display_phone: '(770) 555-7777',
      location: { address1: '90 Cobb Pkwy', city: 'Marietta', state: 'GA', zip_code: '30060' },
    },
    {
      id: 'sunrise-meadows-marietta',
      name: 'Sunrise Meadows Senior Living',
      rating: 4.5,
      review_count: 12,
      display_phone: '(770) 555-0142',
      location: { address1: '1420 Peachtree Rd', city: 'Marietta', state: 'GA', zip_code: '30060' },
    },
  ],
};

test('a matching phone number decides the match', () => {
  const result = chooseYelpMatch(RESPONSE, {
    // A name that would otherwise lose to the first result.
    businessName: 'Sunrise Meadows',
    zipCode: '30060',
    phone: '7705550142',
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.business.id, 'sunrise-meadows-marietta');
  assert.equal(result.business.rating, 4.5);
  assert.equal(result.business.reviewCount, 12);
  assert.equal(result.business.phone, '7705550142');
});

test('without a phone, the strongest name match in the zip wins', () => {
  const result = chooseYelpMatch(RESPONSE, {
    businessName: 'Sunrise Meadows Senior Living',
    zipCode: '30060',
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.business.id, 'sunrise-meadows-marietta');
});

test('no plausible name match is reported as not found', () => {
  const result = chooseYelpMatch(RESPONSE, {
    businessName: 'Brookdale Chambrel Club Hill',
    zipCode: '75088',
  });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.ok('notFound' in result);
});

test('sharing only the words "senior living" is not a match', () => {
  const result = chooseYelpMatch(
    {
      businesses: [
        {
          id: 'brookdale-senior-living-brentwood',
          name: 'Brookdale Senior Living',
          location: { address1: '111 Westwood Pl', city: 'Brentwood', state: 'TN', zip_code: '37027' },
        },
      ],
    },
    { businessName: 'Exceptional Senior Living', zipCode: '37027' },
  );

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.ok('notFound' in result);
});

test('category titles come through for the care-type check', () => {
  const result = chooseYelpMatch(
    {
      businesses: [
        {
          id: 'sunrise-meadows-marietta',
          name: 'Sunrise Meadows Senior Living',
          categories: [{ alias: 'assistedliving', title: 'Assisted Living Facilities' }],
          location: { address1: '1420 Peachtree Rd', city: 'Marietta', state: 'GA', zip_code: '30060' },
        },
      ],
    },
    { businessName: 'Sunrise Meadows', zipCode: '30060' },
  );

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.business.categories, ['Assisted Living Facilities']);
});

test('an empty Yelp result set is not found, not an error', () => {
  const result = chooseYelpMatch({ businesses: [] }, { businessName: 'Sunrise Meadows', zipCode: '30060' });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.ok('notFound' in result);
  assert.match(result.reason, /No Yelp listing/);
});
