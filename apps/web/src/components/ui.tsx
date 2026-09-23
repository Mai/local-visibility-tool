/**
 * The presentational atoms the results screen is built from.
 *
 * All of these render on the server with no JavaScript, and the expandable ones use
 * native `<details>`. That keeps the page usable before hydration, keeps it accessible
 * for free, and means Phase 8 can print the report by forcing every `<details>` open
 * rather than reimplementing the layout.
 */

import type { CheckStatus } from '@sensi/shared';

import {
  CHECK_STATUS_INDICATOR,
  CHECK_STATUS_LABEL,
  INDICATOR_BAR,
  INDICATOR_LABEL,
  INDICATOR_SOFT_BG,
  INDICATOR_TEXT,
  type Indicator,
} from '@/lib/indicators';

/** A card. Every panel on the results page is one, so the chrome lives here. */
export function Card({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-xl border border-(--color-line) bg-(--color-surface) ${className}`}
    >
      {children}
    </section>
  );
}

export function SectionHeading({
  title,
  blurb,
  aside,
}: {
  title: React.ReactNode;
  blurb?: React.ReactNode;
  aside?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
      <div className="min-w-0">
        <h2 className="text-lg font-semibold text-(--color-ink)">{title}</h2>
        {blurb && <p className="mt-1 text-sm text-(--color-ink-muted)">{blurb}</p>}
      </div>
      {aside}
    </div>
  );
}

/** Coloured dot plus its meaning in words — never colour on its own. */
export function IndicatorPill({
  indicator,
  label,
}: {
  indicator: Indicator;
  label?: string;
}) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${INDICATOR_SOFT_BG[indicator]} ${INDICATOR_TEXT[indicator]}`}
    >
      <span aria-hidden className={`size-2 rounded-full ${INDICATOR_BAR[indicator]}`} />
      {label ?? INDICATOR_LABEL[indicator]}
    </span>
  );
}

export function CheckStatusPill({ status }: { status: CheckStatus }) {
  return (
    <IndicatorPill indicator={CHECK_STATUS_INDICATOR[status]} label={CHECK_STATUS_LABEL[status]} />
  );
}

/** A neutral badge for effort, impact and other metadata. */
export function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full bg-(--color-surface-sunken) px-2.5 py-1 text-xs font-medium text-(--color-ink-muted)">
      {children}
    </span>
  );
}

/**
 * A score bar with its number in the accessible name.
 *
 * `role="img"` with a label, rather than a progressbar: this is a finished
 * measurement, not something in progress.
 */
export function ScoreBar({
  percent,
  indicator,
  label,
}: {
  percent: number;
  indicator: Indicator;
  label: string;
}) {
  return (
    <div
      role="img"
      aria-label={label}
      className="h-2 w-full overflow-hidden rounded-full bg-(--color-surface-sunken)"
    >
      <div
        className={`h-full rounded-full ${INDICATOR_BAR[indicator]}`}
        style={{ width: `${Math.max(0, Math.min(100, percent))}%` }}
      />
    </div>
  );
}

/**
 * An expandable block built on `<details>`.
 *
 * The chevron rotates via `group-open`, so there is no state to hydrate and the
 * closed content is still in the DOM for find-in-page and for the PDF.
 */
export function Expandable({
  summary,
  children,
  defaultOpen = false,
  className = '',
}: {
  summary: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
  className?: string;
}) {
  return (
    <details className={`group ${className}`} open={defaultOpen}>
      <summary className="flex cursor-pointer list-none items-start gap-3 rounded-lg px-1 py-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--color-brand) [&::-webkit-details-marker]:hidden">
        <span className="min-w-0 flex-1">{summary}</span>
        <svg
          aria-hidden
          viewBox="0 0 20 20"
          className="mt-1 size-5 shrink-0 text-(--color-ink-muted) transition-transform group-open:rotate-180"
        >
          <path
            d="M5 8l5 5 5-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </summary>
      <div className="px-1 pt-1 pb-3">{children}</div>
    </details>
  );
}

/**
 * The "we could not check this" note.
 *
 * It is deliberately not styled as a failure. An operator who reads grey as red will
 * go looking for a problem that does not exist.
 */
export function UnverifiableNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-2 rounded-lg border border-(--color-line) bg-(--color-surface-sunken) px-3 py-2 text-sm text-(--color-ink-muted)">
      {children}
    </p>
  );
}

export function EmptyNote({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-(--color-ink-muted)">{children}</p>;
}
