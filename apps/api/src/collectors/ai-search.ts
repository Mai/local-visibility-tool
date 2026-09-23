/**
 * The searches behind Module E: where a community places when a family searches the
 * way families search, and who else the web says is talking about it.
 *
 * Two things this deliberately does not do.
 *
 * We do not call an AI assistant and ask whether it recommends the community. The
 * PRD rules it out, and it is the right call: the answer is different an hour later,
 * it costs money on every audit, and no operator can act on it.
 *
 * We do not scrape Google's own result page for its AI Overview either. Google's
 * robots.txt disallows `/search`, and respecting robots.txt is a binding constraint
 * on this tool (PRD 5.2) — one we are not going to keep for other people's sites and
 * break for Google's. Serper is a licensed SERP API and does not pass the AI Overview
 * through, so that check reports "unable to verify" and its points leave the
 * denominator (PRD 5.4). What Serper does give us is real: the ranked results an
 * assistant reads before it answers, and the questions Google says people also ask.
 */

import type { AiSearchQuery, CareType, ThirdPartyMention } from '@sensi/shared';
import { CARE_TYPE_FAMILY_QUERY_TERMS } from '@sensi/shared';

import { logger } from '../lib/logger.js';
import { serperSearch, type SerperOrganicResult } from './serper.js';

/** Results we look through per query. Enough to see the first page of Google. */
const RESULT_COUNT = 10;

/**
 * Domains that rank for a community's name without saying anything about it.
 *
 * A job board carries the community's open shifts, not a description of its care, so
 * counting one as a source that corroborates the community would overstate the
 * evidence — and an operator reading "indeed.com talks about you" would rightly
 * wonder what else we had counted loosely.
 */
const NOT_ABOUT_THE_BUSINESS = new Set([
  'indeed.com',
  'ziprecruiter.com',
  'glassdoor.com',
  'simplyhired.com',
  'monster.com',
  'careerbuilder.com',
  'snagajob.com',
  'salary.com',
  'jobs.net',
]);

export interface AiSearchOptions {
  businessName: string;
  websiteUrl: string;
  /** Which category to search as. Omitted only when nothing could be detected. */
  primaryCareType?: CareType;
  city?: string;
  state?: string;
  zipCode: string;
  refresh?: boolean;
}

function hostOf(url: string): string | undefined {
  try {
    return new URL(url).hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return undefined;
  }
}

/**
 * The searches a family runs, two ways of phrasing the one category the business
 * actually competes in. Capped at two to keep the audit inside the free search
 * allowance even when an operator re-runs it.
 */
export function familyQueries(
  options: Pick<AiSearchOptions, 'primaryCareType' | 'city' | 'state' | 'zipCode'>,
): string[] {
  const place = [options.city, options.state].filter(Boolean).join(', ') || options.zipCode;
  const terms = options.primaryCareType
    ? CARE_TYPE_FAMILY_QUERY_TERMS[options.primaryCareType]
    : ['senior care'];
  return terms.map((term) => `${term} in ${place}`);
}

/**
 * Where the community sits in one set of results.
 *
 * Its own website ranking is the strong signal. A directory page about it is worth
 * recording separately: it means an assistant can find the community, but through
 * somebody else's page, and A Place for Mom will not be selling this community
 * exclusively.
 */
export function readPlacement(
  results: SerperOrganicResult[],
  options: { websiteHost?: string; businessName: string },
): Pick<AiSearchQuery, 'websiteRank' | 'mentionRank' | 'aheadOfYou'> {
  const nameWords = options.businessName
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 3);

  let websiteRank: number | undefined;
  let mentionRank: number | undefined;

  results.forEach((result, index) => {
    const rank = result.position ?? index + 1;
    const host = hostOf(result.link);

    if (options.websiteHost && host === options.websiteHost) {
      websiteRank ??= rank;
      return;
    }

    const haystack = `${result.title} ${result.snippet ?? ''} ${result.link}`.toLowerCase();
    // Every word of the name, so "Cloverland Park" is not matched by "park".
    if (nameWords.length && nameWords.every((word) => haystack.includes(word))) {
      mentionRank ??= rank;
    }
  });

  const ourRank = websiteRank ?? mentionRank;
  const aheadOfYou = results
    .filter((result, index) => (result.position ?? index + 1) < (ourRank ?? Number.MAX_SAFE_INTEGER))
    .map((result) => hostOf(result.link))
    .filter((host): host is string => Boolean(host));

  return {
    ...(websiteRank === undefined ? {} : { websiteRank }),
    ...(mentionRank === undefined ? {} : { mentionRank }),
    ...(aheadOfYou.length ? { aheadOfYou: [...new Set(aheadOfYou)] } : {}),
  };
}

/** Runs the family-style searches. One Serper call each, cached 24h. */
export async function runFamilySearches(options: AiSearchOptions): Promise<AiSearchQuery[]> {
  const websiteHost = hostOf(options.websiteUrl);
  const location =
    options.city && options.state ? `${options.city}, ${options.state}, United States` : undefined;

  const queries = familyQueries(options);
  const searches: AiSearchQuery[] = [];

  for (const query of queries) {
    const outcome = await serperSearch(query, {
      num: RESULT_COUNT,
      ...(location ? { location } : {}),
      ...(options.refresh === undefined ? {} : { refresh: options.refresh }),
    });

    if (!outcome.ok) {
      searches.push({ query, unavailableReason: outcome.reason });
      continue;
    }

    const peopleAlsoAsk = (outcome.raw.peopleAlsoAsk ?? [])
      .map((entry) => entry.question)
      .filter((question): question is string => Boolean(question));

    // Serper passes an answer box through when Google shows one. An AI Overview it
    // cannot pass through at all, which is a different thing from Google not showing
    // one — so say "not shared" rather than implying the community was left out.
    const answerText = JSON.stringify(outcome.raw.answerBox ?? outcome.raw.knowledgeGraph ?? '');
    const generatedAnswer: AiSearchQuery['generatedAnswer'] =
      answerText && answerText !== '""'
        ? answerText.toLowerCase().includes(options.businessName.toLowerCase())
          ? 'mentions_you'
          : 'no_mention'
        : 'not_shared';

    searches.push({
      query,
      ...readPlacement(outcome.results, {
        ...(websiteHost ? { websiteHost } : {}),
        businessName: options.businessName,
      }),
      ...(peopleAlsoAsk.length ? { peopleAlsoAsk } : {}),
      generatedAnswer,
    });
  }

  logger.info('Family searches complete', {
    queries: queries.length,
    ranked: searches.filter((search) => search.websiteRank !== undefined).length,
  });

  return searches;
}

export interface ThirdPartyOutcome {
  mentions: ThirdPartyMention[];
  unavailableReason?: string;
}

/**
 * The results that count as another site talking about this community: one per
 * domain, excluding the community's own site and the boards that rank for its name
 * without describing it.
 */
export function readMentions(
  results: SerperOrganicResult[],
  websiteHost?: string,
): ThirdPartyMention[] {
  const mentions: ThirdPartyMention[] = [];
  const seen = new Set<string>();

  for (const result of results) {
    const domain = hostOf(result.link);
    if (!domain || domain === websiteHost || seen.has(domain)) continue;
    if (NOT_ABOUT_THE_BUSINESS.has(domain)) continue;
    // Their own other domains are still their own marketing, but we cannot tell those
    // apart from genuine third parties, so the count stays a floor rather than exact.
    seen.add(domain);
    mentions.push({ domain, url: result.link, title: result.title });
  }

  return mentions;
}

/**
 * Pages about the community on sites it does not own.
 *
 * An assistant answering "is Cloverland Park any good?" corroborates across sources.
 * One brand search tells us how many independent sources exist to corroborate with.
 */
export async function findThirdPartyMentions(options: AiSearchOptions): Promise<ThirdPartyOutcome> {
  const place = [options.city, options.state].filter(Boolean).join(' ') || options.zipCode;
  const outcome = await serperSearch(`"${options.businessName}" ${place}`, {
    num: RESULT_COUNT,
    ...(options.refresh === undefined ? {} : { refresh: options.refresh }),
  });

  if (!outcome.ok) return { mentions: [], unavailableReason: outcome.reason };

  return { mentions: readMentions(outcome.results, hostOf(options.websiteUrl)) };
}
