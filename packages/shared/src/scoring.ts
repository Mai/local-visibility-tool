/**
 * Scoring model from the PRD: five modules, 100 points total, four score bands.
 */

export const MODULE_IDS = ['gbp', 'citations', 'onpage', 'reviews', 'geo'] as const;

export type ModuleId = (typeof MODULE_IDS)[number];

export interface ModuleDefinition {
  id: ModuleId;
  /** Letter used in the PRD (Module A…E), kept for traceability. */
  letter: 'A' | 'B' | 'C' | 'D' | 'E';
  /** Short label for score cards. */
  label: string;
  /** One-line, jargon-free explanation of what the module looks at. */
  plainDescription: string;
  maxPoints: number;
}

export const MODULES: readonly ModuleDefinition[] = [
  {
    id: 'gbp',
    letter: 'A',
    label: 'Google Business Profile',
    plainDescription:
      'How complete and active your free Google listing is — the one people see on Google Maps.',
    maxPoints: 25,
  },
  {
    id: 'citations',
    letter: 'B',
    label: 'Local Listings',
    plainDescription:
      'Whether families can find you on the directories they actually use, with matching contact details.',
    maxPoints: 20,
  },
  {
    id: 'onpage',
    letter: 'C',
    label: 'Website Location Signals',
    plainDescription:
      'Whether your website makes it obvious where you are and what care you offer.',
    maxPoints: 25,
  },
  {
    id: 'reviews',
    letter: 'D',
    label: 'Reviews',
    plainDescription: 'Your ratings, how many reviews you have, and how recent they are.',
    maxPoints: 15,
  },
  {
    id: 'geo',
    letter: 'E',
    label: 'AI Search Visibility',
    plainDescription:
      'How likely AI assistants are to mention you when someone asks for care in your area.',
    maxPoints: 15,
  },
];

export const MODULE_BY_ID: Record<ModuleId, ModuleDefinition> = Object.fromEntries(
  MODULES.map((module) => [module.id, module]),
) as Record<ModuleId, ModuleDefinition>;

export const MODULE_MAX_POINTS: Record<ModuleId, number> = Object.fromEntries(
  MODULES.map((module) => [module.id, module.maxPoints]),
) as Record<ModuleId, number>;

export const TOTAL_MAX_POINTS = MODULES.reduce((sum, module) => sum + module.maxPoints, 0);

export const SCORE_BAND_IDS = ['strong', 'good', 'needs_work', 'critical'] as const;

export type ScoreBandId = (typeof SCORE_BAND_IDS)[number];

export interface ScoreBand {
  id: ScoreBandId;
  label: string;
  /** Inclusive lower bound / inclusive upper bound, out of 100. */
  min: number;
  max: number;
  /** Traffic-light colour used across UI and PDF. */
  indicator: 'green' | 'yellow' | 'orange' | 'red';
  /** Sentence shown next to the hero score. */
  summary: string;
}

export const SCORE_BANDS: readonly ScoreBand[] = [
  {
    id: 'strong',
    label: 'Strong',
    min: 80,
    max: 100,
    indicator: 'green',
    summary: 'Your online presence is well set up. Keep it current and keep an eye on it.',
  },
  {
    id: 'good',
    label: 'Good',
    min: 60,
    max: 79,
    indicator: 'yellow',
    summary: 'You have a solid base with a few gaps. Start with the priority fixes below.',
  },
  {
    id: 'needs_work',
    label: 'Needs work',
    min: 40,
    max: 59,
    indicator: 'orange',
    summary: 'There are visible gaps that are likely costing you inquiries.',
  },
  {
    id: 'critical',
    label: 'Critical',
    min: 0,
    max: 39,
    indicator: 'red',
    summary: 'Families searching in your area are probably not finding you. Act on these fixes.',
  },
];

/** The band a 0–100 score falls into. Scores outside the range are clamped. */
export function bandForScore(score: number): ScoreBand {
  const clamped = Math.min(100, Math.max(0, score));
  const band = SCORE_BANDS.find((candidate) => clamped >= candidate.min && clamped <= candidate.max);
  // SCORE_BANDS covers 0–100 with no gaps, so this is unreachable in practice.
  return band ?? SCORE_BANDS[SCORE_BANDS.length - 1]!;
}

/** Converts a module's raw points into a 0–100 percentage for charts. */
export function moduleScorePercent(moduleId: ModuleId, points: number): number {
  const max = MODULE_MAX_POINTS[moduleId];
  if (max <= 0) return 0;
  return Math.round((Math.min(max, Math.max(0, points)) / max) * 100);
}

/** Traffic-light indicator for a module sub-score. */
export function indicatorForPercent(percent: number): 'green' | 'yellow' | 'red' {
  if (percent >= 75) return 'green';
  if (percent >= 45) return 'yellow';
  return 'red';
}
