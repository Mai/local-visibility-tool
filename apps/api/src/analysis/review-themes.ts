/**
 * Turns review text into the themes, sentiment and customer-language keywords the
 * results screen shows (PRD 4.2 Module D).
 *
 * Deliberately a dictionary-and-counting approach rather than a model call: it is
 * free, instant, offline-testable, and every number it reports can be traced back
 * to words a family actually wrote. Themes are the ones senior living operators
 * are judged on; the keyword panel shows the phrases families use so the operator
 * can echo them in their own copy.
 */

import type { ReviewThemes } from '@sensi/shared';

export interface ReviewText {
  source: 'google' | 'yelp' | 'a_place_for_mom';
  rating?: number;
  text?: string;
  publishedAt?: string;
}

/** Themes families talk about, with the words that signal each one. */
const THEMES: Array<{ label: string; terms: string[] }> = [
  {
    label: 'Staff and caregivers',
    terms: ['staff', 'caregiver', 'care giver', 'nurse', 'nursing', 'aide', 'caring', 'team', 'employees'],
  },
  {
    label: 'Quality of care',
    terms: ['care', 'attention', 'medication', 'medical', 'therapy', 'health', 'doctor', 'hospice'],
  },
  {
    label: 'Cleanliness and upkeep',
    terms: ['clean', 'cleanliness', 'spotless', 'smell', 'odor', 'dirty', 'maintenance', 'tidy'],
  },
  {
    label: 'Food and dining',
    terms: ['food', 'meal', 'dining', 'menu', 'chef', 'kitchen', 'breakfast', 'lunch', 'dinner'],
  },
  {
    label: 'Activities and engagement',
    terms: ['activity', 'activities', 'outing', 'entertainment', 'bingo', 'exercise', 'social', 'events'],
  },
  {
    label: 'Communication and management',
    terms: ['communication', 'communicate', 'management', 'director', 'administrator', 'responsive', 'return my call', 'called back', 'office'],
  },
  {
    label: 'Value and cost',
    terms: ['price', 'pricing', 'cost', 'expensive', 'affordable', 'value', 'fee', 'rent', 'billing'],
  },
  {
    label: 'Safety and security',
    terms: ['safe', 'safety', 'secure', 'security', 'fall', 'wander', 'emergency', 'call button'],
  },
  {
    label: 'Rooms and building',
    terms: ['room', 'apartment', 'facility', 'building', 'grounds', 'courtyard', 'patio', 'furniture', 'view'],
  },
  {
    label: 'Moving in',
    terms: ['move in', 'moved in', 'moving', 'tour', 'transition', 'paperwork', 'admission', 'welcomed'],
  },
];

const POSITIVE_WORDS = new Set([
  'amazing', 'attentive', 'beautiful', 'best', 'better', 'caring', 'clean', 'comfortable', 'compassionate',
  'delicious', 'excellent', 'exceptional', 'fantastic', 'friendly', 'good', 'grateful', 'great', 'happy',
  'helpful', 'highly', 'impressed', 'kind', 'lovely', 'love', 'loved', 'nice', 'outstanding', 'patient',
  'peace', 'perfect', 'pleased', 'professional', 'quick', 'recommend', 'respectful', 'responsive', 'safe',
  'thankful', 'thoughtful', 'warm', 'welcoming', 'wonderful',
]);

const NEGATIVE_WORDS = new Set([
  'awful', 'bad', 'complaint', 'concerned', 'confused', 'dirty', 'disappointed', 'disappointing',
  'disgusting', 'dreadful', 'expensive', 'filthy', 'horrible', 'ignored', 'inadequate', 'lacking',
  'late', 'lost', 'neglect', 'neglected', 'never', 'overpriced', 'poor', 'refused', 'rude', 'sad',
  'short', 'shortage', 'slow', 'smell', 'smelled', 'terrible', 'turnover', 'understaffed', 'unhappy',
  'unprofessional', 'unsafe', 'upset', 'worse', 'worst', 'wrong',
]);

const NEGATORS = new Set(['not', 'no', 'never', "wasn't", "isn't", "didn't", "doesn't", "wouldn't", 'nothing', 'hardly', 'barely']);

const STOPWORDS = new Set([
  'a', 'about', 'after', 'all', 'also', 'am', 'an', 'and', 'any', 'are', 'as', 'at', 'be', 'because',
  'been', 'being', 'but', 'by', 'can', 'could', 'did', 'do', 'does', 'even', 'for', 'from', 'get', 'got',
  'had', 'has', 'have', 'he', 'her', 'here', 'him', 'his', 'how', 'i', 'if', 'in', 'into', 'is', 'it',
  'its', 'just', 'me', 'more', 'most', 'much', 'my', 'no', 'not', 'of', 'on', 'one', 'or', 'our', 'out',
  'over', 'she', 'so', 'some', 'such', 'than', 'that', 'the', 'their', 'them', 'then', 'there', 'these',
  'they', 'this', 'to', 'too', 'up', 'us', 'very', 'was', 'we', 'were', 'what', 'when', 'where', 'which',
  'while', 'who', 'will', 'with', 'would', 'you', 'your',
  'along', 'although', 'ever', 'every', 'further', 'though', 'without',
  // Contractions of the words above; families type them constantly.
  "i've", "i'm", "it's", "that's", "there's", "they're", "they've", "we're", "we've", "you're",
]);

/**
 * Words that carry no meaning on their own in a keyword panel.
 *
 * The panel exists so an operator can echo the words families use in their own copy.
 * "great" on its own tells them nothing to write about — "great staff" does, and the
 * bigram survives because only single words are filtered here. Topical adjectives
 * families choose deliberately ("clean", "safe", "quiet") are not on this list.
 */
const WEAK_PHRASE_WORDS = new Set([
  'mom', 'dad', 'mother', 'father', 'place', 'thing', 'time', 'day', 'year', 'years',
  // Bare verdicts: praise with no subject.
  'great', 'good', 'nice', 'best', 'better', 'awesome', 'amazing', 'wonderful', 'excellent',
  'fantastic', 'incredible', 'perfect', 'terrible', 'awful', 'horrible', 'worst',
  'love', 'loved', 'loves', 'like', 'liked', 'hate', 'hated',
  // Pronouns and quantifiers that survive the stopword list as phrase edges.
  'everyone', 'everybody', 'everything', 'anyone', 'anything', 'someone', 'something', 'both',
  'other', 'others', 'another', 'each', 'same', 'else', 'sure', 'really', 'always', 'never',
  'still', 'again', 'enough', 'able', 'well',
  // Verbs of narration: every review has them, none is a subject to write about.
  'went', 'come', 'came', 'take', 'took', 'make', 'made', 'said', 'told', 'know', 'knew',
  'think', 'thought', 'feel', 'felt', 'want', 'wanted', 'need', 'needed', 'seem', 'seemed',
  'look', 'looked', 'give', 'gave', 'find', 'found', 'made', 'being',
]);

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function sentencesOf(text: string): string[] {
  return normalize(text)
    .split(/(?<=[.!?])\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function wordsOf(text: string): string[] {
  return normalize(text)
    .split(/[^a-z']+/)
    .filter(Boolean);
}

/**
 * Sentiment of one sentence: lexicon balance, flipped by a preceding negator
 * ("not clean"), with the review's star rating as the tie-breaker.
 */
function sentenceSentiment(sentence: string, rating: number | undefined): 'positive' | 'mixed' | 'negative' {
  const words = wordsOf(sentence);
  let score = 0;

  words.forEach((word, index) => {
    const previous = index > 0 ? words[index - 1] : undefined;
    const negated = previous !== undefined && NEGATORS.has(previous);
    if (POSITIVE_WORDS.has(word)) score += negated ? -1 : 1;
    else if (NEGATIVE_WORDS.has(word)) score += negated ? 1 : -1;
  });

  if (score > 0) return 'positive';
  if (score < 0) return 'negative';
  if (rating === undefined) return 'mixed';
  if (rating >= 4) return 'positive';
  if (rating <= 2) return 'negative';
  return 'mixed';
}

function verdict(positive: number, negative: number): 'positive' | 'mixed' | 'negative' {
  const total = positive + negative;
  if (!total) return 'mixed';
  const share = positive / total;
  if (share >= 0.7) return 'positive';
  if (share <= 0.3) return 'negative';
  return 'mixed';
}

/** Trims a quote to something printable in a report card. */
function trimQuote(sentence: string, maxLength = 160): string {
  const cleaned = sentence.replace(/^["'\s]+|["'\s]+$/g, '');
  const capitalized = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  if (capitalized.length <= maxLength) return capitalized;
  return `${capitalized.slice(0, maxLength - 1).trimEnd()}…`;
}

/** Frequent 1–3 word phrases, in the words families actually used. */
function extractKeywords(
  reviews: ReviewText[],
  businessName?: string,
): Array<{ phrase: string; mentions: number }> {
  const counts = new Map<string, { mentions: number; reviews: Set<number> }>();
  // Families name the community constantly. "Cloverland Park" topping the panel is
  // not customer language the operator could put to any use on their website.
  const nameWords = new Set(businessName ? wordsOf(businessName).filter((word) => word.length >= 3) : []);

  reviews.forEach((review, reviewIndex) => {
    if (!review.text) return;
    for (const sentence of sentencesOf(review.text)) {
      const words = wordsOf(sentence);
      for (let size = 1; size <= 3; size += 1) {
        for (let start = 0; start + size <= words.length; start += 1) {
          const gram = words.slice(start, start + size);
          const first = gram[0]!;
          const last = gram[gram.length - 1]!;
          // A useful phrase does not start or end on a filler word.
          if (STOPWORDS.has(first) || STOPWORDS.has(last)) continue;
          if (gram.some((word) => word.length < 3)) continue;
          if (size === 1 && (WEAK_PHRASE_WORDS.has(first) || first.length < 4)) continue;
          if (gram.some((word) => nameWords.has(word))) continue;

          const phrase = gram.join(' ');
          const entry = counts.get(phrase) ?? { mentions: 0, reviews: new Set<number>() };
          entry.mentions += 1;
          entry.reviews.add(reviewIndex);
          counts.set(phrase, entry);
        }
      }
    }
  });

  // "resident" and "residents" are one piece of customer language, and two rows of it
  // reads as a bug. The spelling families used more often is the one we show.
  for (const [phrase, entry] of [...counts.entries()]) {
    if (!phrase.endsWith('s')) continue;
    const singular = phrase.slice(0, -1);
    const other = counts.get(singular);
    if (!other) continue;
    const [keep, keepEntry, dropKey] =
      other.mentions >= entry.mentions ? [singular, other, phrase] : [phrase, entry, singular];
    const merged = keep === phrase ? other : entry;
    keepEntry.mentions += merged.mentions;
    merged.reviews.forEach((reviewIndex) => keepEntry.reviews.add(reviewIndex));
    counts.set(keep, keepEntry);
    counts.delete(dropKey);
  }

  const entries = [...counts.entries()];
  // One floor: a phrase has to have been used twice. One-off wordings would fill the
  // panel with sentence fragments from whichever review happened to be longest. Within
  // that, a phrase two different families reached for outranks one family's favourite —
  // ranking by spread rather than filtering on it keeps a short review set from emptying
  // the panel.
  const repeated = entries.filter(([, entry]) => entry.mentions >= 2);
  const pool = repeated.length ? repeated : entries;

  const contains = (longer: string, shorter: string): boolean =>
    longer.length > shorter.length && ` ${longer} `.includes(` ${shorter} `);

  const ranked = pool
    .map(([phrase, entry]) => ({ phrase, mentions: entry.mentions, families: entry.reviews.size }))
    .sort(
      (a, b) =>
        b.families - a.families ||
        b.mentions - a.mentions ||
        b.phrase.split(' ').length - a.phrase.split(' ').length,
    );

  const kept: Array<{ phrase: string; mentions: number }> = [];
  for (const candidate of ranked) {
    // A word families mostly used inside a longer phrase is a fragment of that phrase,
    // not language of its own: two of the three "front"s were "front desk", and "front"
    // beside it reads as padding. The longer phrase has to clear the same twice-used
    // floor, so one passing mention of "residents to take" cannot bury "residents".
    const buried = [...counts].some(
      ([longer, entry]) =>
        entry.mentions >= 2 &&
        contains(longer, candidate.phrase) &&
        entry.mentions * 2 >= candidate.mentions,
    );
    if (buried) continue;
    kept.push({ phrase: candidate.phrase, mentions: candidate.mentions });
    if (kept.length === 15) break;
  }

  return kept;
}

export interface AnalyzeReviewsOptions {
  /** The community's own name, so the keyword panel does not just report it back. */
  businessName?: string;
}

/**
 * Themes, sentiment and keywords for a set of reviews. Pure: same input, same
 * output, so the whole panel is unit-tested against fixture reviews.
 */
export function analyzeReviews(reviews: ReviewText[], options: AnalyzeReviewsOptions = {}): ReviewThemes {
  const withText = reviews.filter((review) => review.text?.trim());

  interface Candidate {
    text: string;
    sentiment: 'positive' | 'mixed' | 'negative';
  }
  const tallies = new Map<
    string,
    { mentions: number; positive: number; negative: number; candidates: Candidate[] }
  >();

  let positiveSentences = 0;
  let negativeSentences = 0;

  for (const review of withText) {
    for (const sentence of sentencesOf(review.text!)) {
      const sentiment = sentenceSentiment(sentence, review.rating);
      if (sentiment === 'positive') positiveSentences += 1;
      if (sentiment === 'negative') negativeSentences += 1;

      for (const theme of THEMES) {
        if (!theme.terms.some((term) => sentence.includes(term))) continue;

        const tally = tallies.get(theme.label) ?? { mentions: 0, positive: 0, negative: 0, candidates: [] };
        tally.mentions += 1;
        if (sentiment === 'positive') tally.positive += 1;
        if (sentiment === 'negative') tally.negative += 1;
        tally.candidates.push({ text: trimQuote(sentence), sentiment });

        tallies.set(theme.label, tally);
      }
    }
  }

  const ranked = [...tallies.entries()]
    .map(([label, tally]) => ({
      label,
      mentions: tally.mentions,
      sentiment: verdict(tally.positive, tally.negative),
      candidates: tally.candidates,
    }))
    .sort((a, b) => b.mentions - a.mentions)
    .slice(0, 8);

  // A sentence that mentions care *and* activities is a fair example of either, but
  // printing it twice reads as a bug. Each topic takes the best quote nobody above it
  // has used — a negative one first, since that is the one the operator needs to read.
  const used = new Set<string>();
  const topics = ranked.map(({ label, mentions, sentiment, candidates }) => {
    const unused = candidates.filter((candidate) => !used.has(candidate.text));
    const pool = unused.length ? unused : candidates;
    const quote = pool.find((candidate) => candidate.sentiment === 'negative') ?? pool[0];
    if (quote) used.add(quote.text);

    return {
      label,
      mentions,
      sentiment,
      ...(quote ? { exampleQuote: quote.text } : {}),
    };
  });

  const ratings = reviews
    .map((review) => review.rating)
    .filter((rating): rating is number => typeof rating === 'number');
  const averageRating = ratings.length
    ? ratings.reduce((total, rating) => total + rating, 0) / ratings.length
    : undefined;

  const themes: ReviewThemes = { topics, keywords: extractKeywords(withText, options.businessName) };

  if (positiveSentences + negativeSentences > 0) {
    themes.overallSentiment = verdict(positiveSentences, negativeSentences);
  } else if (averageRating !== undefined) {
    themes.overallSentiment = averageRating >= 4 ? 'positive' : averageRating <= 2 ? 'negative' : 'mixed';
  }

  return themes;
}
