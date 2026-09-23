/**
 * The headline score (PRD 6.3, Screen 3).
 *
 * The dial is a plain SVG arc — no chart library, no client JavaScript — so it renders
 * identically on the server, on a phone, and in the printed PDF.
 *
 * When modules dropped out of the total, the hero says so directly under the number.
 * A score out of 100 that was really scored out of 85 is a misleading number unless it
 * is labelled, and the operator is the person least equipped to guess.
 */

import { bandForScore, MODULE_BY_ID, type AuditResult } from '@sensi/shared';

import { auditPdfUrl } from '@/lib/api-client';
import { formatDate, plural } from '@/lib/format';
import { INDICATOR_STROKE, type Indicator } from '@/lib/indicators';

const RADIUS = 54;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function ScoreDial({ score, indicator }: { score: number; indicator: Indicator }) {
  const filled = (Math.max(0, Math.min(100, score)) / 100) * CIRCUMFERENCE;

  return (
    <svg viewBox="0 0 128 128" className="size-32 shrink-0 sm:size-36" role="img" aria-label={`${score} out of 100`}>
      {/* Rotated so the arc starts at twelve o'clock and fills clockwise. */}
      <g transform="rotate(-90 64 64)">
        <circle cx="64" cy="64" r={RADIUS} fill="none" stroke="var(--color-line)" strokeWidth="10" />
        <circle
          cx="64"
          cy="64"
          r={RADIUS}
          fill="none"
          stroke={INDICATOR_STROKE[indicator]}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={`${filled} ${CIRCUMFERENCE}`}
        />
      </g>
      <text
        x="64"
        y="60"
        textAnchor="middle"
        className="fill-(--color-ink) text-[2rem] font-semibold"
        style={{ fontSize: '2rem' }}
      >
        {score}
      </text>
      <text
        x="64"
        y="80"
        textAnchor="middle"
        className="fill-(--color-ink-muted)"
        style={{ fontSize: '0.75rem' }}
      >
        out of 100
      </text>
    </svg>
  );
}

export function ScoreHero({ result }: { result: AuditResult }) {
  const band = bandForScore(result.totalScore);
  const notScored = result.modulesNotScored;

  return (
    <section className="rounded-xl border border-(--color-line) bg-(--color-surface) p-6 sm:p-8">
      <div className="flex flex-col items-start gap-6 sm:flex-row sm:items-center">
        <ScoreDial score={result.totalScore} indicator={band.indicator} />

        <div className="min-w-0">
          <p className="text-sm text-(--color-ink-muted)">
            Local search &amp; AI visibility audit · {formatDate(result.completedAt)}
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-(--color-ink) sm:text-3xl">
            {result.business.name}
          </h1>
          <p className="mt-1 text-sm text-(--color-ink-muted)">
            {result.business.nap.formattedAddress ??
              [result.business.city, result.business.state, result.business.zipCode]
                .filter(Boolean)
                .join(', ')}
          </p>

          <p className="mt-4 text-lg font-semibold text-(--color-ink)">
            {result.bandLabel} — {result.bandSummary}
          </p>

          {notScored.length > 0 && (
            <p className="mt-3 text-sm text-(--color-ink-muted)">
              This is a score out of what we could check.{' '}
              {plural(notScored.length, 'area', 'areas')} —{' '}
              {notScored.map((moduleId) => MODULE_BY_ID[moduleId].label).join(', ')} — could not be
              verified at all, so {notScored.length === 1 ? 'it is' : 'they are'} left out rather
              than counted as zero.
            </p>
          )}
        </div>

        {/*
          A plain link, not a button with a fetch behind it. The browser handles the
          download, so it survives being right-clicked or forwarded, and it works with no
          JavaScript on this page at all. Hidden when printing: a printed page offering
          you a download is noise.
        */}
        <a
          href={auditPdfUrl(result.auditId)}
          className="w-full shrink-0 rounded-lg border border-(--color-brand) px-5 py-3 text-center font-semibold text-(--color-brand) hover:bg-(--color-brand-soft) sm:ml-auto sm:w-auto print:hidden"
        >
          Download the PDF
          <span className="mt-0.5 block text-xs font-normal text-(--color-ink-muted)">
            The whole report, ready to send on
          </span>
        </a>
      </div>
    </section>
  );
}
