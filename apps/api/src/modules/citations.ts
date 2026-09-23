/**
 * Module B — Local Listings, a.k.a. citations (20 points, PRD 4.3).
 *
 * Scores five things across the directory results: presence on the directories that
 * matter most for senior care, presence on the general ones, whether the contact
 * details match the website, whether the listing says what care is offered, and
 * whether the same community is listed twice.
 *
 * A directory we could not verify (`listingFound: null`) is left out of every
 * denominator. If none could be verified the module reports as unscored rather than
 * zero, so a spent search allowance never looks like a failing grade (PRD 5.4).
 */

import {
  DIRECTORY_BY_ID,
  type CheckResult,
  type CitationResult,
  type ModuleResult,
} from '@sensi/shared';

import { NAP_FIELD_LABELS, type NapField } from '../analysis/nap.js';
import { assembleModule, check } from '../scoring/assemble.js';

const MODULE = 'citations' as const;

/** Total points the module's checks can award — must equal the PRD weight of 20. */
export const CITATIONS_MAX_CHECK_POINTS = 20;

export interface CitationsInput {
  results: CitationResult[];
}

/** Results we managed to verify one way or the other. */
function verified(results: CitationResult[]): CitationResult[] {
  return results.filter((result) => result.listingFound !== null);
}

function labels(results: CitationResult[]): string {
  return results.map((result) => result.label).join(', ');
}

/** The reason to show when every directory in a group came back unverifiable. */
function groupReason(results: CitationResult[]): string {
  const reasons = results
    .map((result) => result.unavailableReason)
    .filter((reason): reason is string => Boolean(reason));
  // They almost always share one cause (no search key, allowance spent), so the
  // first reason is the honest summary rather than a list of the same sentence.
  return reasons[0] ?? 'We could not check the directories this time.';
}

function roundHalf(value: number): number {
  return Math.round(value * 2) / 2;
}

function checkPresence(
  results: CitationResult[],
  options: {
    id: string;
    label: string;
    maxPoints: number;
    whyItMatters: string;
    /** Share of directories that must be found for a pass, then for a warn. */
    passAt: number;
    warnAt: number;
  },
): CheckResult {
  const base = {
    id: options.id,
    moduleId: MODULE,
    label: options.label,
    maxPoints: options.maxPoints,
    whyItMatters: options.whyItMatters,
  } as const;

  const checked = verified(results);
  if (!checked.length) {
    return check({
      ...base,
      status: 'unavailable',
      points: 0,
      detail: 'We could not check these directories.',
      unavailableReason: groupReason(results),
    });
  }

  const found = checked.filter((result) => result.listingFound === true);
  const missing = checked.filter((result) => result.listingFound === false);
  const share = found.length / checked.length;
  const points = roundHalf(options.maxPoints * share);

  const detail =
    missing.length === 0
      ? `You are listed on all ${checked.length}: ${labels(found)}.`
      : `You are listed on ${found.length} of ${checked.length}. Missing: ${labels(missing)}.`;

  return check({
    ...base,
    status: share >= options.passAt ? 'pass' : share >= options.warnAt ? 'warn' : 'fail',
    points,
    detail,
    evidence: {
      found: found.map((result) => ({ label: result.label, url: result.listingUrl })),
      missing: missing.map((result) => result.label),
      notVerified: results
        .filter((result) => result.listingFound === null)
        .map((result) => result.label),
    },
  });
}

function checkNapConsistency(results: CitationResult[]): CheckResult {
  const base = {
    id: 'citations.nap_consistency',
    moduleId: MODULE,
    label: 'Your details are the same on every listing',
    maxPoints: 6,
    whyItMatters:
      'Search engines compare your name, address and phone number across the web. Every version that disagrees makes them less certain your business is where you say it is.',
  } as const;

  const comparable = results.filter((result) => result.napMatches !== undefined);
  if (!comparable.length) {
    const anyFound = results.some((result) => result.listingFound === true);
    return check({
      ...base,
      status: 'unavailable',
      points: 0,
      detail: 'We could not compare the details on your listings.',
      unavailableReason: anyFound
        ? 'We found your listings but could not read enough contact detail from them to compare with your website.'
        : groupReason(results),
    });
  }

  const matching = comparable.filter((result) => result.napMatches === true);
  const wrong = comparable.filter((result) => result.napMatches === false);
  const share = matching.length / comparable.length;

  if (!wrong.length) {
    return check({
      ...base,
      status: 'pass',
      points: 6,
      detail: `Your contact details match your website on all ${comparable.length} listing${comparable.length === 1 ? '' : 's'} we could compare.`,
      evidence: { compared: comparable.map((result) => result.label) },
    });
  }

  // Name the fields, not just the count: "phone number on Yelp" is actionable.
  const fieldNames = [
    ...new Set(
      wrong.flatMap((result) =>
        (result.napMismatches ?? []).map(
          (mismatch) => NAP_FIELD_LABELS[mismatch.field as NapField] ?? String(mismatch.field),
        ),
      ),
    ),
  ];

  return check({
    ...base,
    status: share >= 0.5 ? 'warn' : 'fail',
    points: roundHalf(6 * share),
    detail: `${labels(wrong)} show${wrong.length === 1 ? 's' : ''} a different ${fieldNames.length ? fieldNames.join(' or ') : 'contact detail'} than your website. Pick one version and use it everywhere.`,
    evidence: {
      mismatches: wrong.map((result) => ({
        label: result.label,
        url: result.listingUrl,
        fields: result.napMismatches,
      })),
    },
  });
}

function checkCareTypesMentioned(results: CitationResult[]): CheckResult {
  const base = {
    id: 'citations.care_types',
    moduleId: MODULE,
    label: 'Your listings say what kind of care you offer',
    maxPoints: 2,
    whyItMatters:
      'Families search for the care they need — "home care", "senior community" — so a listing that does not name yours is skipped even when it ranks.',
  } as const;

  const found = results.filter(
    (result) => result.listingFound === true && result.mentionsCareTypes !== undefined,
  );
  if (!found.length) {
    return check({
      ...base,
      status: 'unavailable',
      points: 0,
      detail: 'We could not read what your listings say.',
      unavailableReason: groupReason(results),
    });
  }

  const naming = found.filter((result) => result.mentionsCareTypes === true);
  const silent = found.filter((result) => result.mentionsCareTypes !== true);
  const share = naming.length / found.length;

  if (!silent.length) {
    return check({
      ...base,
      status: 'pass',
      points: 2,
      detail: 'Every listing we could read names the type of care you provide.',
      evidence: { checked: found.map((result) => result.label) },
    });
  }

  return check({
    ...base,
    status: share >= 0.5 ? 'warn' : 'fail',
    points: roundHalf(2 * share),
    detail: `${labels(silent)} ${silent.length === 1 ? 'does' : 'do'} not name the type of care you provide. Adding it to the listing description helps families and search engines alike.`,
    evidence: { missing: silent.map((result) => result.label) },
  });
}

function checkDuplicates(results: CitationResult[]): CheckResult {
  const base = {
    id: 'citations.no_duplicates',
    moduleId: MODULE,
    label: 'You are not listed twice anywhere',
    maxPoints: 1,
    whyItMatters:
      'Two listings for one community split your reviews between them and leave families looking at whichever is more out of date.',
  } as const;

  // Duplicates only show up in a search, so a directory we reached by API tells us
  // nothing either way.
  const searched = results.filter((result) => result.verifiedVia === 'serp' || result.verifiedVia === 'scrape');
  if (!searched.length) {
    return check({
      ...base,
      status: 'unavailable',
      points: 0,
      detail: 'We could not check for duplicate listings.',
      unavailableReason: groupReason(results),
    });
  }

  const duplicated = searched.filter((result) => (result.duplicateListingsFound ?? 0) > 1);
  if (!duplicated.length) {
    return check({
      ...base,
      status: 'pass',
      points: 1,
      detail: 'We found no sign of the same community listed twice.',
    });
  }

  return check({
    ...base,
    status: 'warn',
    points: 0,
    detail: `${labels(duplicated)} appear${duplicated.length === 1 ? 's' : ''} to have more than one listing for your community. Ask the directory to merge them so your reviews stay together.`,
    evidence: {
      duplicates: duplicated.map((result) => ({
        label: result.label,
        count: result.duplicateListingsFound,
        url: result.listingUrl,
      })),
    },
  });
}

export function scoreCitations(input: CitationsInput): ModuleResult {
  const tier1 = input.results.filter((result) => DIRECTORY_BY_ID[result.directoryId]?.tier === 1);
  const tier2 = input.results.filter((result) => DIRECTORY_BY_ID[result.directoryId]?.tier === 2);

  const checks: CheckResult[] = [
    checkPresence(tier1, {
      id: 'citations.tier1_listings',
      label: 'You are listed on senior-care lead-gen directories',
      maxPoints: 8,
      whyItMatters:
        'A Place for Mom, Caring.com, SeniorAdvisor and Healthgrades market themselves as niche directories where families go specifically searching for care. Several of them also sell the leads they send, so a free claimed listing is worth having. Remember buying leads is not a requirement. Don’t feel pressured to pay for visibility, free mainstream directories will give you more than enough visibility.',
      passAt: 1,
      warnAt: 0.5,
    }),
    checkPresence(tier2, {
      id: 'citations.tier2_listings',
      label: 'You are listed on Yelp and the mainstream directories',
      maxPoints: 3,
      whyItMatters:
        'Yelp, Bing, Apple Maps, Facebook, YellowPages and Medicare.gov are all free to be found on — most reach families searching for any kind of business, and Medicare.gov is the government’s own directory rather than a paid referral service — so this is where visibility matters most.',
      passAt: 0.67,
      warnAt: 0.34,
    }),
    checkNapConsistency(input.results),
    checkCareTypesMentioned(input.results),
    checkDuplicates(input.results),
  ];

  return assembleModule(MODULE, checks);
}
