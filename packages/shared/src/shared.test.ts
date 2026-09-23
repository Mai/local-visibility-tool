import assert from 'node:assert/strict';
import { test } from 'node:test';

import { detectCareTypes, pickPrimaryCareType } from './care-types.js';
import { directoriesForCareTypes } from './directories.js';
import { progressPercent } from './audit-steps.js';
import { bandForScore, moduleScorePercent, TOTAL_MAX_POINTS } from './scoring.js';
import { normalizeAddress, normalizeBusinessName, normalizePhone, normalizeWebsiteUrl, normalizeZipCode } from './validation.js';

test('module weights sum to 100', () => {
  assert.equal(TOTAL_MAX_POINTS, 100);
});

test('score bands cover the boundaries from the PRD', () => {
  assert.equal(bandForScore(100).id, 'strong');
  assert.equal(bandForScore(80).id, 'strong');
  assert.equal(bandForScore(79).id, 'good');
  assert.equal(bandForScore(60).id, 'good');
  assert.equal(bandForScore(59).id, 'needs_work');
  assert.equal(bandForScore(40).id, 'needs_work');
  assert.equal(bandForScore(39).id, 'critical');
  assert.equal(bandForScore(0).id, 'critical');
});

test('module percentages clamp to their max', () => {
  assert.equal(moduleScorePercent('gbp', 25), 100);
  assert.equal(moduleScorePercent('gbp', 30), 100);
  assert.equal(moduleScorePercent('reviews', 0), 0);
  assert.equal(moduleScorePercent('citations', 10), 50);
});

test('website URLs accept what an operator would type', () => {
  assert.equal(normalizeWebsiteUrl('sunrisemeadows.com').value, 'https://sunrisemeadows.com/');
  assert.equal(normalizeWebsiteUrl('  www.sunrisemeadows.com/  ').value, 'https://www.sunrisemeadows.com/');
  assert.equal(normalizeWebsiteUrl('http://sunrisemeadows.com/care#top').value, 'http://sunrisemeadows.com/care');
  assert.equal(normalizeWebsiteUrl('not a url').ok, false);
  assert.equal(normalizeWebsiteUrl('').ok, false);
});

test('zip codes accept ZIP+4 and keep the first five digits', () => {
  assert.equal(normalizeZipCode('30309').value, '30309');
  assert.equal(normalizeZipCode('30309-1234').value, '30309');
  assert.equal(normalizeZipCode('3030').ok, false);
});

test('NAP normalization tolerates formatting differences', () => {
  assert.equal(normalizePhone('(404) 555-0100'), '4045550100');
  assert.equal(normalizePhone('+1 404-555-0100'), '4045550100');
  assert.equal(normalizeAddress('123 N. Peachtree St, Ste 200'), '123 north peachtree street suite 200');
  assert.equal(normalizeBusinessName('Sunrise Meadows Senior Living, LLC'), 'sunrise meadows senior living');
  assert.equal(normalizeBusinessName("Mom's Place & Care Inc."), 'moms place and care');
});

test('care types are detected from page copy', () => {
  assert.deepEqual(detectCareTypes('We offer Memory Care and Assisted Living.').sort(), [
    'assisted_living',
    'memory_care',
  ]);
  // Curly apostrophes and casing must not defeat detection.
  assert.deepEqual(detectCareTypes('Specialized Alzheimer’s Care'), ['memory_care']);
  assert.deepEqual(detectCareTypes('We sell furniture.'), []);
});

test('a home care agency stays a home care agency even when it mentions facilities', () => {
  // A home care agency's own copy routinely names the facility-based levels of care
  // its clients are choosing between, which is exactly the wording that made a real
  // audit compare a home care agency against assisted living communities.
  assert.equal(
    pickPrimaryCareType(['assisted_living', 'memory_care', 'skilled_nursing', 'home_care']),
    'home_care',
  );
  assert.equal(pickPrimaryCareType(['respite_care', 'independent_living']), 'respite_care');
  // With no in-home signal, the first detected facility type wins.
  assert.equal(pickPrimaryCareType(['memory_care', 'assisted_living']), 'memory_care');
  assert.equal(pickPrimaryCareType([]), undefined);
});

test('care-type-specific directories only apply when relevant', () => {
  const ids = (careTypes: Parameters<typeof directoriesForCareTypes>[0]) =>
    directoriesForCareTypes(careTypes).map((directory) => directory.id);

  // Google is covered by Module A, so Module B never re-checks it.
  assert.ok(!ids(['assisted_living']).includes('google'));
  assert.ok(!ids(['assisted_living']).includes('medicare_gov'));
  assert.ok(ids(['skilled_nursing']).includes('medicare_gov'));
  assert.ok(ids(['memory_care']).includes('healthgrades'));
});

test('progress counts a running step as half done', () => {
  assert.equal(progressPercent([]), 0);
  assert.equal(
    progressPercent([
      { id: 'validate_site', label: '', status: 'done' },
      { id: 'read_website', label: '', status: 'running' },
      { id: 'google_listing', label: '', status: 'pending' },
      { id: 'listings', label: '', status: 'pending' },
    ]),
    38,
  );
  // Skipped and failed steps still count as complete: the audit moved past them.
  assert.equal(
    progressPercent([
      { id: 'validate_site', label: '', status: 'done' },
      { id: 'read_website', label: '', status: 'skipped' },
    ]),
    100,
  );
});
