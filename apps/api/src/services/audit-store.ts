/**
 * Where a running audit lives while the loading screen polls it.
 *
 * In memory, on purpose. An audit is worth about ninety seconds of API calls and is
 * read once, by the operator who started it; the expensive parts — pages, listings,
 * SERPs — are already cached on disk for 24 hours, so a restart costs a re-score, not
 * a re-crawl. A database here would be state to migrate and back up for no benefit the
 * operator can see. If a shared, resumable history is ever wanted (PRD's portfolio
 * dashboard is explicitly out of scope for v1), this is the seam to replace.
 */

import { randomUUID } from 'node:crypto';

import {
  initialAuditSteps,
  progressPercent,
  AUDIT_STEP_LABELS,
  type AuditProgress,
  type AuditRequest,
  type AuditResult,
  type AuditStep,
  type AuditStepId,
  type AuditStepStatus,
  type AuditStatus,
} from '@sensi/shared';

import { logger } from '../lib/logger.js';

/** Audits kept before the oldest is dropped. */
const MAX_AUDITS = 50;

interface AuditJob {
  auditId: string;
  status: AuditStatus;
  request: AuditRequest;
  steps: AuditStep[];
  startedAt: number;
  result?: AuditResult;
  /** Operator-safe message when the audit could not be completed. */
  error?: string;
}

const jobs = new Map<string, AuditJob>();

/** Drops the oldest audits once the map is full. Insertion order is Map's own. */
function evictOldest(): void {
  while (jobs.size > MAX_AUDITS) {
    const oldest = jobs.keys().next();
    if (oldest.done) return;
    jobs.delete(oldest.value);
  }
}

export function createAudit(request: AuditRequest): AuditJob {
  const job: AuditJob = {
    auditId: randomUUID(),
    status: 'queued',
    request,
    steps: initialAuditSteps(),
    startedAt: Date.now(),
  };
  jobs.set(job.auditId, job);
  evictOldest();
  return job;
}

export function getAudit(auditId: string): AuditJob | undefined {
  return jobs.get(auditId);
}

/** Records one step's progress. Unknown ids are ignored rather than thrown. */
export function updateStep(
  auditId: string,
  id: AuditStepId,
  status: AuditStepStatus,
  note?: string,
): void {
  const job = jobs.get(auditId);
  if (!job) return;
  if (job.status === 'queued') job.status = 'running';

  const step = job.steps.find((candidate) => candidate.id === id);
  if (!step) return;
  step.status = status;
  step.label = AUDIT_STEP_LABELS[id];
  if (note) step.note = note;
}

export function completeAudit(auditId: string, result: AuditResult): void {
  const job = jobs.get(auditId);
  if (!job) return;
  job.status = 'complete';
  job.result = result;
  // A step still shown as running when the result is in reads as a stuck audit.
  job.steps = job.steps.map((step) =>
    step.status === 'running' || step.status === 'pending' ? { ...step, status: 'done' } : step,
  );
  logger.info('Audit stored', { auditId, seconds: Math.round((Date.now() - job.startedAt) / 1000) });
}

export function failAudit(auditId: string, message: string): void {
  const job = jobs.get(auditId);
  if (!job) return;
  job.status = 'failed';
  job.error = message;
  job.steps = job.steps.map((step) =>
    step.status === 'running' ? { ...step, status: 'failed', note: message } : step,
  );
}

/** What the loading screen polls. */
export function progressOf(job: AuditJob): AuditProgress {
  return {
    auditId: job.auditId,
    status: job.status,
    steps: job.steps,
    percentComplete: job.status === 'complete' ? 100 : progressPercent(job.steps),
    websiteUrl: job.request.url,
    ...(job.error ? { error: job.error } : {}),
  };
}
