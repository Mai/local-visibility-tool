import assert from 'node:assert/strict';
import { test } from 'node:test';

import { distinctiveNameTokens } from './business-name.js';
import {
  CITATION_MATCH_THRESHOLD,
  chooseCitationCandidates,
  listingKey,
  mentionsCareTypes,
  pathTokenSimilarity,
  scoreCitationCandidate,
} from './citation-match.js';
import type { SerperOrganicResult } from '../collectors/serper.js';

const CONTEXT = { businessName: 'Brookdale Chambrel Brentwood', city: 'Brentwood', zipCode: '37027' };

function result(link: string, title: string, snippet?: string): SerperOrganicResult {
  return { link, title, ...(snippet ? { snippet } : {}) };
}

test('generic senior living words are not treated as identifying', () => {
  assert.deepEqual(distinctiveNameTokens('Sunrise Senior Living Community'), ['sunrise']);
});

test('a name made only of generic words still yields something to match on', () => {
  const distinctive = distinctiveNameTokens('The Senior Living Community');
  assert.ok(distinctive.includes('senior'));
  assert.ok(distinctive.includes('living'));
});

test('a listing whose slug carries the name is accepted', () => {
  const score = scoreCitationCandidate(
    result('https://www.caring.com/senior-living/tennessee/brentwood/brookdale-chambrel', 'Brookdale Chambrel Brentwood - Caring.com'),
    CONTEXT,
  );
  assert.ok(score >= CITATION_MATCH_THRESHOLD, `expected a match, got ${score}`);
});

test('a directory round-up page is rejected', () => {
  const score = scoreCitationCandidate(
    result(
      'https://www.caring.com/senior-living/tennessee/brentwood',
      'Best Assisted Living in Brentwood, TN — 24 Communities',
      'Compare 24 assisted living communities in Brentwood, including Brookdale Chambrel.',
    ),
    CONTEXT,
  );
  assert.equal(score, 0);
});

test('a search page on the right domain is rejected', () => {
  assert.equal(
    scoreCitationCandidate(
      result('https://www.yellowpages.com/search?q=brookdale', 'Brookdale Chambrel Brentwood'),
      CONTEXT,
    ),
    0,
  );
});

test('review and photo tabs fold into the listing they belong to', () => {
  assert.equal(
    listingKey('https://www.caring.com/senior-living/tn/brookdale-chambrel/reviews'),
    listingKey('https://www.caring.com/senior-living/tn/brookdale-chambrel/'),
  );
});

test('a sibling community is not counted as a duplicate listing', () => {
  const candidates = chooseCitationCandidates(
    [
      result('https://www.caring.com/senior-living/tennessee/brentwood/brookdale-chambrel', 'Brookdale Chambrel Brentwood'),
      result('https://www.caring.com/senior-living/tennessee/nashville/brookdale-green-hills', 'Brookdale Green Hills'),
    ],
    CONTEXT,
  );

  assert.equal(candidates.best?.link.includes('brookdale-chambrel'), true);
  assert.deepEqual(candidates.duplicates, []);
});

test('the same listing published twice is reported as a duplicate', () => {
  const candidates = chooseCitationCandidates(
    [
      result('https://www.caring.com/senior-living/tennessee/brentwood/brookdale-chambrel', 'Brookdale Chambrel Brentwood'),
      result('https://www.caring.com/senior-living/tennessee/brentwood/brookdale-chambrel-2', 'Brookdale Chambrel Brentwood'),
    ],
    CONTEXT,
  );

  assert.equal(candidates.duplicates.length, 1);
});

test('paths of two different communities overlap only partly', () => {
  const similarity = pathTokenSimilarity(
    'https://x.com/tennessee/brentwood/brookdale-chambrel',
    'https://x.com/tennessee/nashville/brookdale-green-hills',
  );
  assert.ok(similarity < 0.6, `expected a low overlap, got ${similarity}`);
});

test('no candidate at all leaves the directory unmatched', () => {
  const candidates = chooseCitationCandidates(
    [result('https://www.caring.com/senior-living/tennessee/brentwood', 'Assisted Living in Brentwood')],
    CONTEXT,
  );
  assert.equal(candidates.best, undefined);
  assert.equal(candidates.confidence, 0);
});

test('a Facebook photo post is not mistaken for the page itself', () => {
  assert.equal(
    scoreCitationCandidate(
      result(
        'https://www.facebook.com/cloverlandpark/photos/were-proud-to-spotlight-our-exceptional-leadership/887475140052485/',
        'We’re proud to spotlight our exceptional leadership — Cloverland Park',
      ),
      { businessName: 'Cloverland Park', city: 'Brentwood', zipCode: '37027' },
    ),
    0,
  );
});

test('care types are recognised from a listing snippet', () => {
  assert.equal(
    mentionsCareTypes('Offers memory care and assisted living in Brentwood.', ['memory_care']),
    true,
  );
  assert.equal(mentionsCareTypes('A quiet community with lovely gardens.', ['memory_care']), false);
});

const CLOVERLAND = { businessName: 'Cloverland Park', city: 'Brentwood', zipCode: '37027' };

test('an unrelated business sharing only a landscape word is not their listing', () => {
  // Live regression: this scored as Cloverland Park's Healthgrades listing on "park".
  assert.equal(
    scoreCitationCandidate(
      result(
        'https://www.healthgrades.com/urgent-care/carenow-urgent-care-brentwood-health-park-hg7680',
        'CareNow Urgent Care - Brentwood Health Park',
      ),
      CLOVERLAND,
    ),
    0,
  );
});

test('a directory’s category page for the whole town is nobody’s listing', () => {
  assert.equal(
    scoreCitationCandidate(
      result(
        'https://www.yellowpages.com/west-end-park-nashville-tn/retirement-communities',
        'Retirement Communities in West End Park, Nashville, TN',
      ),
      CLOVERLAND,
    ),
    0,
  );
});

test('the real listing still scores above the threshold', () => {
  const score = scoreCitationCandidate(
    result(
      'https://www.caring.com/senior-living/tennessee/brentwood/cloverland-park-senior-living',
      'Cloverland Park Senior Living - Brentwood, TN',
    ),
    CLOVERLAND,
  );

  assert.ok(score >= CITATION_MATCH_THRESHOLD, `expected a match, scored ${score}`);
});

test('a name built only of shared words has to match in full', () => {
  const context = { businessName: 'Park Place Senior Living', city: 'Brentwood', zipCode: '37027' };

  // "place" alone is not enough...
  assert.equal(
    scoreCitationCandidate(
      result('https://www.caring.com/senior-living/tn/brentwood/sunny-place', 'Sunny Place'),
      context,
    ),
    0,
  );
  // ...but both words are.
  assert.ok(
    scoreCitationCandidate(
      result('https://www.caring.com/senior-living/tn/brentwood/park-place', 'Park Place'),
      context,
    ) >= CITATION_MATCH_THRESHOLD,
  );
});
