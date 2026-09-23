import assert from 'node:assert/strict';
import { test } from 'node:test';

import { familyQueries, readMentions, readPlacement } from './ai-search.js';
import type { SerperOrganicResult } from './serper.js';

function result(position: number, link: string, title = 'A community'): SerperOrganicResult {
  return { position, link, title };
}

test('queries are written the way a family types them', () => {
  assert.deepEqual(
    familyQueries({ primaryCareType: 'memory_care', city: 'Marietta', state: 'GA', zipCode: '30060' }),
    ['memory care in Marietta, GA', 'dementia care in Marietta, GA'],
  );
});

test('with no city we search by zip rather than guessing a town', () => {
  assert.deepEqual(familyQueries({ primaryCareType: 'memory_care', zipCode: '30060' }), [
    'memory care in 30060',
    'dementia care in 30060',
  ]);
});

test('both searches stay on the one category the business actually competes in', () => {
  // This used to run the first two *detected* care types together, which is how a
  // home care agency ended up compared against assisted living communities — its own
  // page described the levels of care its clients were leaving. Both searches now
  // come from the single chosen category, just phrased two natural ways.
  const queries = familyQueries({
    primaryCareType: 'home_care',
    city: 'Marietta',
    state: 'GA',
    zipCode: '30060',
  });
  assert.deepEqual(queries, ['home care in Marietta, GA', 'senior home care in Marietta, GA']);
});

test('with nothing detected the search is generic, not a guess at a facility', () => {
  assert.deepEqual(familyQueries({ zipCode: '30060' }), ['senior care in 30060']);
});

test('the community’s own website is found by host, ignoring www', () => {
  const placement = readPlacement(
    [
      result(1, 'https://www.aplaceformom.com/marietta'),
      result(2, 'https://sunrisemeadows.example/assisted-living'),
    ],
    { websiteHost: 'sunrisemeadows.example', businessName: 'Sunrise Meadows' },
  );

  assert.equal(placement.websiteRank, 2);
  assert.deepEqual(placement.aheadOfYou, ['aplaceformom.com']);
});

test('a directory page about the community is recorded separately from its own site', () => {
  const placement = readPlacement(
    [
      result(1, 'https://www.caring.com/senior-living/sunrise-meadows', 'Sunrise Meadows - Caring.com'),
      result(2, 'https://www.brookdale.com/marietta', 'Brookdale Marietta'),
    ],
    { websiteHost: 'sunrisemeadows.example', businessName: 'Sunrise Meadows' },
  );

  assert.equal(placement.websiteRank, undefined);
  assert.equal(placement.mentionRank, 1);
  assert.equal(placement.aheadOfYou, undefined);
});

test('a competitor sharing one landscape word is not mistaken for the community', () => {
  // "Meadows" alone must not claim the listing — senior living names share vocabulary.
  const placement = readPlacement(
    [result(1, 'https://www.caring.com/x', 'The Meadows of Marietta - Caring.com')],
    { websiteHost: 'sunrisemeadows.example', businessName: 'Sunrise Meadows' },
  );

  assert.equal(placement.mentionRank, undefined);
  assert.equal(placement.websiteRank, undefined);
});

test('nothing found means nothing is reported as being ahead', () => {
  const placement = readPlacement([result(1, 'https://www.brookdale.com/x')], {
    websiteHost: 'sunrisemeadows.example',
    businessName: 'Sunrise Meadows',
  });

  assert.equal(placement.websiteRank, undefined);
  assert.deepEqual(placement.aheadOfYou, ['brookdale.com']);
});

test('a job board is not counted as a website talking about the community', () => {
  // It ranks for the community's name because of its open shifts and says nothing
  // about the care, so counting it would overstate how much the web corroborates.
  const mentions = readMentions(
    [
      result(1, 'https://www.indeed.com/q-sunrise-meadows-jobs.html', 'Sunrise Meadows jobs'),
      result(2, 'https://www.caring.com/senior-living/sunrise-meadows', 'Sunrise Meadows'),
    ],
    'sunrisemeadows.example',
  );

  assert.deepEqual(
    mentions.map((mention) => mention.domain),
    ['caring.com'],
  );
});

test('the community’s own site and repeat domains are counted once, or not at all', () => {
  const mentions = readMentions(
    [
      result(1, 'https://sunrisemeadows.example/about'),
      result(2, 'https://www.caring.com/a'),
      result(3, 'https://www.caring.com/b'),
      result(4, 'https://www.mariettadailyjournal.com/news/x'),
    ],
    'sunrisemeadows.example',
  );

  assert.deepEqual(
    mentions.map((mention) => mention.domain),
    ['caring.com', 'mariettadailyjournal.com'],
  );
});
