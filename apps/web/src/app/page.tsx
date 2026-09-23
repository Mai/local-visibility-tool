/**
 * Screen 1 — the input screen (PRD 6.1).
 *
 * Rendered on the server so the setup check can run there: if an API key is missing, the
 * audit will still complete with those checks marked unverifiable, and whoever is setting
 * this up should be told which key before they wonder why a module came back grey.
 */

import { MODULES } from '@sensi/shared';

import { AuditForm } from '@/components/AuditForm';
import { getHealth, type HealthResponse } from '@/lib/api-client';

async function loadHealth(): Promise<HealthResponse | null> {
  try {
    return await getHealth();
  } catch {
    return null;
  }
}

export default async function HomePage() {
  const health = await loadHealth();

  return (
    <main className="mx-auto max-w-2xl px-6 py-12 sm:py-20">
      <p className="text-sm font-medium tracking-wide text-(--color-brand) uppercase">
        Free local search audit
      </p>
      <h1 className="mt-2 text-3xl font-semibold text-(--color-ink) sm:text-4xl">
        Can families find your agency online?
      </h1>
      <p className="mt-3 text-lg text-(--color-ink-muted)">
        We check your Google listing, your website, the senior care directories, your
        reviews and whether AI assistants mention you — then tell you what to fix first,
        in plain English.
      </p>

      <div className="mt-10 rounded-xl border border-(--color-line) bg-(--color-surface) p-6 sm:p-8">
        <AuditForm />
      </div>

      <section className="mt-10">
        <h2 className="text-sm font-semibold tracking-wide text-(--color-ink-muted) uppercase">
          What we look at
        </h2>
        <ul className="mt-3 space-y-3">
          {MODULES.map((module) => (
            <li key={module.id} className="flex gap-3">
              <span
                aria-hidden
                className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-(--color-brand-soft) text-xs font-semibold text-(--color-brand)"
              >
                {module.letter}
              </span>
              <span className="min-w-0">
                <span className="font-medium text-(--color-ink)">{module.label}</span>{' '}
                <span className="text-(--color-ink-muted)">— {module.plainDescription}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      {health === null && (
        <p className="mt-10 rounded-lg bg-(--color-fail-soft) px-4 py-3 text-sm text-(--color-fail)">
          The audit service is not responding. Start it with <code>npm run dev</code> from the
          project root, then reload this page.
        </p>
      )}

      {health !== null && health.missingApiKeys.length > 0 && (
        <div className="mt-10 rounded-lg border border-(--color-warn) bg-(--color-warn-soft) px-4 py-3">
          <p className="text-sm font-medium text-(--color-ink)">
            Setup note for whoever installed this
          </p>
          <p className="mt-1 text-sm text-(--color-ink)">
            Audits will run, but some checks will come back “couldn’t check” until these keys
            are added:
          </p>
          <ul className="mt-2 space-y-1.5 text-sm text-(--color-ink-muted)">
            {health.missingApiKeys.map((requirement) => (
              <li key={requirement.key}>
                <span className="font-medium text-(--color-ink)">{requirement.label}</span> —{' '}
                {requirement.affects}.{' '}
                <a
                  className="text-(--color-brand) underline"
                  href={requirement.signupUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Get a key
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </main>
  );
}
