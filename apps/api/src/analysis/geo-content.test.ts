import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  answeredQuestions,
  careTypeCoverage,
  selfDescription,
  unansweredQuestions,
} from './geo-content.js';
import type { PageSnapshot, SiteSnapshot } from '../types/site.js';

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

function site(pages: PageSnapshot[]): SiteSnapshot {
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

const LONG_ANSWER =
  'Assisted living at Sunrise Meadows starts at three thousand nine hundred dollars a month, ' +
  'which covers the apartment, all three meals, housekeeping and the personal care your parent ' +
  'needs day to day, with no separate charge for medication management.';

/* -------------------------------------------------------------------------- */
/* Questions                                                                  */
/* -------------------------------------------------------------------------- */

test('a question with a real paragraph under it counts as answered', () => {
  const result = answeredQuestions(
    site([
      page({
        questionSections: [
          { question: 'How much does assisted living cost?', answerWords: 42 },
          { question: 'Do you accept Medicaid?', answerWords: 3 },
        ],
      }),
    ]),
  );

  assert.equal(result.asked.length, 2);
  assert.deepEqual(
    result.answered.map((section) => section.question),
    ['How much does assisted living cost?'],
  );
});

test('the same question on two pages is counted once', () => {
  const section = { question: 'What is memory care?', answerWords: 80 };
  const result = answeredQuestions(site([page({ questionSections: [section] }), page({ questionSections: [section] })]));

  assert.equal(result.asked.length, 1);
  assert.equal(result.answered.length, 1);
});

test('FAQ markup is counted across pages', () => {
  const result = answeredQuestions(
    site([
      page({
        structuredData: { types: ['FAQPage'], hasLocalBusiness: false, hasSeniorCareType: false, invalidBlocks: 0, faqQuestions: 4 },
      }),
      page({
        structuredData: { types: [], hasLocalBusiness: false, hasSeniorCareType: false, invalidBlocks: 0, faqQuestions: 2 },
      }),
    ]),
  );

  assert.equal(result.markedUp, 6);
});

test('a question asked in different words still counts as answered', () => {
  const unanswered = unansweredQuestions(
    site([page({ questionSections: [{ question: 'How much does memory care cost per month?', answerWords: 60 }] })]),
    ['What is the cost of memory care?', 'Does Medicare pay for assisted living?'],
  );

  assert.deepEqual(unanswered, ['Does Medicare pay for assisted living?']);
});

test('a question the site only asks, without answering, stays unanswered', () => {
  const unanswered = unansweredQuestions(
    site([page({ questionSections: [{ question: 'How much does memory care cost?', answerWords: 4 }] })]),
    ['How much does memory care cost?'],
  );

  assert.deepEqual(unanswered, ['How much does memory care cost?']);
});

/* -------------------------------------------------------------------------- */
/* The one quotable sentence                                                  */
/* -------------------------------------------------------------------------- */

test('a sentence naming the community, its care and its town is found', () => {
  const found = selfDescription(
    site([
      page({
        bodyText:
          'Come home to comfort. Sunrise Meadows is an assisted living community in Marietta, Georgia, serving families since 1998. Call today.',
      }),
    ]),
    { businessName: 'Sunrise Meadows', city: 'Marietta', careTypes: ['assisted_living'] },
  );

  assert.equal(found.namesBusiness, true);
  assert.equal(found.namesCareType, true);
  assert.equal(found.namesCity, true);
  assert.match(found.sentence ?? '', /^Sunrise Meadows is an assisted living community/);
});

test('facts scattered across separate sentences are not one quotable sentence', () => {
  // Everything an assistant needs is on the page — just never in one place.
  const found = selfDescription(
    site([
      page({
        bodyText:
          'Welcome to Sunrise Meadows, where every day is yours to shape. We offer assisted living and memory care with a warm heart. Proudly part of the Marietta community for over twenty years.',
      }),
    ]),
    { businessName: 'Sunrise Meadows', city: 'Marietta', careTypes: ['assisted_living'] },
  );

  assert.equal(
    [found.namesBusiness, found.namesCareType, found.namesCity].filter(Boolean).length < 3,
    true,
  );
});

test('a headline too short to quote is not treated as the description', () => {
  const found = selfDescription(
    site([page({ bodyText: 'Sunrise Meadows assisted living Marietta.' })]),
    { businessName: 'Sunrise Meadows', city: 'Marietta', careTypes: ['assisted_living'] },
  );

  assert.equal(found.sentence, undefined);
});

/* -------------------------------------------------------------------------- */
/* Care types described                                                       */
/* -------------------------------------------------------------------------- */

test('a care type with its own heading and real detail is described', () => {
  const coverage = careTypeCoverage(
    site([
      page({
        headings: [{ level: 1, text: 'Memory Care at Sunrise Meadows' }],
        bodyText: LONG_ANSWER,
        wordCount: 120,
      }),
    ]),
    ['memory_care'],
  );

  assert.equal(coverage[0]?.described, true);
  assert.equal(coverage[0]?.hasHeading, true);
});

test('a care type named in a heading but barely explained is not described', () => {
  const coverage = careTypeCoverage(
    site([page({ headings: [{ level: 2, text: 'Memory Care' }], wordCount: 20 })]),
    ['memory_care'],
  );

  assert.equal(coverage[0]?.hasHeading, true);
  assert.equal(coverage[0]?.described, false);
});

test('a care type mentioned only in body text has no heading of its own', () => {
  const coverage = careTypeCoverage(
    site([page({ headings: [{ level: 1, text: 'Our Community' }], bodyText: 'We also offer memory care.', wordCount: 400 })]),
    ['memory_care'],
  );

  assert.equal(coverage[0]?.hasHeading, false);
  assert.equal(coverage[0]?.described, false);
});

test('a nav menu running into a headline is not a quotable sentence', () => {
  // The live failure: bodyText glued a tracking-parameter list and a menu onto a real
  // headline, and the join named the community and its town without any page doing so.
  const glued =
    'Aline Market Source utm_campaign utm_medium Take a Virtual Tour Comforts & Conveniences ' +
    'The exclusive lifestyle programs at Sunrise Meadows set the stage for assisted living each day in Marietta, GA.';

  const found = selfDescription(
    site([
      page({
        bodyText: glued,
        textBlocks: [
          'Aline Market Source utm_campaign utm_medium',
          'Take a Virtual Tour',
          'Comforts & Conveniences',
          'The exclusive lifestyle programs at Sunrise Meadows set the stage for assisted living each day in Marietta, GA.',
        ],
      }),
    ]),
    { businessName: 'Sunrise Meadows', city: 'Marietta', careTypes: ['assisted_living'] },
  );

  // The real headline is found on its own, and the glued version is never offered.
  assert.match(found.sentence ?? '', /^The exclusive lifestyle programs/);
  assert.equal(found.sentence?.includes('utm_campaign'), false);
});
