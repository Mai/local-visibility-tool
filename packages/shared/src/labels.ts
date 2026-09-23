/**
 * The words and numbers the operator reads, in one place.
 *
 * The screen and the PDF describe the same audit, so they have to describe it in the
 * same words. When these maps lived in the web app the report had no way to reach them,
 * and two copies of "Couldn’t check" would have drifted apart the first time either was
 * reworded. Colours stay with whoever is painting — Tailwind classes in the web app,
 * hex values in the print stylesheet — but the vocabulary is shared.
 */

import type { CheckStatus, EffortLevel, ImpactLevel, RecommendationGroup } from './types.js';

/* -------------------------------------------------------------------------- */
/* Traffic lights                                                             */
/* -------------------------------------------------------------------------- */

/**
 * The full indicator vocabulary. `ModuleResult.indicator` uses a subset — a module is
 * never `orange`, which is reserved for single findings that are worse than a warning
 * but not a flat failure.
 *
 * `grey` is not a bad score. It means we could not verify something, which the audit
 * treats as points leaving the denominator rather than points lost (PRD 5.4). Every
 * surface has to say so in those words.
 */
export type Indicator = 'green' | 'yellow' | 'orange' | 'red' | 'grey';

/** What a module's colour means, said out loud. Colour alone is not a message. */
export const INDICATOR_LABEL: Record<Indicator, string> = {
  green: 'Looking good',
  yellow: 'Room to improve',
  orange: 'Needs work',
  red: 'Needs attention',
  grey: 'Couldn’t check',
};

export const CHECK_STATUS_INDICATOR: Record<CheckStatus, Indicator> = {
  pass: 'green',
  warn: 'yellow',
  fail: 'red',
  unavailable: 'grey',
};

/** What a single check's status means, said out loud. */
export const CHECK_STATUS_LABEL: Record<CheckStatus, string> = {
  pass: 'Done',
  warn: 'Partly done',
  fail: 'Not done',
  unavailable: 'Couldn’t check',
};

/** Worst first: an operator reading a list of checks wants the problems at the top. */
export const CHECK_STATUS_ORDER: Record<CheckStatus, number> = {
  fail: 0,
  warn: 1,
  pass: 2,
  unavailable: 3,
};

/* -------------------------------------------------------------------------- */
/* Recommendations                                                            */
/* -------------------------------------------------------------------------- */

export const EFFORT_LABEL: Record<EffortLevel, string> = {
  easy: 'Quick to do',
  medium: 'Half a day',
  hard: 'A bigger job',
};

/** Effort levels in order, for rendering the key that explains the labels above. */
export const EFFORT_LEVELS: EffortLevel[] = ['easy', 'medium', 'hard'];

/**
 * What each effort label means in actual time, so "Half a day" is not left for the
 * operator to guess at. Shown once, as a key, before the labels are used.
 */
export const EFFORT_TIME_ESTIMATE: Record<EffortLevel, string> = {
  easy: 'under 15 minutes',
  medium: '2–4 hours',
  hard: 'a few days or more',
};

export const IMPACT_LABEL: Record<ImpactLevel, string> = {
  high: 'Big difference',
  medium: 'Worth doing',
  low: 'Small gain',
};

export const GROUP_TITLE: Record<RecommendationGroup, string> = {
  quick_wins: 'Quick wins',
  strategic: 'Bigger projects',
  ongoing: 'Keep doing this',
  nice_to_have: 'Nice to have',
};

export const GROUP_BLURB: Record<RecommendationGroup, string> = {
  quick_wins: 'Small jobs you or your marketing person can finish this week.',
  strategic: 'Worth planning properly — they take longer but move the score most.',
  ongoing: 'Habits rather than tasks. These never quite finish, and that is the point.',
  nice_to_have:
    'Extra reach if you want it. Several of these charge for the leads they send once you are listed, so treat them as optional — not something to chase before the free platforms above.',
};

export const GROUP_ORDER: RecommendationGroup[] = [
  'quick_wins',
  'strategic',
  'ongoing',
  'nice_to_have',
];

/* -------------------------------------------------------------------------- */
/* Standing against nearby communities                                        */
/* -------------------------------------------------------------------------- */

/**
 * Trailing is `orange`, not `red`. Being behind the neighbours is work to do, not a
 * broken listing, and the comparison only covers two of the five modules anyway.
 */
export const STANDING_INDICATOR: Record<'leading' | 'average' | 'trailing', Indicator> = {
  leading: 'green',
  average: 'yellow',
  trailing: 'orange',
};

export const STANDING_LABEL: Record<'leading' | 'average' | 'trailing', string> = {
  leading: 'Ahead',
  average: 'In the pack',
  trailing: 'Behind',
};

export const SENTIMENT_INDICATOR: Record<'positive' | 'mixed' | 'negative', Indicator> = {
  positive: 'green',
  mixed: 'yellow',
  negative: 'red',
};

export const SENTIMENT_LABEL: Record<'positive' | 'mixed' | 'negative', string> = {
  positive: 'Positive',
  mixed: 'Mixed',
  negative: 'Negative',
};

/* -------------------------------------------------------------------------- */
/* Formatting                                                                 */
/* -------------------------------------------------------------------------- */

/** "3 nearby communities", not "3 competitor(s)". */
export function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

/** Points shown to one decimal only when the fraction is real. */
export function formatPoints(points: number): string {
  return Number.isInteger(points) ? String(points) : points.toFixed(1);
}

/**
 * Dates are written out in US long form for a US audience, and pinned to UTC.
 *
 * Without the timezone the server and the browser disagree about which day an audit
 * ran whenever the server sits east of the operator, so the PDF and the screen would
 * date the same report differently.
 */
export function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** "3 weeks ago" — how operators think about when a review landed. */
export function formatRelativeDate(iso: string, now = new Date()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const days = Math.floor((now.getTime() - date.getTime()) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${plural(days, 'day')} ago`;
  const months = Math.round(days / 30);
  if (months < 18) return `${plural(months, 'month')} ago`;
  return `${plural(Math.round(days / 365), 'year')} ago`;
}

/** The domain of a URL, for showing a link without showing a wall of query string. */
export function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./i, '');
  } catch {
    return url;
  }
}
