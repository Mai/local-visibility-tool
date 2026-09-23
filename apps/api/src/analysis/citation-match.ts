/**
 * Decides which search result is the community's listing on a directory.
 *
 * The trap here is over-claiming. Directories are full of pages that mention a
 * community without being its listing — "Best Assisted Living in Brentwood",
 * comparison pages, and (for a group operator) the listings of 600 sibling
 * communities. Telling an operator they have a duplicate listing when they do not
 * is worse than saying "unable to verify", so every rule below errs towards
 * rejecting a candidate.
 *
 * Pure and network-free: every rule is unit-tested against fixture results.
 */

import { CARE_TYPE_KEYWORDS, normalizeForKeywordMatch, type CareType } from '@sensi/shared';

import { distinctiveNameTokens, nameTokens, strongNameTokens } from './business-name.js';
import { businessNameSimilarity } from './nap.js';
import type { SerperOrganicResult } from '../collectors/serper.js';

/** URL paths that are a directory's own browse pages, never a single listing. */
const INDEX_PATH_RE =
  /(^\/?$)|\/(search|browse|find|directory|compare|blog|articles?|guides?|resources?|cost|costs|pricing-guide|sitemap)(\/|$)/i;

/**
 * A post, photo album or event *inside* a listing — common on Facebook, where a
 * search finds "/cloverlandpark/photos/we-are-proud-to…" long before the page
 * itself. The listing is the thing we want to report, not one of its posts.
 */
const DEEP_CONTENT_PATH_RE = /\/(photos?|posts?|videos?|reel|reels|events?|stories|story|jobs|offers?)\/.+/i;

/**
 * A directory's category page for a whole town — YellowPages' "/west-end-park-
 * nashville-tn/retirement-communities". It lists everybody, so it is nobody's listing.
 */
const CATEGORY_PATH_RE =
  /\/(retirement-communities|assisted-living|assisted-living-facilities|nursing-homes|senior-living|senior-living-communities|memory-care|independent-living|home-care|home-health-care|hospice|senior-care)\/?$/i;

/** Listing sub-pages that are the same listing seen from a different tab. */
const SUBPAGE_SUFFIX_RE =
  /\/(reviews?|photos?|gallery|pricing|costs?|amenities|floor-?plans?|map|faqs?|contact|nearby)\/?$/i;

const tokens = nameTokens;

/** Hostname + path, with tab-style sub-pages folded into the parent listing. */
export function listingKey(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.replace(/\/+$/, '').replace(SUBPAGE_SUFFIX_RE, '');
    return `${parsed.hostname.replace(/^www\./i, '').toLowerCase()}${path.toLowerCase()}`;
  } catch {
    return undefined;
  }
}

function pathTokens(url: string): string[] {
  try {
    return tokens(new URL(url).pathname.replace(/[/-]/g, ' '));
  } catch {
    return [];
  }
}

/** 0–1 overlap of two URL paths, used to tell a duplicate from a sibling community. */
export function pathTokenSimilarity(a: string, b: string): number {
  const left = new Set(pathTokens(a));
  const right = new Set(pathTokens(b));
  if (!left.size || !right.size) return 0;
  let shared = 0;
  for (const token of left) if (right.has(token)) shared += 1;
  return shared / Math.max(left.size, right.size);
}

export interface CandidateContext {
  businessName: string;
  city?: string;
  zipCode?: string;
}

/**
 * 0–1 confidence that a result is this community's listing.
 *
 * The URL slug is the strongest signal — directories put the community name in it
 * — so a name in the path outscores a name in the title, which category pages also
 * carry.
 */
export function scoreCitationCandidate(
  result: SerperOrganicResult,
  context: CandidateContext,
): number {
  const path = (() => {
    try {
      return new URL(result.link).pathname;
    } catch {
      return '';
    }
  })();

  if (
    !path ||
    INDEX_PATH_RE.test(path) ||
    CATEGORY_PATH_RE.test(path) ||
    DEEP_CONTENT_PATH_RE.test(path)
  ) {
    return 0;
  }

  const cityTokens = context.city ? tokens(context.city) : [];
  const distinctive = distinctiveNameTokens(context.businessName);
  // The town is in half the community names in the county, and it is in the URL of
  // every browse page the directory publishes for that town, so it cannot be what
  // identifies a listing. Unless the name is nothing but the town, in which case it
  // is all we have.
  const withoutCity = distinctive.filter((token) => !cityTokens.includes(token));
  const identifying = withoutCity.length ? withoutCity : distinctive;

  const pathWords = new Set(pathTokens(result.link));
  const titleWords = new Set(tokens(result.title));

  // A landscape word is not enough on its own: "park" put CareNow Urgent Care -
  // Brentwood Health Park forward as Cloverland Park's Healthgrades listing. Where a
  // name has a word that could only be this community, that word has to be the one
  // that appears. Where it has none ("Park Place"), every word has to.
  const strong = strongNameTokens(context.businessName).filter(
    (token) => !cityTokens.includes(token),
  );
  const matched = (words: Set<string>): boolean =>
    strong.length
      ? strong.some((token) => words.has(token))
      : identifying.every((token) => words.has(token));

  const inPath = matched(pathWords);
  const inTitle = matched(titleWords);
  const cityInPath = cityTokens.length > 0 && cityTokens.every((token) => pathWords.has(token));
  const cityInTitle = cityTokens.length > 0 && cityTokens.every((token) => titleWords.has(token));
  const zipInSnippet = Boolean(context.zipCode) && (result.snippet ?? '').includes(context.zipCode!);

  let score = 0;
  if (inPath) score += 0.6;
  if (inTitle) score += 0.3;
  if (cityInPath || cityInTitle) score += 0.1;
  if (zipInSnippet) score += 0.2;

  // A close whole-name match in the title stands in for a slug we cannot read
  // (some directories use numeric ids in the URL).
  if (!inPath && businessNameSimilarity(context.businessName, result.title) >= 0.75) {
    score += 0.2;
  }

  // Neither the name nor a distinguishing detail: this is somebody else's page.
  // (A name buried in the snippet is how round-up articles read, so it earns nothing.)
  if (!inPath && !inTitle && !zipInSnippet) return 0;

  return Math.min(score, 1);
}

/** Minimum confidence we accept as "this is their listing". */
export const CITATION_MATCH_THRESHOLD = 0.4;

/**
 * How similar two paths must be before we call the second one a duplicate rather
 * than a different community run by the same operator.
 */
const DUPLICATE_PATH_SIMILARITY = 0.6;

export interface CitationCandidates {
  /** The result we believe is their listing. */
  best?: SerperOrganicResult;
  /** Confidence in `best`, 0–1. */
  confidence: number;
  /** Further results that look like the *same* listing published twice. */
  duplicates: SerperOrganicResult[];
  /** Results on the domain we looked at, for the evidence trail. */
  considered: number;
}

export function chooseCitationCandidates(
  results: SerperOrganicResult[],
  context: CandidateContext,
): CitationCandidates {
  const scored = results
    .map((result) => ({ result, score: scoreCitationCandidate(result, context) }))
    .filter((entry) => entry.score >= CITATION_MATCH_THRESHOLD)
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  if (!best) return { confidence: 0, duplicates: [], considered: results.length };

  const bestKey = listingKey(best.result.link);
  const duplicates: SerperOrganicResult[] = [];
  const seen = new Set(bestKey ? [bestKey] : []);

  for (const entry of scored.slice(1)) {
    const key = listingKey(entry.result.link);
    if (!key || seen.has(key)) continue;
    // Same listing published twice, not the operator's other community: the slugs
    // have to be near-identical before we say so.
    if (pathTokenSimilarity(best.result.link, entry.result.link) < DUPLICATE_PATH_SIMILARITY) continue;
    seen.add(key);
    duplicates.push(entry.result);
  }

  return {
    best: best.result,
    confidence: best.score,
    duplicates,
    considered: results.length,
  };
}

/** True when the text names at least one of the care types the community offers. */
export function mentionsCareTypes(text: string, careTypes: readonly CareType[]): boolean {
  if (!text.trim()) return false;
  const haystack = normalizeForKeywordMatch(text);
  const keywords = (careTypes.length ? careTypes : (Object.keys(CARE_TYPE_KEYWORDS) as CareType[]))
    .flatMap((careType) => CARE_TYPE_KEYWORDS[careType])
    .map((keyword) => normalizeForKeywordMatch(keyword));
  return keywords.some((keyword) => haystack.includes(keyword));
}
