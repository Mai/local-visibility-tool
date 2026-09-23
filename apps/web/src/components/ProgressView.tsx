/**
 * Screen 2 — what the operator watches for the minute the audit takes (PRD 6.2).
 *
 * The step labels come from the shared package, so the API and this screen cannot drift
 * apart. A step that was skipped or failed says so and carries the reason: the audit
 * carries on regardless (PRD 5.4), and a silent gap here would turn into an unexplained
 * grey card on the results screen.
 */

import type { AuditStep, AuditStepStatus } from '@sensi/shared';

import { domainOf } from '@/lib/format';

const STATUS_TEXT: Record<AuditStepStatus, string> = {
  pending: 'text-(--color-ink-muted)',
  running: 'text-(--color-ink) font-medium',
  done: 'text-(--color-ink)',
  skipped: 'text-(--color-ink-muted)',
  failed: 'text-(--color-ink)',
};

function StepIcon({ status }: { status: AuditStepStatus }) {
  if (status === 'done') {
    return (
      <span
        aria-hidden
        className="flex size-6 shrink-0 items-center justify-center rounded-full bg-(--color-pass-soft) text-(--color-pass)"
      >
        <svg viewBox="0 0 20 20" className="size-4">
          <path
            d="M5 10.5l3.5 3.5L15 7"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.25"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    );
  }

  if (status === 'running') {
    return (
      <span
        aria-hidden
        className="flex size-6 shrink-0 items-center justify-center rounded-full bg-(--color-brand-soft)"
      >
        <span className="size-3 animate-spin rounded-full border-2 border-(--color-brand) border-t-transparent" />
      </span>
    );
  }

  if (status === 'failed' || status === 'skipped') {
    return (
      <span
        aria-hidden
        className="flex size-6 shrink-0 items-center justify-center rounded-full bg-(--color-surface-sunken) text-(--color-ink-muted)"
      >
        <svg viewBox="0 0 20 20" className="size-4">
          <path d="M6 10h8" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" />
        </svg>
      </span>
    );
  }

  return (
    <span
      aria-hidden
      className="flex size-6 shrink-0 items-center justify-center rounded-full border border-(--color-line)"
    >
      <span className="size-2 rounded-full bg-(--color-line)" />
    </span>
  );
}

export function ProgressView({
  steps,
  percentComplete,
  websiteUrl,
}: {
  steps: AuditStep[];
  percentComplete: number;
  websiteUrl?: string;
}) {
  const running = steps.find((step) => step.status === 'running');

  return (
    <div className="mx-auto max-w-xl">
      <p className="text-sm text-(--color-ink-muted)">
        {websiteUrl ? `Auditing ${domainOf(websiteUrl)}` : 'Audit in progress'}
      </p>
      <h1 className="mt-2 text-2xl font-semibold text-(--color-ink)">
        {running?.label ?? 'Putting your report together…'}
      </h1>
      <p className="mt-2 text-(--color-ink-muted)">
        This usually takes about a minute. You can leave this page open — we are checking
        your listing, your website, the directories and your competitors one at a time.
      </p>

      <div
        className="mt-6 h-2 w-full overflow-hidden rounded-full bg-(--color-line)"
        role="progressbar"
        aria-valuenow={percentComplete}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Audit progress"
      >
        <div
          className="h-full rounded-full bg-(--color-brand) transition-[width] duration-500"
          style={{ width: `${percentComplete}%` }}
        />
      </div>
      <p className="mt-2 text-sm text-(--color-ink-muted)">{percentComplete}% done</p>

      <ol className="mt-8 space-y-4">
        {steps.map((step) => (
          <li key={step.id} className="flex items-start gap-3">
            <StepIcon status={step.status} />
            <div className="min-w-0">
              <p className={`text-sm ${STATUS_TEXT[step.status]}`}>{step.label}</p>
              {step.note && (
                <p className="mt-0.5 text-sm text-(--color-ink-muted)">{step.note}</p>
              )}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
