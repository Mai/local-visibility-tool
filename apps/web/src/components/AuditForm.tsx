'use client';

/**
 * Screen 1 — the only thing we ask the operator for (PRD 6.1).
 *
 * Website and zip code are required; care types are optional, because the audit detects
 * them and asking someone to classify their own community is a question they should not
 * have to answer to get a report.
 *
 * Validation uses the same `normalizeWebsiteUrl` / `normalizeZipCode` as the API, so the
 * message here and the message from the server are the same sentence.
 */

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import {
  CARE_TYPES,
  CARE_TYPE_LABELS,
  ESTIMATED_AUDIT_SECONDS,
  normalizeWebsiteUrl,
  normalizeZipCode,
  type CareType,
} from '@sensi/shared';

import { startAudit } from '@/lib/api-client';

interface FieldErrors {
  url?: string;
  zipCode?: string;
  form?: string;
}

export function AuditForm() {
  const router = useRouter();
  const [url, setUrl] = useState('');
  const [zipCode, setZipCode] = useState('');
  const [careTypes, setCareTypes] = useState<CareType[]>([]);
  const [primaryCareType, setPrimaryCareType] = useState<CareType | ''>('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);

  const toggleCareType = (careType: CareType) => {
    setCareTypes((current) =>
      current.includes(careType)
        ? current.filter((entry) => entry !== careType)
        : [...current, careType],
    );
  };

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting) return;

    const site = normalizeWebsiteUrl(url);
    const zip = normalizeZipCode(zipCode);
    const nextErrors: FieldErrors = {};
    if (!site.ok) nextErrors.url = site.message;
    if (!zip.ok) nextErrors.zipCode = zip.message;
    if (nextErrors.url || nextErrors.zipCode) {
      setErrors(nextErrors);
      return;
    }

    setErrors({});
    setSubmitting(true);
    try {
      const { auditId } = await startAudit({
        url: site.value!,
        zipCode: zip.value!,
        ...(careTypes.length ? { careTypes } : {}),
        ...(primaryCareType ? { primaryCareType } : {}),
      });
      router.push(`/audit/${auditId}`);
    } catch (error) {
      // The API's messages are written for the operator, so they are shown as-is.
      setErrors({
        form:
          error instanceof Error
            ? error.message
            : 'We could not start the audit. Please try again.',
      });
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6">
      <div>
        <label htmlFor="url" className="block font-medium text-(--color-ink)">
          Your website
        </label>
        <p id="url-hint" className="mt-1 text-sm text-(--color-ink-muted)">
          Just the main address — we will find the rest of your pages ourselves.
        </p>
        <input
          id="url"
          name="url"
          type="text"
          inputMode="url"
          autoComplete="url"
          placeholder="youragency.com"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          aria-describedby={errors.url ? 'url-error' : 'url-hint'}
          aria-invalid={errors.url ? true : undefined}
          className="mt-2 w-full rounded-lg border border-(--color-line) bg-(--color-surface) px-4 py-3 text-base text-(--color-ink) placeholder:text-(--color-ink-muted) focus:border-(--color-brand) focus:outline-2 focus:outline-offset-1 focus:outline-(--color-brand)"
        />
        {errors.url && (
          <p id="url-error" className="mt-2 text-sm text-(--color-fail)">
            {errors.url}
          </p>
        )}
      </div>

      <div>
        <label htmlFor="zipCode" className="block font-medium text-(--color-ink)">
          Your zip code
        </label>
        <p id="zip-hint" className="mt-1 text-sm text-(--color-ink-muted)">
          This is how we find the communities near you to compare against.
        </p>
        <input
          id="zipCode"
          name="zipCode"
          type="text"
          inputMode="numeric"
          autoComplete="postal-code"
          placeholder="37027"
          maxLength={10}
          value={zipCode}
          onChange={(event) => setZipCode(event.target.value)}
          aria-describedby={errors.zipCode ? 'zip-error' : 'zip-hint'}
          aria-invalid={errors.zipCode ? true : undefined}
          className="mt-2 w-full rounded-lg border border-(--color-line) bg-(--color-surface) px-4 py-3 text-base text-(--color-ink) placeholder:text-(--color-ink-muted) focus:border-(--color-brand) focus:outline-2 focus:outline-offset-1 focus:outline-(--color-brand) sm:max-w-40"
        />
        {errors.zipCode && (
          <p id="zip-error" className="mt-2 text-sm text-(--color-fail)">
            {errors.zipCode}
          </p>
        )}
      </div>

      <fieldset>
        <legend className="font-medium text-(--color-ink)">
          What care do you offer? <span className="font-normal text-(--color-ink-muted)">(optional)</span>
        </legend>
        <p className="mt-1 text-sm text-(--color-ink-muted)">
          Leave this blank and we will work it out from your website and your Google listing.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {CARE_TYPES.map((careType) => {
            const selected = careTypes.includes(careType);
            return (
              <label
                key={careType}
                className={`cursor-pointer rounded-full border px-4 py-2 text-sm font-medium transition-colors has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-(--color-brand) ${
                  selected
                    ? 'border-(--color-brand) bg-(--color-brand-soft) text-(--color-brand)'
                    : 'border-(--color-line) bg-(--color-surface) text-(--color-ink-muted)'
                }`}
              >
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={selected}
                  onChange={() => toggleCareType(careType)}
                />
                {CARE_TYPE_LABELS[careType]}
              </label>
            );
          })}
        </div>
      </fieldset>

      <fieldset>
        <legend className="font-medium text-(--color-ink)">
          Who are your real competitors?{' '}
          <span className="font-normal text-(--color-ink-muted)">(optional)</span>
        </legend>
        <p className="mt-1 text-sm text-(--color-ink-muted)">
          A site can mention several levels of care without competing in all of them — a
          home care agency's page might describe assisted living to help a family decide.
          Leave this on "Let us guess" unless the nearby businesses we compare you against
          turn out to be the wrong kind.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {(['', ...CARE_TYPES] as const).map((option) => {
            const selected = primaryCareType === option;
            return (
              <label
                key={option || 'guess'}
                className={`cursor-pointer rounded-full border px-4 py-2 text-sm font-medium transition-colors has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-(--color-brand) ${
                  selected
                    ? 'border-(--color-brand) bg-(--color-brand-soft) text-(--color-brand)'
                    : 'border-(--color-line) bg-(--color-surface) text-(--color-ink-muted)'
                }`}
              >
                <input
                  type="radio"
                  name="primaryCareType"
                  className="sr-only"
                  checked={selected}
                  onChange={() => setPrimaryCareType(option)}
                />
                {option ? CARE_TYPE_LABELS[option] : 'Let us guess'}
              </label>
            );
          })}
        </div>
      </fieldset>

      {errors.form && (
        <p role="alert" className="rounded-lg bg-(--color-fail-soft) px-4 py-3 text-sm text-(--color-fail)">
          {errors.form}
        </p>
      )}

      <div>
        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-lg bg-(--color-brand) px-6 py-3.5 text-base font-semibold text-white transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--color-brand) disabled:opacity-60 sm:w-auto"
        >
          {submitting ? 'Starting your audit…' : 'Run my free audit'}
        </button>
        <p className="mt-2 text-sm text-(--color-ink-muted)">
          Takes about {ESTIMATED_AUDIT_SECONDS} seconds. Nothing to install, and we do not
          change anything on your website.
        </p>
      </div>
    </form>
  );
}
