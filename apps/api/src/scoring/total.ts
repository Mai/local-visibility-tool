/**
 * Rolls the five module results into the headline score, the band, and the honest
 * list of what could not be checked.
 *
 * The rule inside a module also applies between them: points nobody could verify
 * leave the denominator (PRD 5.4). If the citation module could not run at all — no
 * search key, every directory blocked — its 20 points come out of the total rather
 * than capping a well-run community at 80. The operator is told which modules were
 * left out, because a score out of 80 needs that sentence beside it.
 */

import {
  MODULE_IDS,
  bandForScore,
  type CheckResult,
  type ModuleId,
  type ModuleResult,
  type ScoreBandId,
} from '@sensi/shared';

export interface TotalScore {
  totalScore: number;
  /** Always 100: the score is expressed on the PRD scale whatever we could check. */
  maxScore: number;
  band: ScoreBandId;
  bandLabel: string;
  bandSummary: string;
  modulesNotScored: ModuleId[];
  unavailableChecks: Array<{ id: string; label: string; reason: string }>;
}

/** True when at least one of a module's checks produced a verdict. */
function wasScored(module: ModuleResult): boolean {
  return module.checks.some((check) => check.status !== 'unavailable');
}

function unavailableEntry(check: CheckResult): { id: string; label: string; reason: string } {
  return {
    id: check.id,
    label: check.label,
    reason: check.unavailableReason ?? 'We could not verify this during the audit.',
  };
}

/** Modules in PRD order, so the score cards and the PDF always read the same way. */
export function sortModules(modules: ModuleResult[]): ModuleResult[] {
  const order = new Map(MODULE_IDS.map((id, index) => [id, index]));
  return [...modules].sort(
    (a, b) => (order.get(a.moduleId) ?? 0) - (order.get(b.moduleId) ?? 0),
  );
}

export function assembleTotal(modules: ModuleResult[]): TotalScore {
  const scored = modules.filter(wasScored);
  const modulesNotScored = modules.filter((module) => !wasScored(module)).map((module) => module.moduleId);

  const earned = scored.reduce((sum, module) => sum + module.points, 0);
  const available = scored.reduce((sum, module) => sum + module.maxPoints, 0);

  // Nothing verifiable anywhere scores zero, but the band summary is not the place to
  // say so — `modulesNotScored` lists all five and the UI leads with that.
  const totalScore = available > 0 ? Math.round((earned / available) * 100) : 0;
  const band = bandForScore(totalScore);

  const unavailableChecks = modules
    .flatMap((module) => module.checks)
    .filter((check) => check.status === 'unavailable')
    .map(unavailableEntry);

  return {
    totalScore,
    maxScore: 100,
    band: band.id,
    bandLabel: band.label,
    bandSummary: band.summary,
    modulesNotScored,
    unavailableChecks,
  };
}
