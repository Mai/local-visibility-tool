import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { CitationResult, DirectoryId } from '@sensi/shared';

import { CITATIONS_MAX_CHECK_POINTS, scoreCitations } from './citations.js';

function citation(directoryId: DirectoryId, overrides: Partial<CitationResult> = {}): CitationResult {
  return {
    directoryId,
    label: directoryId,
    listingFound: true,
    verifiedVia: 'serp',
    ...overrides,
  };
}

const ALL_FOUND: CitationResult[] = [
  citation('yelp', { verifiedVia: 'api', napMatches: true, mentionsCareTypes: true }),
  citation('a_place_for_mom', { napMatches: true, mentionsCareTypes: true }),
  citation('caring_com', { napMatches: true, mentionsCareTypes: true }),
  citation('senior_advisor', { napMatches: true, mentionsCareTypes: true }),
  citation('bing_places', { mentionsCareTypes: true }),
  citation('apple_maps', { mentionsCareTypes: true }),
  citation('facebook', { mentionsCareTypes: true }),
  citation('yellowpages', { napMatches: true, mentionsCareTypes: true }),
];

test('the checks add up to the PRD weight of 20', () => {
  const module = scoreCitations({ results: ALL_FOUND });
  const maxPoints = module.checks.reduce((sum, check) => sum + check.maxPoints, 0);
  assert.equal(maxPoints, CITATIONS_MAX_CHECK_POINTS);
});

test('a community listed everywhere with matching details scores full marks', () => {
  const module = scoreCitations({ results: ALL_FOUND });
  assert.equal(module.points, 20);
  assert.equal(module.percent, 100);
  assert.equal(module.indicator, 'green');
});

test('missing tier-1 listings are named in the finding', () => {
  const module = scoreCitations({
    results: ALL_FOUND.map((result) =>
      result.directoryId === 'caring_com' ? { ...result, listingFound: false } : result,
    ),
  });

  const check = module.checks.find((item) => item.id === 'citations.tier1_listings')!;
  assert.equal(check.status, 'warn');
  assert.ok(check.detail.includes('caring_com'));
  assert.ok(check.points < 8);
});

test('a mismatched phone number is reported with the directory that shows it', () => {
  const module = scoreCitations({
    results: ALL_FOUND.map((result) =>
      result.directoryId === 'yelp'
        ? {
            ...result,
            napMatches: false,
            napMismatches: [{ field: 'phone' as const, onWebsite: '6151112222', onListing: '6153334444' }],
          }
        : result,
    ),
  });

  const check = module.checks.find((item) => item.id === 'citations.nap_consistency')!;
  assert.equal(check.status, 'warn');
  assert.ok(check.detail.includes('phone number'));
  assert.ok(check.detail.includes('yelp'));
});

test('duplicate listings warn without costing the whole module', () => {
  const module = scoreCitations({
    results: ALL_FOUND.map((result) =>
      result.directoryId === 'caring_com' ? { ...result, duplicateListingsFound: 2 } : result,
    ),
  });

  const check = module.checks.find((item) => item.id === 'citations.no_duplicates')!;
  assert.equal(check.status, 'warn');
  assert.equal(check.points, 0);
  assert.equal(module.points, 19);
});

test('a directory we could not verify is left out of the denominator', () => {
  const module = scoreCitations({
    results: ALL_FOUND.map((result) =>
      result.directoryId === 'caring_com'
        ? { directoryId: result.directoryId, label: result.label, listingFound: null, unavailableReason: 'Search allowance spent.' }
        : result,
    ),
  });

  const check = module.checks.find((item) => item.id === 'citations.tier1_listings')!;
  assert.equal(check.status, 'pass');
  assert.equal(check.points, 8);
  assert.equal(module.points, 20);
});

test('with nothing verifiable the module is unscored, not zero', () => {
  const module = scoreCitations({
    results: ALL_FOUND.map((result) => ({
      directoryId: result.directoryId,
      label: result.label,
      listingFound: null,
      unavailableReason: 'Directory checks need a Serper.dev API key.',
    })),
  });

  assert.equal(module.indicator, 'grey');
  assert.equal(module.points, 0);
  assert.ok(module.unavailableReason);
  assert.equal(
    module.checks.every((check) => check.status === 'unavailable'),
    true,
  );
  assert.ok(module.checks[0]!.unavailableReason?.includes('Serper.dev'));
});

test('no listings anywhere fails rather than going quiet', () => {
  const module = scoreCitations({
    results: ALL_FOUND.map((result) => ({ ...result, listingFound: false, napMatches: undefined, mentionsCareTypes: undefined })),
  });

  const tier1 = module.checks.find((item) => item.id === 'citations.tier1_listings')!;
  assert.equal(tier1.status, 'fail');
  assert.equal(tier1.points, 0);
  assert.ok(tier1.detail.includes('0 of'));
});
