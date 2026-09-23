/**
 * Scores nearby communities on the same yardstick as the operator's own, and turns
 * the set into the comparison the results screen shows (PRD 4.4).
 *
 * **The comparison is narrower than the audit, on purpose.** Two of the five modules
 * need the community's cooperation to measure: the website audit needs a crawl, and
 * the directory audit needs searches per business. We are not going to crawl a
 * competitor's site to grade it, and we could not check their AI visibility without
 * spending another operator's worth of API calls. What is left is what Google
 * publishes about every business — the listing and the reviews — which is genuinely
 * comparable, and is what a family sees first anyway.
 *
 * So the comparison carries its own `basis` sentence and re-scores the operator's own
 * community on that same restricted basis. Ranking a 100-point audit against a
 * 40-point one would be flattering and meaningless.
 */

import {
  MODULE_BY_ID,
  type CareType,
  type Competitor,
  type CompetitiveComparison,
  type CompetitorScores,
  type ModuleId,
  type ModuleResult,
  type ReviewSnapshot,
} from '@sensi/shared';

import { competitorCareTypes, type CompetitorSearchResult } from '../collectors/competitors.js';
import { placesAddress, placesZip, type PlacesPlace } from '../collectors/places.js';
import { scoreGbp } from '../modules/gbp.js';
import { scoreReviews } from '../modules/reviews.js';

/** The modules visible in public listing data, and so the only fair ones to compare. */
export const COMPARED_MODULES: ModuleId[] = ['gbp', 'reviews'];

/** The sentence that tells the operator what they are looking at. */
export const COMPARISON_BASIS =
  'This compares your Google listing and your reviews against nearby communities — the two things every family sees before they call. Your website and directory scores are not compared, because we only audit websites their owners asked us to.';

export interface PlaceScores {
  scores: CompetitorScores;
  modules: ModuleResult[];
}

/**
 * Scores one listing on the compared modules, using nothing but its public record.
 *
 * The module scorers are reused rather than reimplemented, so a competitor is graded
 * by exactly the rules the operator was. Anything those scorers cannot see from a
 * place record — the NAP-vs-website match, review recency, owner replies, Yelp —
 * comes back `unavailable` on its own and leaves the denominator, which is the
 * behaviour we want here rather than a special case.
 */
export function scorePlace(place: PlacesPlace, now: Date): PlaceScores {
  const city = placesAddress(place).city;
  const gbp = scoreGbp({
    lookup: { ok: true, place, matchedOn: 'website', confidence: 1, alternatives: [] },
    place,
    // No website of theirs was read, so the NAP comparison has nothing to compare and
    // reports itself unverifiable — which is the truth.
    websiteNap: {},
    websiteUrl: place.websiteUri ?? '',
    careTypes: competitorCareTypes(place),
    ...(city ? { city } : {}),
  });

  const googleSnapshot: ReviewSnapshot = {
    source: 'google',
    ...(place.rating === undefined ? {} : { rating: place.rating }),
    ...(place.userRatingCount === undefined ? {} : { reviewCount: place.userRatingCount }),
  };
  const reviews = scoreReviews({ snapshots: [googleSnapshot], now });

  const modules = [gbp, reviews];
  return { scores: scoresFromModules(modules), modules };
}

/**
 * Rolls module results into a 0–100 score across the modules that could be scored.
 *
 * A module nothing could be verified in leaves the denominator, the same rule the
 * checks inside a module follow (PRD 5.4). A competitor whose listing we could read
 * but whose reviews Google hides is then scored on their listing alone, rather than
 * carrying a phantom zero into the average.
 */
export function scoresFromModules(modules: ModuleResult[]): CompetitorScores {
  const moduleScores: Partial<Record<ModuleId, number>> = {};
  const notEvaluated: ModuleId[] = [];
  let earned = 0;
  let available = 0;

  for (const module of modules) {
    const scorable = module.checks.some((check) => check.status !== 'unavailable');
    if (!scorable) {
      notEvaluated.push(module.moduleId);
      continue;
    }
    moduleScores[module.moduleId] = module.percent;
    earned += module.points;
    available += module.maxPoints;
  }

  return {
    moduleScores,
    totalScore: available > 0 ? Math.round((earned / available) * 100) : 0,
    notEvaluated,
  };
}

/** One row of the comparison table. */
export function toCompetitor(
  entry: { place: PlacesPlace; distanceMiles?: number },
  now: Date,
): Competitor | undefined {
  const { place } = entry;
  if (!place.id) return undefined;

  const { scores } = scorePlace(place, now);
  const zip = placesZip(place);
  const careTypes: CareType[] = competitorCareTypes(place);

  return {
    name: place.displayName?.text ?? 'Nearby community',
    googlePlaceId: place.id,
    ...(place.websiteUri ? { websiteUrl: place.websiteUri } : {}),
    ...(place.formattedAddress ? { formattedAddress: place.formattedAddress } : {}),
    ...(zip ? { zipCode: zip } : {}),
    ...(entry.distanceMiles === undefined ? {} : { distanceMiles: entry.distanceMiles }),
    ...(place.rating === undefined ? {} : { rating: place.rating }),
    ...(place.userRatingCount === undefined ? {} : { reviewCount: place.userRatingCount }),
    careTypes,
    scores,
  };
}

/* -------------------------------------------------------------------------- */
/* Insights                                                                   */
/* -------------------------------------------------------------------------- */

type Standing = 'leading' | 'average' | 'trailing';

/** Where a value sits against a set: clearly ahead, clearly behind, or in the pack. */
function standingFor(value: number, others: number[], tolerance: number): Standing {
  if (!others.length) return 'average';
  const average = others.reduce((sum, other) => sum + other, 0) / others.length;
  if (value >= average + tolerance) return 'leading';
  if (value <= average - tolerance) return 'trailing';
  return 'average';
}

function countAhead(value: number, others: number[]): number {
  return others.filter((other) => other > value).length;
}

function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

/**
 * The headline standing.
 *
 * It reports the score and the average together, because rank on its own misleads in
 * both directions. Live, a community scoring 80 against an average of 84 came out
 * fifth of six — "four of five are ahead of you" and "you are in the middle of the
 * pack" were both true and read as a contradiction. The numbers settle it.
 */
function overallInsight(target: number, others: number[]): CompetitiveComparison['insights'][number] {
  const standing = standingFor(target, others, 5);
  const ahead = countAhead(target, others);
  const average = Math.round(others.reduce((sum, other) => sum + other, 0) / others.length);
  const set = plural(others.length, 'community near you', 'communities near you');

  const score = `Your Google listing and reviews score ${target} out of 100 on the things we can compare`;
  const aheadClause =
    ahead === 0
      ? 'None of them is ahead of you.'
      : `${plural(ahead, 'of them is', 'of them are')} ahead of you.`;

  const message =
    standing === 'leading'
      ? `${score}, ahead of the ${average} average for the ${set}.`
      : standing === 'trailing'
        ? `${score}, against ${average} for the typical community near you. ${aheadClause}`
        : `${score}, close to the ${average} average for the ${set}. ${aheadClause}`;

  return { moduleId: 'overall', standing, message };
}

/**
 * How to name a module mid-sentence.
 *
 * Lowercasing the module label gave us "your google business profile", which is a
 * proper noun with its capitals taken off. These are written out instead.
 */
const MODULE_PHRASE: Partial<Record<ModuleId, string>> = {
  gbp: 'Google listing',
  reviews: 'reviews',
};

function moduleInsight(
  moduleId: ModuleId,
  target: number | undefined,
  others: number[],
): CompetitiveComparison['insights'][number] | undefined {
  if (target === undefined || !others.length) return undefined;
  const standing = standingFor(target, others, 8);
  const label = MODULE_PHRASE[moduleId] ?? MODULE_BY_ID[moduleId].label;
  const ahead = countAhead(target, others);

  const message =
    standing === 'leading'
      ? `Your ${label} scores better than most communities near you.`
      : standing === 'trailing'
        ? `${plural(ahead, 'community', 'communities')} near you score better on ${label} than you do. This is where you would gain the most ground.`
        : `Your ${label} is about the same as the communities near you.`;

  return { moduleId, standing, message };
}

/** The review-count callout, which operators act on faster than any score. */
function reviewVolumeInsight(
  targetCount: number | undefined,
  competitors: Competitor[],
): CompetitiveComparison['insights'][number] | undefined {
  const others = competitors
    .map((competitor) => competitor.reviewCount)
    .filter((count): count is number => typeof count === 'number');
  if (targetCount === undefined || !others.length) return undefined;

  const ahead = countAhead(targetCount, others);
  const standing: Standing = ahead === 0 ? 'leading' : ahead >= others.length / 2 ? 'trailing' : 'average';
  const median = [...others].sort((a, b) => a - b)[Math.floor(others.length / 2)]!;

  const message =
    standing === 'leading'
      ? `You have more Google reviews (${targetCount}) than any nearby community we compared you with.`
      : `You have ${targetCount} Google reviews. ${plural(ahead, 'nearby community', 'nearby communities')} ${ahead === 1 ? 'has' : 'have'} more, and the typical one near you has about ${median}.`;

  return { moduleId: 'reviews', standing, message };
}

/** The star-rating callout. Half a star is the smallest difference worth telling them. */
function ratingInsight(
  targetRating: number | undefined,
  competitors: Competitor[],
): CompetitiveComparison['insights'][number] | undefined {
  const others = competitors
    .map((competitor) => competitor.rating)
    .filter((rating): rating is number => typeof rating === 'number');
  if (targetRating === undefined || !others.length) return undefined;

  const average = others.reduce((sum, rating) => sum + rating, 0) / others.length;
  const standing = standingFor(targetRating, others, 0.2);

  const message =
    standing === 'leading'
      ? `Your ${targetRating.toFixed(1)}-star rating is above the ${average.toFixed(1)} average near you.`
      : standing === 'trailing'
        ? `Your ${targetRating.toFixed(1)}-star rating is below the ${average.toFixed(1)} average near you.`
        : `Your ${targetRating.toFixed(1)}-star rating is in line with the ${average.toFixed(1)} average near you.`;

  return { moduleId: 'reviews', standing, message };
}

export interface BuildComparisonInput {
  /** The operator's own Google listing, so they are scored the way rivals are. */
  targetPlace?: PlacesPlace;
  search: CompetitorSearchResult;
  now: Date;
}

/**
 * The comparison, or `undefined` when there is nothing honest to compare.
 *
 * Without the operator's own Google listing there is no like-for-like score to rank,
 * and with no neighbours found there is no set. Either way the results screen shows
 * the search's own explanation rather than a table of one row.
 */
export function buildComparison(input: BuildComparisonInput): CompetitiveComparison | undefined {
  const { targetPlace, search, now } = input;
  if (!targetPlace || !search.places.length) return undefined;

  const competitors = search.places
    .map((entry) => toCompetitor(entry, now))
    .filter((competitor): competitor is Competitor => competitor !== undefined);
  if (!competitors.length) return undefined;

  const target = scorePlace(targetPlace, now).scores;
  const others = competitors.map((competitor) => competitor.scores.totalScore);

  const insights = [
    overallInsight(target.totalScore, others),
    moduleInsight(
      'gbp',
      target.moduleScores.gbp,
      competitors
        .map((competitor) => competitor.scores.moduleScores.gbp)
        .filter((score): score is number => score !== undefined),
    ),
    ratingInsight(targetPlace.rating, competitors),
    reviewVolumeInsight(targetPlace.userRatingCount, competitors),
  ].filter((insight): insight is CompetitiveComparison['insights'][number] => insight !== undefined);

  const average = others.reduce((sum, score) => sum + score, 0) / others.length;

  return {
    competitors,
    zipCodesSearched: search.zipCodesSearched,
    ...(search.radiusMiles === undefined ? {} : { radiusMiles: search.radiusMiles }),
    comparedModules: COMPARED_MODULES,
    basis: COMPARISON_BASIS,
    targetScore: target.totalScore,
    averageCompetitorScore: Math.round(average),
    targetRank: countAhead(target.totalScore, others) + 1,
    setSize: competitors.length + 1,
    insights,
  };
}
