import assert from 'node:assert/strict';
import { test } from 'node:test';

import { mapSerperResponse, resultsOnDomain } from './serper.js';

test('organic results are mapped and incomplete ones dropped', () => {
  const outcome = mapSerperResponse('site:caring.com brookdale', {
    organic: [
      { title: 'Brookdale Chambrel', link: 'https://www.caring.com/a', snippet: 'Assisted living', position: 1 },
      { title: 'No link here' },
      { link: 'https://www.caring.com/b' },
    ],
  });

  assert.equal(outcome.ok, true);
  if (!outcome.ok) return;
  assert.equal(outcome.results.length, 1);
  assert.equal(outcome.results[0]!.snippet, 'Assisted living');
});

test('an error message with no results is reported as unavailable', () => {
  const outcome = mapSerperResponse('q', { message: 'Not enough credits' });
  assert.equal(outcome.ok, false);
  if (outcome.ok) return;
  assert.ok(outcome.reason.includes('Not enough credits'));
});

test('only results on the directory’s own domain are considered', () => {
  const results = [
    { title: 'a', link: 'https://www.caring.com/senior-living/x' },
    { title: 'b', link: 'https://reviews.caring.com/y' },
    { title: 'c', link: 'https://caring.com.example.net/z' },
    { title: 'd', link: 'not a url' },
  ];

  assert.deepEqual(
    resultsOnDomain(results, 'caring.com').map((result) => result.title),
    ['a', 'b'],
  );
});
