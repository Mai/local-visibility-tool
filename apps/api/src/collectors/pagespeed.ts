/**
 * Google PageSpeed Insights (free, key optional) → Core Web Vitals and the
 * mobile-friendliness signals we can get from Lighthouse.
 *
 * PSI is slow (10–25s) and occasionally rejects a URL outright, so the result is
 * cached for 24h and every failure is returned as `unavailable`.
 */

import { env } from '../config/env.js';
import { withCache } from '../lib/cache.js';
import { fetchJson } from '../lib/http.js';
import { logger } from '../lib/logger.js';

const PSI_ENDPOINT = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed';

/** Thresholds Google publishes for a "good" Core Web Vital. */
export const CWV_THRESHOLDS = {
  lcpMs: 2_500,
  cls: 0.1,
  inpMs: 200,
} as const;

export interface PageSpeedResult {
  ok: true;
  /** Lighthouse performance score, 0–100. */
  performanceScore?: number;
  /** Largest Contentful Paint in milliseconds. */
  lcpMs?: number;
  /** Cumulative Layout Shift, unitless. */
  cls?: number;
  /** Interaction to Next Paint in milliseconds (field data only). */
  inpMs?: number;
  /** True when a <meta name="viewport"> is configured for mobile. */
  hasViewport?: boolean;
  /** Lighthouse SEO score, 0–100 (includes mobile text legibility signals). */
  seoScore?: number;
  /** True when the numbers come from real-user (CrUX) data rather than the lab run. */
  usedFieldData: boolean;
  strategy: 'mobile';
}

export interface PageSpeedUnavailable {
  ok: false;
  reason: string;
}

export type PageSpeedOutcome = PageSpeedResult | PageSpeedUnavailable;

/** Minimal shape of the PSI response we read. */
export interface PsiResponse {
  lighthouseResult?: {
    categories?: Record<string, { score?: number | null }>;
    audits?: Record<string, { score?: number | null; numericValue?: number; details?: unknown }>;
  };
  loadingExperience?: {
    metrics?: Record<string, { percentile?: number; category?: string }>;
  };
  error?: { message?: string };
}

function toScore(value: number | null | undefined): number | undefined {
  return typeof value === 'number' ? Math.round(value * 100) : undefined;
}

/**
 * Maps a PSI payload onto our result shape. Exported so the mapping — including
 * the CrUX-vs-Lighthouse and CLS-scaling quirks — is unit-tested without the API.
 *
 * Real-user (CrUX) numbers are preferred over the lab run when Google has them,
 * because they reflect what families on real phones actually experience.
 */
export function mapPageSpeedResponse(body: PsiResponse): PageSpeedOutcome {
  if (body.error) {
    return {
      ok: false,
      reason: `Google’s speed test could not analyze your site (${body.error.message ?? 'unknown error'})`,
    };
  }

  const audits = body.lighthouseResult?.audits ?? {};
  const categories = body.lighthouseResult?.categories ?? {};
  const fieldMetrics = body.loadingExperience?.metrics ?? {};

  const fieldLcp = fieldMetrics['LARGEST_CONTENTFUL_PAINT_MS']?.percentile;
  const fieldCls = fieldMetrics['CUMULATIVE_LAYOUT_SHIFT_SCORE']?.percentile;
  const fieldInp = fieldMetrics['INTERACTION_TO_NEXT_PAINT']?.percentile;

  const labLcp = audits['largest-contentful-paint']?.numericValue;
  const labCls = audits['cumulative-layout-shift']?.numericValue;

  const lcpMs = fieldLcp ?? labLcp;
  // CrUX reports CLS multiplied by 100; Lighthouse reports the raw score.
  const cls = fieldCls !== undefined ? fieldCls / 100 : labCls;
  const viewportScore = audits['viewport']?.score;

  const result: PageSpeedResult = {
    ok: true,
    usedFieldData: fieldLcp !== undefined || fieldCls !== undefined,
    strategy: 'mobile',
  };

  const performanceScore = toScore(categories['performance']?.score);
  if (performanceScore !== undefined) result.performanceScore = performanceScore;
  const seoScore = toScore(categories['seo']?.score);
  if (seoScore !== undefined) result.seoScore = seoScore;
  if (lcpMs !== undefined) result.lcpMs = Math.round(lcpMs);
  if (cls !== undefined) result.cls = Number(cls.toFixed(3));
  if (fieldInp !== undefined) result.inpMs = Math.round(fieldInp);
  if (typeof viewportScore === 'number') result.hasViewport = viewportScore === 1;

  return result;
}

export async function fetchPageSpeed(
  url: string,
  options: { refresh?: boolean } = {},
): Promise<PageSpeedOutcome> {
  const query = new URLSearchParams({
    url,
    strategy: 'mobile',
  });
  query.append('category', 'performance');
  query.append('category', 'seo');
  if (env.PAGESPEED_API_KEY) query.set('key', env.PAGESPEED_API_KEY);

  const requestUrl = `${PSI_ENDPOINT}?${query.toString()}`;
  // Cache key omits the API key so adding one later does not invalidate results.
  const cacheKey = `psi:mobile:${url}`;

  return withCache<PageSpeedOutcome>(
    'pagespeed',
    cacheKey,
    async () => {
      const outcome = await fetchJson<PsiResponse>(requestUrl, {
        label: `pagespeed:${url}`,
        // PSI runs a real Lighthouse audit: ~8s on a light page, but measured at
        // 61s on a large senior living site. One attempt with a generous ceiling —
        // a retry would double the wait, and the two speed checks degrade cleanly.
        timeoutMs: 75_000,
        retries: 0,
      });

      if (!outcome.ok) {
        const reason =
          outcome.status === 429
            ? 'Google’s speed test is rate limiting us right now.'
            : outcome.reason.includes('timed out')
              ? 'Google’s speed test took too long on your site to wait for. That is often a sign it is slow, but we did not measure it.'
              : `Google’s speed test could not analyze your site (${outcome.reason})`;
        logger.warn('PageSpeed unavailable', { url, reason });
        return { ok: false, reason };
      }

      return mapPageSpeedResponse(outcome.value);
    },
    { ...(options.refresh === undefined ? {} : { refresh: options.refresh }) },
  );
}
