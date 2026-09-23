/**
 * Module E — AI Search Visibility (15 points, PRD 4.5).
 *
 * The question this module answers for an operator: if a family asks ChatGPT or
 * Google's AI for assisted living near them, is there anything about this community
 * for the answer to be built out of?
 *
 * An AI answer is assembled from pages that rank, that state facts plainly, and that
 * more than one site agrees on. So that is what we score — the ingredients, which the
 * operator controls, rather than one assistant's answer on one afternoon, which they
 * do not. See `analysis/geo-content.ts` for why we never ask the assistant itself.
 *
 * The one check that genuinely needs Google's own generated answer reports
 * "unable to verify": Serper does not pass AI Overviews through, and Google's
 * robots.txt disallows `/search`, which this tool respects (PRD 5.2). Its 3 points
 * leave the denominator rather than counting against anyone (PRD 5.4).
 */

import {
  CARE_TYPE_LABELS,
  type AiSearchQuery,
  type CareType,
  type CheckResult,
  type ModuleResult,
  type ThirdPartyMention,
} from '@sensi/shared';

import {
  answeredQuestions,
  careTypeCoverage,
  familyQuestions,
  selfDescription,
  unansweredQuestions,
  MIN_ANSWER_WORDS,
  MIN_CARE_TYPE_WORDS,
} from '../analysis/geo-content.js';
import { assembleModule, check } from '../scoring/assemble.js';
import type { SiteSnapshot } from '../types/site.js';

const MODULE = 'geo' as const;

/** Must equal the PRD weight for Module E. */
export const GEO_MAX_CHECK_POINTS = 15;

/** Questions answered on the site below this and the site is not answering families. */
const GOOD_ANSWER_COUNT = 5;

/** Independent sites talking about the community: enough for an answer to corroborate. */
const GOOD_MENTION_COUNT = 3;

export interface GeoInput {
  site: SiteSnapshot;
  businessName: string;
  careTypes: CareType[];
  city?: string;
  /** Family-style searches already run by the collector. */
  searches: AiSearchQuery[];
  thirdPartyMentions: ThirdPartyMention[];
  thirdPartyUnavailableReason?: string;
}

function roundHalf(value: number): number {
  return Math.round(value * 2) / 2;
}

/** "a, b and c" — read aloud by an operator, so no serial comma before "and". */
function joinWords(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/** Care delivered at the client's own home, so calling the business a "community" is wrong. */
const IN_HOME_CARE_TYPES: ReadonlySet<CareType> = new Set(['home_care', 'respite_care']);

/**
 * What to call the business in a copy-paste example sentence, from its own care types.
 *
 * "Community" fits a facility. It does not fit an agency whose care happens in someone
 * else's home — "home care community" is not a phrase anyone uses. Only when every
 * detected type is in-home does the noun change; a campus that also offers home care
 * alongside assisted living is still a community.
 */
function careTypePhraseFor(careTypes: CareType[]): string {
  if (!careTypes.length) return 'senior living community';
  const label = joinWords(careTypes.map((careType) => CARE_TYPE_LABELS[careType].toLowerCase()));
  const allInHome = careTypes.every((careType) => IN_HOME_CARE_TYPES.has(careType));
  return `${label} ${allInHome ? 'agency' : 'community'}`;
}

/** Searches that actually ran. A search we could not run is evidence of nothing. */
function ran(searches: AiSearchQuery[]): AiSearchQuery[] {
  return searches.filter((search) => !search.unavailableReason);
}

function searchReason(searches: AiSearchQuery[]): string {
  return (
    searches.find((search) => search.unavailableReason)?.unavailableReason ??
    'We could not run the searches families use, so this check was skipped.'
  );
}

/* -------------------------------------------------------------------------- */
/* The check Google will not let us make                                      */
/* -------------------------------------------------------------------------- */

function checkAiAnswer(searches: AiSearchQuery[]): CheckResult {
  const base = {
    id: 'geo.ai_answer',
    moduleId: MODULE,
    label: 'AI answers name your community',
    maxPoints: 3,
    whyItMatters:
      'More families are asking an assistant instead of scrolling results. Being named in the answer it writes is the new version of being on page one.',
  } as const;

  // Serper does return Google's answer box when one is shown, and that is a real
  // generated answer — but only for a minority of searches. When no search shows
  // one we cannot tell "you were left out" from "Google wrote nothing here", and
  // the AI Overview itself we are not able to read at all.
  const shown = ran(searches).filter((search) => search.generatedAnswer && search.generatedAnswer !== 'not_shared');

  if (!shown.length) {
    return check({
      ...base,
      status: 'unavailable',
      points: 0,
      detail: 'We could not read the AI answers Google writes for these searches.',
      unavailableReason:
        'Google does not allow tools to read the AI answer at the top of its results, so we cannot tell you whether it named you. The rest of this section measures whether your website gives an AI answer anything to quote — which is the part you control.',
      evidence: { searches: searches.map((search) => search.query) },
    });
  }

  const naming = shown.filter((search) => search.generatedAnswer === 'mentions_you');
  const share = naming.length / shown.length;

  return check({
    ...base,
    status: share >= 1 ? 'pass' : share > 0 ? 'warn' : 'fail',
    points: roundHalf(3 * share),
    detail: naming.length
      ? `Google's own answer named your community for ${naming.length} of the ${shown.length} search${shown.length === 1 ? '' : 'es'} we could read.`
      : `Google wrote an answer for ${shown.length === 1 ? 'this search' : 'these searches'} and did not name your community.`,
    evidence: {
      named: naming.map((search) => search.query),
      notNamed: shown.filter((search) => search.generatedAnswer === 'no_mention').map((search) => search.query),
    },
  });
}

/* -------------------------------------------------------------------------- */
/* Being findable at all                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Whether the community's own site comes up when a family searches the obvious way.
 *
 * This is the closest honest proxy for AI visibility we can measure: assistants read
 * the pages that rank. A directory page about the community counts for something —
 * the assistant can find the community — but through a page selling its competitors
 * on the same screen.
 */
function checkSearchPresence(searches: AiSearchQuery[]): CheckResult {
  const base = {
    id: 'geo.search_presence',
    moduleId: MODULE,
    label: 'Your own website comes up when families search',
    maxPoints: 3,
    whyItMatters:
      'AI assistants build their answers out of the pages that rank for the search. If only directories rank for care in your town, the answer is written from their pages, not yours.',
  } as const;

  const checked = ran(searches);
  if (!checked.length) {
    return check({
      ...base,
      status: 'unavailable',
      points: 0,
      detail: 'We could not run these searches.',
      unavailableReason: searchReason(searches),
    });
  }

  const score = (search: AiSearchQuery): number => {
    if (search.websiteRank !== undefined) return search.websiteRank <= 5 ? 1 : 0.6;
    // Found, but on somebody else's page.
    if (search.mentionRank !== undefined) return 0.3;
    return 0;
  };

  const share = checked.reduce((sum, search) => sum + score(search), 0) / checked.length;
  const ranking = checked.filter((search) => search.websiteRank !== undefined);
  const onlyMentioned = checked.filter(
    (search) => search.websiteRank === undefined && search.mentionRank !== undefined,
  );
  const absent = checked.filter(
    (search) => search.websiteRank === undefined && search.mentionRank === undefined,
  );

  const detail = ranking.length
    ? `Your website comes up for ${ranking.length} of ${checked.length} search${checked.length === 1 ? '' : 'es'} families use — best position ${Math.min(...ranking.map((search) => search.websiteRank!))}.${
        onlyMentioned.length
          ? ` For ${joinWords(onlyMentioned.map((search) => `“${search.query}”`))} only directory pages about you come up.`
          : ''
      }`
    : onlyMentioned.length
      ? `Your own website does not come up for ${checked.map((search) => `“${search.query}”`).join(' or ')} — only directory listings about you do, alongside your competitors.`
      : `Neither your website nor any page about you comes up for ${absent.map((search) => `“${search.query}”`).join(' or ')} in the first ten results.`;

  return check({
    ...base,
    status: share >= 0.75 ? 'pass' : share >= 0.3 ? 'warn' : 'fail',
    points: roundHalf(3 * share),
    detail,
    evidence: {
      searches: checked.map((search) => ({
        query: search.query,
        websiteRank: search.websiteRank,
        mentionRank: search.mentionRank,
        aheadOfYou: search.aheadOfYou?.slice(0, 5),
      })),
    },
  });
}

/* -------------------------------------------------------------------------- */
/* Content an answer can be built from                                        */
/* -------------------------------------------------------------------------- */

function checkAnswersQuestions(input: GeoInput): CheckResult {
  const base = {
    id: 'geo.answers_questions',
    moduleId: MODULE,
    label: 'Your website answers the questions families ask',
    maxPoints: 3,
    whyItMatters:
      'An assistant answers a family’s question by quoting a page that already answers it. A page of questions with a one-line reply under each gives it nothing to quote.',
  } as const;

  const { asked, answered, markedUp } = answeredQuestions(input.site);
  // Only the ones an operator could reasonably write about — Google mixes in whatever
  // else people search for near the same words.
  const alsoAsked = familyQuestions([
    ...new Set(ran(input.searches).flatMap((search) => search.peopleAlsoAsk ?? [])),
  ]);
  const unanswered = unansweredQuestions(input.site, alsoAsked);

  // FAQ markup is a real shortcut into AI answers, so it counts alongside prose.
  const strength = Math.min(1, (answered.length + Math.min(markedUp, GOOD_ANSWER_COUNT)) / GOOD_ANSWER_COUNT);

  const evidence = {
    answered: answered.slice(0, 10).map((section) => section.question),
    tooShort: asked
      .filter((section) => section.answerWords < MIN_ANSWER_WORDS)
      .slice(0, 10)
      .map((section) => ({ question: section.question, words: section.answerWords })),
    faqMarkup: markedUp,
    familiesAlsoAsk: unanswered.slice(0, 8),
  };

  if (!answered.length) {
    return check({
      ...base,
      status: 'fail',
      points: 0,
      detail: asked.length
        ? `Your website asks ${asked.length} question${asked.length === 1 ? '' : 's'} but answers none of them in more than a line or two. Answer each one in a short paragraph.${
            unanswered.length ? ` Families are also asking: “${unanswered[0]}”.` : ''
          }`
        : `Your website does not answer families’ questions anywhere.${
            unanswered.length
              ? ` Google says families searching for care near you also ask: ${unanswered
                  .slice(0, 3)
                  .map((question) => `“${question}”`)
                  .join(', ')}. A page answering those in full sentences is what an AI assistant quotes.`
              : ' A short FAQ page answering the questions you get on the phone is the quickest way in.'
          }`,
      evidence,
    });
  }

  const detail = `You answer ${answered.length} question${answered.length === 1 ? '' : 's'} in full${
    markedUp ? `, and ${markedUp} of them are marked up as an FAQ so assistants read them directly` : ''
  }.${
    unanswered.length
      ? ` Families near you also ask ${unanswered.length === 1 ? 'one question' : `${unanswered.length} questions`} you do not cover, starting with “${unanswered[0]}”.`
      : ''
  }`;

  return check({
    ...base,
    status: strength >= 1 && !unanswered.length ? 'pass' : strength >= 0.5 ? 'warn' : 'fail',
    points: roundHalf(3 * strength * (unanswered.length ? 0.85 : 1)),
    detail,
    evidence,
  });
}

function checkPlainDescription(input: GeoInput): CheckResult {
  const base = {
    id: 'geo.plain_description',
    moduleId: MODULE,
    label: 'One sentence says what you are and where',
    maxPoints: 2,
    whyItMatters:
      'An assistant needs a single sentence it can lift: “X is a home care agency serving Y.” Marketing copy that never says it plainly leaves it guessing.',
  } as const;

  const found = selfDescription(input.site, {
    businessName: input.businessName,
    careTypes: input.careTypes,
    ...(input.city ? { city: input.city } : {}),
  });

  const parts = [found.namesBusiness, found.namesCareType, found.namesCity].filter(Boolean).length;

  if (parts === 3) {
    return check({
      ...base,
      status: 'pass',
      points: 2,
      detail: 'Your website says plainly what your community is and where it is, in one quotable sentence.',
      evidence: { sentence: found.sentence },
    });
  }

  const missing = [
    found.namesBusiness ? undefined : 'your community’s name',
    found.namesCareType ? undefined : 'the type of care you provide',
    found.namesCity ? undefined : 'your town',
  ].filter((item): item is string => Boolean(item));

  // The example is written from this business's own care types, so an operator can
  // copy it straight onto the page.
  const careTypePhrase = careTypePhraseFor(input.careTypes);
  const article = /^[aeiou]/.test(careTypePhrase) ? 'an' : 'a';

  const problem =
    missing.length === 1
      ? `Your website never names ${missing[0]} in the same sentence as the rest of your details.`
      : `No single sentence on your website names ${joinWords(missing)} together.`;

  return check({
    ...base,
    status: parts >= 2 ? 'warn' : 'fail',
    points: roundHalf(2 * (parts / 3)),
    detail: `${problem} Add one near the top of your homepage — for example, “${input.businessName} is ${article} ${careTypePhrase} in ${input.city ?? 'your town'}.”`,
    evidence: { closest: found.sentence, namesMissing: missing },
  });
}

function checkCareTypeDetail(input: GeoInput): CheckResult {
  const base = {
    id: 'geo.care_type_detail',
    moduleId: MODULE,
    label: 'Each type of care has a page that explains it',
    maxPoints: 2,
    whyItMatters:
      'A family asks about home care, not about senior care in general. A heading with real detail underneath is what lets an assistant say you offer it.',
  } as const;

  if (!input.careTypes.length) {
    return check({
      ...base,
      status: 'unavailable',
      points: 0,
      detail: 'We do not know which types of care you offer.',
      unavailableReason:
        'We could not tell which types of care you provide, so we could not check whether each one is explained. Selecting them yourself will include this check.',
    });
  }

  const coverage = careTypeCoverage(input.site, input.careTypes);
  const described = coverage.filter((entry) => entry.described);
  const named = coverage.filter((entry) => entry.hasHeading && !entry.described);
  const absent = coverage.filter((entry) => !entry.hasHeading);
  const share = described.length / coverage.length;

  const evidence = {
    described: described.map((entry) => entry.label),
    tooThin: named.map((entry) => ({ label: entry.label, words: entry.words })),
    missing: absent.map((entry) => entry.label),
    minimumWords: MIN_CARE_TYPE_WORDS,
  };

  if (share === 1) {
    return check({
      ...base,
      status: 'pass',
      points: 2,
      detail: `Each type of care you offer — ${joinWords(described.map((entry) => entry.label))} — has a heading with real detail underneath.`,
      evidence,
    });
  }

  const problems = [
    absent.length
      ? `${joinWords(absent.map((entry) => entry.label))} ${absent.length === 1 ? 'has' : 'have'} no heading of ${absent.length === 1 ? 'its' : 'their'} own`
      : undefined,
    named.length
      ? `${joinWords(named.map((entry) => entry.label))} ${named.length === 1 ? 'is' : 'are'} named but barely explained`
      : undefined,
  ].filter(Boolean);

  return check({
    ...base,
    status: share >= 0.5 ? 'warn' : 'fail',
    points: roundHalf(2 * share),
    detail: `${problems.join(', and ')}. Give each one its own heading and a couple of paragraphs about who it suits and what a day looks like.`,
    evidence,
  });
}

function checkThirdPartyMentions(input: GeoInput): CheckResult {
  const base = {
    id: 'geo.third_party_mentions',
    moduleId: MODULE,
    label: 'Other websites talk about you',
    maxPoints: 2,
    whyItMatters:
      'Assistants trust a fact more when several independent sites say it. If your own website is the only place your community is described, there is nothing to confirm it against.',
  } as const;

  if (input.thirdPartyUnavailableReason) {
    return check({
      ...base,
      status: 'unavailable',
      points: 0,
      detail: 'We could not search for other sites mentioning you.',
      unavailableReason: input.thirdPartyUnavailableReason,
    });
  }

  const mentions = input.thirdPartyMentions;
  const share = Math.min(1, mentions.length / GOOD_MENTION_COUNT);

  if (mentions.length >= GOOD_MENTION_COUNT) {
    return check({
      ...base,
      status: 'pass',
      points: 2,
      detail: `${mentions.length} other website${mentions.length === 1 ? '' : 's'} come up for your community’s name, including ${mentions
        .slice(0, 3)
        .map((mention) => mention.domain)
        .join(', ')}.`,
      evidence: { mentions: mentions.slice(0, 10) },
    });
  }

  return check({
    ...base,
    status: mentions.length ? 'warn' : 'fail',
    points: roundHalf(2 * share),
    detail: mentions.length
      ? `Only ${mentions.length} other website${mentions.length === 1 ? '' : 's'} (${mentions
          .map((mention) => mention.domain)
          .join(', ')}) come up for your name. Claiming your directory listings and getting a mention in local news or a chamber of commerce page each add another source.`
      : 'Searching your community’s name brings up nothing but your own website. Claiming your listings on the senior care directories is the fastest way to change that.',
    evidence: { mentions },
  });
}

export function scoreGeo(input: GeoInput): ModuleResult {
  const checks: CheckResult[] = [
    checkAiAnswer(input.searches),
    checkSearchPresence(input.searches),
    checkAnswersQuestions(input),
    checkPlainDescription(input),
    checkCareTypeDetail(input),
    checkThirdPartyMentions(input),
  ];

  return assembleModule(MODULE, checks);
}
