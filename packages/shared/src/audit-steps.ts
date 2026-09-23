/**
 * Loading-screen steps. Labels are what the operator reads while they wait, so
 * they describe outcomes ("Checking your Google listing") not implementation.
 */

import type { AuditStep, AuditStepId } from './types.js';

export const AUDIT_STEP_LABELS: Record<AuditStepId, string> = {
  validate_site: 'Making sure your website is reachable…',
  read_website: 'Reading your website…',
  google_listing: 'Checking your Google listing…',
  listings: 'Looking for you on senior care directories…',
  reviews: 'Gathering your reviews…',
  ai_visibility: 'Analyzing AI search visibility…',
  competitors: 'Looking at nearby competitors…',
  scoring: 'Scoring your results…',
};

export const AUDIT_STEP_ORDER: readonly AuditStepId[] = [
  'validate_site',
  'read_website',
  'google_listing',
  'listings',
  'reviews',
  'ai_visibility',
  'competitors',
  'scoring',
];

/** Fresh step list, all pending — the initial state of an audit's progress. */
export function initialAuditSteps(): AuditStep[] {
  return AUDIT_STEP_ORDER.map((id) => ({
    id,
    label: AUDIT_STEP_LABELS[id],
    status: 'pending',
  }));
}

/** Percent complete for the progress bar; `running` counts as half a step. */
export function progressPercent(steps: readonly AuditStep[]): number {
  if (!steps.length) return 0;
  const weight = steps.reduce((sum, step) => {
    if (step.status === 'done' || step.status === 'skipped' || step.status === 'failed') return sum + 1;
    if (step.status === 'running') return sum + 0.5;
    return sum;
  }, 0);
  return Math.round((weight / steps.length) * 100);
}

/** Roughly how long an audit takes, shown on the input screen. */
export const ESTIMATED_AUDIT_SECONDS = 60;
