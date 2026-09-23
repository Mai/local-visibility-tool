/**
 * Turns a module's checks into a `ModuleResult`.
 *
 * Key rule: checks marked `unavailable` are excluded from the denominator rather
 * than scored as failures (PRD 5.4). An operator must not lose points because a
 * directory blocked our scraper. The earned share of the *available* points is
 * rescaled onto the module's PRD weight, so the module's contribution to the
 * 100-point total stays fixed.
 */

import {
  MODULE_BY_ID,
  indicatorForPercent,
  type CheckResult,
  type ModuleId,
  type ModuleResult,
} from '@sensi/shared';

export interface AssembleOptions {
  /** Overrides the generated one-line status on the score card. */
  statusLine?: string;
  /** Set when the module could not run at all. */
  unavailableReason?: string;
}

function defaultStatusLine(checks: CheckResult[], percent: number): string {
  const counts = {
    pass: checks.filter((check) => check.status === 'pass').length,
    warn: checks.filter((check) => check.status === 'warn').length,
    fail: checks.filter((check) => check.status === 'fail').length,
    unavailable: checks.filter((check) => check.status === 'unavailable').length,
  };

  const needsAttention = counts.warn + counts.fail;
  const scored = counts.pass + needsAttention;

  if (scored === 0) return 'We could not check this area.';

  const lead =
    needsAttention === 0
      ? `All ${counts.pass} checks passed.`
      : percent >= 75
        ? `${counts.pass} of ${scored} checks passed — ${needsAttention} to tidy up.`
        : `${needsAttention} of ${scored} checks need attention.`;

  return counts.unavailable > 0
    ? `${lead} ${counts.unavailable} could not be verified and were left out of the score.`
    : lead;
}

export function assembleModule(
  moduleId: ModuleId,
  checks: CheckResult[],
  options: AssembleOptions = {},
): ModuleResult {
  const definition = MODULE_BY_ID[moduleId];
  const scoredChecks = checks.filter((check) => check.status !== 'unavailable');

  const availablePoints = scoredChecks.reduce((sum, check) => sum + check.maxPoints, 0);
  const earnedPoints = scoredChecks.reduce((sum, check) => sum + check.points, 0);

  // With nothing verifiable, report the module as unscored rather than as zero.
  const ratio = availablePoints > 0 ? earnedPoints / availablePoints : 0;
  const points = availablePoints > 0 ? Number((ratio * definition.maxPoints).toFixed(1)) : 0;
  const percent = availablePoints > 0 ? Math.round(ratio * 100) : 0;

  const unavailableReason =
    options.unavailableReason ??
    (availablePoints === 0 && checks.length > 0
      ? 'None of these checks could be verified this time.'
      : undefined);

  return {
    moduleId,
    label: definition.label,
    points,
    maxPoints: definition.maxPoints,
    percent,
    // An unscored module is grey, never red: "we could not check" is not "you failed".
    indicator: availablePoints > 0 ? indicatorForPercent(percent) : 'grey',
    statusLine: options.statusLine ?? defaultStatusLine(checks, percent),
    checks,
    ...(unavailableReason ? { unavailableReason } : {}),
  };
}

/** Convenience builder that keeps check construction readable at call sites. */
export function check(input: {
  id: string;
  moduleId: ModuleId;
  label: string;
  status: CheckResult['status'];
  points: number;
  maxPoints: number;
  detail: string;
  whyItMatters?: string;
  unavailableReason?: string;
  evidence?: Record<string, unknown>;
}): CheckResult {
  const { unavailableReason, evidence, whyItMatters, ...rest } = input;
  return {
    ...rest,
    // An unavailable check must never carry points, in either direction.
    points: rest.status === 'unavailable' ? 0 : rest.points,
    ...(whyItMatters ? { whyItMatters } : {}),
    ...(unavailableReason ? { unavailableReason } : {}),
    ...(evidence ? { evidence } : {}),
  };
}
