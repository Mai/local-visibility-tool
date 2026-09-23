/**
 * Reads a website the way an AI assistant reads it (Module E, PRD 4.5).
 *
 * We deliberately do not ask an AI assistant whether it recommends this community.
 * The answer would change between two runs an hour apart, it would cost money per
 * audit, and an operator cannot act on "Perplexity did not mention you". What they
 * can act on is the structure of their own pages, which is what decides whether an
 * assistant has anything quotable to lift:
 *
 * - a sentence that plainly says what this place is and where it is,
 * - questions families actually ask, answered underneath in full sentences,
 * - each type of care described in its own words rather than listed in a menu.
 *
 * Every function here is pure and reads only the crawled snapshot, so the same site
 * always scores the same.
 */

import { CARE_TYPE_KEYWORDS, CARE_TYPE_LABELS, normalizeForKeywordMatch, type CareType } from '@sensi/shared';

import type { PageSnapshot, QuestionSection, SiteSnapshot } from '../types/site.js';

/** An answer shorter than this is a label, not something an assistant can quote. */
export const MIN_ANSWER_WORDS = 25;

/** Below this, a care type is named but not described. */
export const MIN_CARE_TYPE_WORDS = 60;

/* -------------------------------------------------------------------------- */
/* Questions and answers                                                      */
/* -------------------------------------------------------------------------- */

export interface AnsweredQuestions {
  /** Question headings found anywhere on the crawled pages. */
  asked: QuestionSection[];
  /** Those with enough text under them to be worth quoting. */
  answered: QuestionSection[];
  /** FAQPage questions in structured data, which assistants read directly. */
  markedUp: number;
}

export function answeredQuestions(site: SiteSnapshot): AnsweredQuestions {
  const seen = new Set<string>();
  const asked: QuestionSection[] = [];

  for (const page of site.pages) {
    for (const section of page.questionSections) {
      const key = section.question.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      asked.push(section);
    }
  }

  return {
    asked,
    answered: asked.filter((section) => section.answerWords >= MIN_ANSWER_WORDS),
    markedUp: site.pages.reduce((sum, page) => sum + (page.structuredData.faqQuestions ?? 0), 0),
  };
}

/**
 * Words that make a "people also ask" question one this operator could answer.
 *
 * Google returns whatever else people type after a search, which for "memory care in
 * Brentwood, TN" included "What celebrity lives in Brentwood, TN?". Telling an
 * operator to write about that would be advice they should ignore, and one piece of
 * obviously silly advice costs us the benefit of the doubt on the other twenty.
 */
const FAMILY_QUESTION_WORDS = [
  'senior', 'seniors', 'elder', 'elderly', 'aging', 'age', 'care', 'caregiver', 'caregiving',
  'assisted', 'living', 'memory', 'dementia', 'alzheimer', 'alzheimers', 'nursing', 'hospice',
  'respite', 'independent', 'retirement', 'facility', 'facilities', 'community', 'communities',
  'home', 'cost', 'costs', 'price', 'pricing', 'afford', 'pay', 'paying', 'medicare', 'medicaid',
  'insurance', 'benefits', 'veteran', 'veterans', 'income', 'month', 'monthly', 'mom', 'dad',
  'parent', 'parents', 'mother', 'father', 'resident', 'residents', 'nurse', 'nurses', 'staff',
  'tour', 'move', 'moving', 'admission', 'admissions', 'level', 'levels', 'difference',
];

/** Questions a family asking about senior care would recognise as being about care. */
export function familyQuestions(questions: string[]): string[] {
  return questions.filter((question) => {
    const words = new Set(significantWords(question));
    return FAMILY_QUESTION_WORDS.some((word) => words.has(word));
  });
}

/**
 * Questions Google says people also ask that this site does not address.
 *
 * Matching is on the significant words of the question, not the wording: "How much
 * does memory care cost?" answers "What is the cost of memory care?".
 */
export function unansweredQuestions(
  site: SiteSnapshot,
  peopleAlsoAsk: string[],
): string[] {
  const covered = answeredQuestions(site).answered.map((section) =>
    new Set(significantWords(section.question)),
  );

  return peopleAlsoAsk.filter((question) => {
    const words = significantWords(question);
    if (!words.length) return false;
    // Two thirds of the asking words present is the same question in other words.
    return !covered.some((answer) => {
      const shared = words.filter((word) => answer.has(word)).length;
      return shared / words.length >= 0.67;
    });
  });
}

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'you', 'your', 'are', 'can', 'does', 'did', 'how', 'what', 'when', 'where',
  'which', 'who', 'why', 'with', 'that', 'this', 'from', 'about', 'into', 'much', 'many', 'there',
  'have', 'has', 'get', 'its', 'their', 'they', 'them', 'will', 'would', 'should', 'could', 'was',
  'were', 'been', 'being', 'not', 'but', 'per',
]);

function significantWords(text: string): string[] {
  return [
    ...new Set(
      normalizeForKeywordMatch(text)
        .split(/[^a-z0-9]+/)
        .filter((word) => word.length > 2 && !STOP_WORDS.has(word)),
    ),
  ];
}

/* -------------------------------------------------------------------------- */
/* "What this place is, and where"                                            */
/* -------------------------------------------------------------------------- */

export interface SelfDescription {
  /** The sentence that says what the community is and where. */
  sentence?: string;
  namesBusiness: boolean;
  namesCareType: boolean;
  namesCity: boolean;
}

/**
 * The one sentence an assistant needs: "Cloverland Park is an assisted living and
 * memory care community in Brentwood, Tennessee."
 *
 * Sites often carry all three facts — name, care type, city — spread across a hero
 * image, a footer and a page title, where nothing can quote them together.
 */
export function selfDescription(
  site: SiteSnapshot,
  context: { businessName: string; city?: string; careTypes: CareType[] },
): SelfDescription {
  const nameWords = significantWords(context.businessName);
  const cityWords = context.city ? significantWords(context.city) : [];
  const careKeywords = (context.careTypes.length
    ? context.careTypes
    : (Object.keys(CARE_TYPE_KEYWORDS) as CareType[])
  ).flatMap((careType) => CARE_TYPE_KEYWORDS[careType].map(normalizeForKeywordMatch));

  let best: SelfDescription = {
    namesBusiness: false,
    namesCareType: false,
    namesCity: false,
  };

  for (const page of site.pages) {
    for (const sentence of pageSentences(page)) {
      const haystack = normalizeForKeywordMatch(sentence);
      const found: SelfDescription = {
        sentence,
        namesBusiness: nameWords.length > 0 && nameWords.every((word) => haystack.includes(word)),
        namesCareType: careKeywords.some((keyword) => haystack.includes(keyword)),
        namesCity: cityWords.length > 0 && cityWords.every((word) => haystack.includes(word)),
      };

      if (found.namesBusiness && found.namesCareType && found.namesCity) return found;
      if (score(found) > score(best)) best = found;
    }
  }

  return best;
}

function score(description: SelfDescription): number {
  return (
    Number(description.namesBusiness) +
    Number(description.namesCareType) +
    Number(description.namesCity)
  );
}

/**
 * Every sentence on the page, read one block element at a time.
 *
 * Reading `bodyText` instead would invent sentences: it joins blocks with a space, so
 * a footer menu, a nav label and a headline run together into a 50-word "sentence"
 * that ends with a full stop and names the community, its town and its care — none of
 * which an assistant could ever quote, because it exists nowhere on the page.
 */
function pageSentences(page: PageSnapshot): string[] {
  const blocks = page.textBlocks.length ? page.textBlocks : [page.bodyText];
  return blocks.flatMap((block) => sentences(block));
}

/** Sentences worth considering: long enough to be prose, short enough to quote. */
function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => {
      const words = sentence.split(/\s+/).length;
      return words >= 6 && words <= 60;
    });
}

/* -------------------------------------------------------------------------- */
/* Care types described, not just listed                                      */
/* -------------------------------------------------------------------------- */

export interface CareTypeCoverage {
  careType: CareType;
  label: string;
  /** A heading names this care type. */
  hasHeading: boolean;
  /** Words on the page whose heading names it — how much is actually said. */
  words: number;
  described: boolean;
}

export function careTypeCoverage(site: SiteSnapshot, careTypes: CareType[]): CareTypeCoverage[] {
  return careTypes.map((careType) => {
    const keywords = CARE_TYPE_KEYWORDS[careType].map(normalizeForKeywordMatch);
    const names = (text: string): boolean => {
      const haystack = normalizeForKeywordMatch(text);
      return keywords.some((keyword) => haystack.includes(keyword));
    };

    const pages = site.pages.filter((page) =>
      page.headings.some((heading) => names(heading.text)),
    );
    // A dedicated page beats a mention in a list: count only pages that head with it.
    const words = pages.reduce((sum, page) => sum + page.wordCount, 0);

    return {
      careType,
      label: CARE_TYPE_LABELS[careType],
      hasHeading: pages.length > 0,
      words,
      described: pages.length > 0 && words >= MIN_CARE_TYPE_WORDS,
    };
  });
}
