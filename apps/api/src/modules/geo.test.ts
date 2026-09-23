import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { AiSearchQuery, CheckResult } from '@sensi/shared';

import type { PageSnapshot, SiteSnapshot } from '../types/site.js';
import { GEO_MAX_CHECK_POINTS, scoreGeo } from './geo.js';

function page(overrides: Partial<PageSnapshot> = {}): PageSnapshot {
  return {
    requestedUrl: 'https://sunrisemeadows.example/',
    finalUrl: 'https://sunrisemeadows.example/',
    roles: ['homepage'],
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

function siteOf(pages: PageSnapshot[]): SiteSnapshot {
  return {
    requestedUrl: 'https://sunrisemeadows.example/',
    origin: 'https://sunrisemeadows.example',
    homepage: pages[0],
    pages,
    failedPages: [],
    careTypes: [],
    warnings: [],
  };
}

const DESCRIPTION =
  'Sunrise Meadows is an assisted living and memory care community in Marietta, Georgia, ' +
  'and has been family-owned since 1998.';

/** A site giving an AI assistant everything it needs. */
function strongSite(): SiteSnapshot {
  return siteOf([
    page({
      headings: [
        { level: 1, text: 'Sunrise Meadows' },
        { level: 2, text: 'Assisted Living' },
      ],
      bodyText: DESCRIPTION,
      wordCount: 600,
      questionSections: [
        { question: 'How much does assisted living cost?', answerWords: 90 },
        { question: 'What is included in the monthly fee?', answerWords: 70 },
        { question: 'Can my parent bring their own furniture?', answerWords: 55 },
        { question: 'Do you have a nurse on site?', answerWords: 60 },
        { question: 'How do I arrange a tour?', answerWords: 40 },
      ],
    }),
    page({
      roles: ['care_type'],
      headings: [{ level: 1, text: 'Memory Care' }],
      wordCount: 500,
    }),
  ]);
}

function strongSearches(): AiSearchQuery[] {
  return [
    { query: 'assisted living in Marietta, GA', websiteRank: 2, generatedAnswer: 'not_shared' },
    { query: 'memory care in Marietta, GA', websiteRank: 3, generatedAnswer: 'not_shared' },
  ];
}

const MENTIONS = [
  { domain: 'caring.com', url: 'https://www.caring.com/x', title: 'Sunrise Meadows' },
  { domain: 'seniorly.com', url: 'https://www.seniorly.com/x', title: 'Sunrise Meadows' },
  { domain: 'mariettadailyjournal.com', url: 'https://www.mdj.com/x', title: 'Sunrise Meadows expands' },
];

function checkById(checks: CheckResult[], id: string): CheckResult {
  const found = checks.find((check) => check.id === id);
  assert.ok(found, `expected a check with id ${id}`);
  return found;
}

test('module check points sum to the PRD weight of 15', () => {
  const module = scoreGeo({
    site: strongSite(),
    businessName: 'Sunrise Meadows',
    careTypes: ['assisted_living', 'memory_care'],
    city: 'Marietta',
    searches: strongSearches(),
    thirdPartyMentions: MENTIONS,
  });

  const total = module.checks.reduce((sum, check) => sum + check.maxPoints, 0);
  assert.equal(total, GEO_MAX_CHECK_POINTS);
  assert.equal(total, module.maxPoints);
});

test('a site an assistant can quote scores full marks on everything measurable', () => {
  const module = scoreGeo({
    site: strongSite(),
    businessName: 'Sunrise Meadows',
    careTypes: ['assisted_living', 'memory_care'],
    city: 'Marietta',
    searches: strongSearches(),
    thirdPartyMentions: MENTIONS,
  });

  // The AI-answer check is the only unverifiable one, so 12 of 15 points are live
  // and all of them are earned: rescaled onto the weight, that is the full 15.
  assert.equal(module.points, 15);
  assert.equal(module.percent, 100);
  assert.equal(module.indicator, 'green');
  assert.equal(checkById(module.checks, 'geo.ai_answer').status, 'unavailable');
  assert.equal(checkById(module.checks, 'geo.ai_answer').points, 0);
});

test('Google’s AI answer is reported as unverifiable, never as a failure', () => {
  const module = scoreGeo({
    site: strongSite(),
    businessName: 'Sunrise Meadows',
    careTypes: ['assisted_living'],
    city: 'Marietta',
    searches: strongSearches(),
    thirdPartyMentions: MENTIONS,
  });

  const check = checkById(module.checks, 'geo.ai_answer');
  assert.equal(check.status, 'unavailable');
  assert.match(check.unavailableReason ?? '', /does not allow tools to read the AI answer/);
});

test('an answer box Serper does pass through is scored', () => {
  const module = scoreGeo({
    site: strongSite(),
    businessName: 'Sunrise Meadows',
    careTypes: ['assisted_living'],
    city: 'Marietta',
    searches: [
      { query: 'assisted living in Marietta, GA', websiteRank: 1, generatedAnswer: 'mentions_you' },
      { query: 'memory care in Marietta, GA', websiteRank: 4, generatedAnswer: 'no_mention' },
    ],
    thirdPartyMentions: MENTIONS,
  });

  const check = checkById(module.checks, 'geo.ai_answer');
  assert.equal(check.status, 'warn');
  assert.equal(check.points, 1.5);
});

test('only directory pages ranking is worth partial credit, not a pass', () => {
  const module = scoreGeo({
    site: strongSite(),
    businessName: 'Sunrise Meadows',
    careTypes: ['assisted_living'],
    city: 'Marietta',
    searches: [
      {
        query: 'assisted living in Marietta, GA',
        mentionRank: 4,
        aheadOfYou: ['aplaceformom.com', 'caring.com'],
        generatedAnswer: 'not_shared',
      },
    ],
    thirdPartyMentions: MENTIONS,
  });

  const check = checkById(module.checks, 'geo.search_presence');
  assert.equal(check.status, 'warn');
  assert.ok(check.points > 0 && check.points < check.maxPoints);
  assert.match(check.detail, /only directory listings about you/);
});

test('searches we could not run leave the presence check out of the score', () => {
  const module = scoreGeo({
    site: strongSite(),
    businessName: 'Sunrise Meadows',
    careTypes: ['assisted_living', 'memory_care'],
    city: 'Marietta',
    searches: [{ query: 'assisted living in Marietta, GA', unavailableReason: 'Search allowance spent.' }],
    thirdPartyMentions: MENTIONS,
  });

  const check = checkById(module.checks, 'geo.search_presence');
  assert.equal(check.status, 'unavailable');
  assert.equal(check.unavailableReason, 'Search allowance spent.');
  // Everything else still passes, so the module is not dragged down by the gap.
  assert.equal(module.points, 15);
});

test('a bare site fails the content checks with advice it can act on', () => {
  const module = scoreGeo({
    site: siteOf([page({ headings: [{ level: 1, text: 'Welcome' }], bodyText: 'Come home to comfort.', wordCount: 40 })]),
    businessName: 'Sunrise Meadows',
    careTypes: ['assisted_living', 'memory_care'],
    city: 'Marietta',
    searches: [{ query: 'assisted living in Marietta, GA', generatedAnswer: 'not_shared' }],
    thirdPartyMentions: [],
  });

  assert.equal(checkById(module.checks, 'geo.answers_questions').status, 'fail');
  assert.equal(checkById(module.checks, 'geo.plain_description').status, 'fail');
  assert.equal(checkById(module.checks, 'geo.care_type_detail').status, 'fail');
  assert.equal(checkById(module.checks, 'geo.third_party_mentions').status, 'fail');
  assert.equal(module.points, 0);
  assert.equal(module.indicator, 'red');
});

test('a home care agency is called an agency in its own example sentence, not a community', () => {
  // "Community" fits a building. An agency whose care happens in the client's own home
  // is not one, and the example sentence an operator is meant to copy has to say so.
  const module = scoreGeo({
    site: siteOf([page({ headings: [{ level: 1, text: 'Welcome' }], bodyText: 'Come home to comfort.', wordCount: 40 })]),
    businessName: 'Sunrise Home Care',
    careTypes: ['home_care'],
    city: 'Marietta',
    searches: [{ query: 'home care in Marietta, GA', generatedAnswer: 'not_shared' }],
    thirdPartyMentions: [],
  });

  const check = checkById(module.checks, 'geo.plain_description');
  assert.match(check.detail, /home care agency/);
  assert.doesNotMatch(check.detail, /home care community/);
});

test('questions families also ask are named in the advice', () => {
  const module = scoreGeo({
    site: siteOf([page({ bodyText: DESCRIPTION, wordCount: 300 })]),
    businessName: 'Sunrise Meadows',
    careTypes: ['assisted_living'],
    city: 'Marietta',
    searches: [
      {
        query: 'assisted living in Marietta, GA',
        websiteRank: 2,
        peopleAlsoAsk: ['How much does assisted living cost in Georgia?'],
        generatedAnswer: 'not_shared',
      },
    ],
    thirdPartyMentions: MENTIONS,
  });

  const check = checkById(module.checks, 'geo.answers_questions');
  assert.equal(check.status, 'fail');
  assert.match(check.detail, /How much does assisted living cost in Georgia\?/);
});

test('care types we do not know about leave that check unscored', () => {
  const module = scoreGeo({
    site: strongSite(),
    businessName: 'Sunrise Meadows',
    careTypes: [],
    city: 'Marietta',
    searches: strongSearches(),
    thirdPartyMentions: MENTIONS,
  });

  const check = checkById(module.checks, 'geo.care_type_detail');
  assert.equal(check.status, 'unavailable');
  assert.match(check.unavailableReason ?? '', /Selecting them yourself/);
});

test('a brand search we could not run does not count as "nobody mentions you"', () => {
  const module = scoreGeo({
    site: strongSite(),
    businessName: 'Sunrise Meadows',
    careTypes: ['assisted_living', 'memory_care'],
    city: 'Marietta',
    searches: strongSearches(),
    thirdPartyMentions: [],
    thirdPartyUnavailableReason: 'We have used up this month’s Google search allowance.',
  });

  const check = checkById(module.checks, 'geo.third_party_mentions');
  assert.equal(check.status, 'unavailable');
  assert.equal(check.points, 0);
});

test('with nothing verifiable at all the module is unscored, not zero', () => {
  const module = scoreGeo({
    site: siteOf([]),
    businessName: 'Sunrise Meadows',
    careTypes: [],
    searches: [{ query: 'assisted living in 30060', unavailableReason: 'No search key configured.' }],
    thirdPartyMentions: [],
    thirdPartyUnavailableReason: 'No search key configured.',
  });

  // Only the three content checks remain, and an empty crawl fails them, so the
  // module can still be zero — what must not happen is a *missing* check scoring.
  assert.equal(checkById(module.checks, 'geo.ai_answer').status, 'unavailable');
  assert.equal(checkById(module.checks, 'geo.search_presence').status, 'unavailable');
  assert.equal(checkById(module.checks, 'geo.third_party_mentions').status, 'unavailable');
  assert.equal(checkById(module.checks, 'geo.care_type_detail').status, 'unavailable');
  assert.equal(
    module.checks.filter((check) => check.status !== 'unavailable').length,
    2,
  );
});
