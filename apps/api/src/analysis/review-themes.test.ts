import assert from 'node:assert/strict';
import { test } from 'node:test';

import { analyzeReviews, type ReviewText } from './review-themes.js';

const REVIEWS: ReviewText[] = [
  {
    source: 'google',
    rating: 5,
    text: 'The staff here are so caring and kind. Mom loves the food and the dining room is beautiful.',
  },
  {
    source: 'google',
    rating: 5,
    text: 'Wonderful caring staff. The activities keep my father busy every day and the rooms are always clean.',
  },
  {
    source: 'google',
    rating: 2,
    text: 'Communication with management is poor. Nobody returned my call for a week and the staff seem understaffed.',
  },
  {
    source: 'yelp',
    rating: 3,
    text: 'The building is lovely but it is expensive for what you get. The food was disappointing.',
  },
];

test('themes are ranked by how often families mention them', () => {
  const themes = analyzeReviews(REVIEWS);
  const labels = themes.topics.map((topic) => topic.label);

  assert.ok(labels.includes('Staff and caregivers'), labels.join(', '));
  assert.ok(labels.includes('Food and dining'), labels.join(', '));
  // Mentions are counted per sentence, so the leading theme is the most-discussed one.
  const staff = themes.topics.find((topic) => topic.label === 'Staff and caregivers')!;
  assert.ok(staff.mentions >= 3, `staff mentions: ${staff.mentions}`);
});

test('a theme families complain about is marked negative and quoted', () => {
  const themes = analyzeReviews(REVIEWS);
  const management = themes.topics.find((topic) => topic.label === 'Communication and management');

  assert.ok(management, 'management theme missing');
  assert.equal(management.sentiment, 'negative');
  assert.match(management.exampleQuote ?? '', /communication with management is poor/i);
});

test('a positive theme keeps a positive verdict', () => {
  const themes = analyzeReviews(REVIEWS.slice(0, 2));
  const staff = themes.topics.find((topic) => topic.label === 'Staff and caregivers')!;
  assert.equal(staff.sentiment, 'positive');
  assert.equal(themes.overallSentiment, 'positive');
});

test('a negator flips the sentiment of the words after it', () => {
  const positive = analyzeReviews([{ source: 'google', rating: 3, text: 'The rooms are clean.' }]);
  const negative = analyzeReviews([{ source: 'google', rating: 3, text: 'The rooms are not clean.' }]);

  assert.equal(positive.topics[0]?.sentiment, 'positive');
  assert.equal(negative.topics[0]?.sentiment, 'negative');
});

test('keywords are the phrases families used, without filler words', () => {
  const themes = analyzeReviews(REVIEWS);
  const phrases = themes.keywords.map((keyword) => keyword.phrase);

  assert.ok(phrases.length > 0);
  assert.ok(
    phrases.some((phrase) => phrase.includes('staff')),
    phrases.join(' | '),
  );
  assert.ok(!phrases.some((phrase) => /^(the|and|with|for)\b/.test(phrase)), phrases.join(' | '));
  assert.ok(!phrases.some((phrase) => /\b(the|and|with|for)$/.test(phrase)), phrases.join(' | '));
});

test('the community’s own name is not reported back as customer language', () => {
  const themes = analyzeReviews(
    [
      {
        source: 'google',
        rating: 5,
        text: 'Cloverland Park is wonderful. The staff at Cloverland Park are kind. Cloverland Park cares.',
      },
      { source: 'google', rating: 5, text: 'We love Cloverland Park and the staff are kind.' },
    ],
    { businessName: 'Cloverland Park Senior Living' },
  );
  const phrases = themes.keywords.map((keyword) => keyword.phrase);

  assert.ok(!phrases.some((phrase) => /cloverland|park/.test(phrase)), phrases.join(' | '));
  assert.ok(
    phrases.some((phrase) => phrase.includes('staff')),
    phrases.join(' | '),
  );
});

test('a bare verdict is not a keyword, but the same word with a subject is', () => {
  const themes = analyzeReviews([
    { source: 'google', rating: 5, text: 'Great staff. Great staff again. Everyone is great.' },
    { source: 'google', rating: 5, text: 'Great staff here too. Everyone went out of their way.' },
  ]);
  const phrases = themes.keywords.map((keyword) => keyword.phrase);

  assert.ok(!phrases.includes('great'), phrases.join(' | '));
  assert.ok(!phrases.includes('everyone'), phrases.join(' | '));
  assert.ok(phrases.includes('great staff'), phrases.join(' | '));
});

test('a word that only ever appeared inside a longer phrase is dropped as a fragment', () => {
  const themes = analyzeReviews([
    { source: 'google', rating: 5, text: 'The front desk knew us. The front desk called back.' },
    { source: 'google', rating: 5, text: 'Front desk staff were kind. The front desk helped again.' },
  ]);
  const phrases = themes.keywords.map((keyword) => keyword.phrase);

  assert.ok(phrases.includes('front desk'), phrases.join(' | '));
  assert.ok(!phrases.includes('front'), phrases.join(' | '));
});

test('singular and plural are one keyword, in the spelling families used more', () => {
  const themes = analyzeReviews([
    { source: 'google', rating: 5, text: 'The residents are happy. The residents eat well.' },
    { source: 'google', rating: 5, text: 'Every resident is known by name. The residents go on outings.' },
  ]);
  const phrases = themes.keywords.map((keyword) => keyword.phrase);

  assert.ok(phrases.includes('residents'), phrases.join(' | '));
  assert.ok(!phrases.includes('resident'), phrases.join(' | '));
  assert.equal(themes.keywords.find((keyword) => keyword.phrase === 'residents')?.mentions, 4);
});

test('two topics quoting the same sentence do not print the same quote twice', () => {
  // This sentence belongs to "Quality of care" and "Activities and engagement" alike.
  const themes = analyzeReviews([
    {
      source: 'google',
      rating: 5,
      text:
        'Residents are supported in activities that promote their health. ' +
        'The care is attentive. The activities are varied and fun.',
    },
  ]);
  const quotes = themes.topics
    .map((topic) => topic.exampleQuote)
    .filter((quote): quote is string => Boolean(quote));

  assert.equal(new Set(quotes).size, quotes.length, quotes.join(' | '));
});

test('reviews with no text yield an empty panel rather than throwing', () => {
  const themes = analyzeReviews([{ source: 'google', rating: 5 }]);
  assert.deepEqual(themes.topics, []);
  assert.deepEqual(themes.keywords, []);
  assert.equal(themes.overallSentiment, 'positive');
});
