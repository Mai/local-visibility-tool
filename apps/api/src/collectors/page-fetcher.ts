/**
 * Fetches a single page's rendered HTML.
 *
 * Playwright first, because senior living sites are frequently JavaScript-rendered
 * (PRD 5.4). If the browser is unavailable we fall back to a plain HTTP fetch so
 * an audit still produces findings, and record which path was used.
 */

import type { BrowserContext } from 'playwright';

import { withCache } from '../lib/cache.js';
import { fetchText } from '../lib/http.js';
import { logger } from '../lib/logger.js';
import { isAllowedByRobots } from '../lib/robots.js';
import { env } from '../config/env.js';
import { parsePage } from '../analysis/parse-page.js';
import type { PageRole, PageSnapshot } from '../types/site.js';
import { BrowserUnavailableError, withContext } from './browser.js';

export type FetchPageResult =
  | { ok: true; snapshot: PageSnapshot }
  | { ok: false; reason: string; blockedByRobots?: boolean; httpStatus?: number };

export interface FetchPageOptions {
  roles: PageRole[];
  refresh?: boolean;
  /** Reuse an existing context when fetching several pages of one site. */
  context?: BrowserContext;
}

/** Cached shape: enough to rebuild a snapshot without re-fetching. */
interface CachedPage {
  finalUrl: string;
  html: string;
  httpStatus?: number;
  fetchedVia: PageSnapshot['fetchedVia'];
  fetchMs: number;
}

async function renderWithPlaywright(url: string, context: BrowserContext): Promise<CachedPage> {
  const page = await context.newPage();
  const startedAt = Date.now();

  try {
    const response = await page.goto(url, { waitUntil: 'domcontentloaded' });
    // Give client-rendered content a moment to paint, but never block the audit.
    await page.waitForLoadState('networkidle', { timeout: 3_000 }).catch(() => undefined);

    const html = await page.content();
    const status = response?.status();

    return {
      finalUrl: page.url(),
      html,
      fetchedVia: 'playwright',
      fetchMs: Date.now() - startedAt,
      ...(status === undefined ? {} : { httpStatus: status }),
    };
  } finally {
    await page.close().catch(() => undefined);
  }
}

async function fetchRaw(url: string, options: FetchPageOptions): Promise<CachedPage> {
  const attempt = async (): Promise<CachedPage> => {
    if (options.context) return renderWithPlaywright(url, options.context);
    return withContext((context) => renderWithPlaywright(url, context));
  };

  try {
    return await attempt();
  } catch (error) {
    const isBrowserProblem = error instanceof BrowserUnavailableError;
    logger.warn('Rendered fetch failed; falling back to plain HTTP', {
      url,
      browserProblem: isBrowserProblem,
      message: error instanceof Error ? error.message : String(error),
    });

    const startedAt = Date.now();
    const outcome = await fetchText(url, { label: url, timeoutMs: env.SCRAPE_TIMEOUT_MS });
    if (!outcome.ok) {
      throw new Error(outcome.reason);
    }

    return {
      finalUrl: url,
      html: outcome.value,
      httpStatus: outcome.status,
      fetchedVia: 'http',
      fetchMs: Date.now() - startedAt,
    };
  }
}

export async function fetchPage(url: string, options: FetchPageOptions): Promise<FetchPageResult> {
  const robots = await isAllowedByRobots(url, options.refresh);
  if (!robots.allowed) {
    logger.info('Skipping page per robots.txt', { url });
    return {
      ok: false,
      reason: robots.reason ?? 'The site asks crawlers not to read this page.',
      blockedByRobots: true,
    };
  }

  if (robots.crawlDelayMs) {
    await new Promise((resolve) => setTimeout(resolve, robots.crawlDelayMs));
  }

  try {
    const raw = await withCache<CachedPage>('pages', url, () => fetchRaw(url, options), {
      refresh: options.refresh,
    });

    // An error page is not content. Auditing a "Page Not Found" page would score
    // the wrong thing entirely — including picking up addresses it links to.
    if (raw.httpStatus !== undefined && raw.httpStatus >= 400) {
      return {
        ok: false,
        reason: `The page returned an error (status ${raw.httpStatus}).`,
        httpStatus: raw.httpStatus,
      };
    }

    return {
      ok: true,
      snapshot: parsePage({
        html: raw.html,
        requestedUrl: url,
        finalUrl: raw.finalUrl,
        roles: options.roles,
        fetchedVia: raw.fetchedVia,
        fetchMs: raw.fetchMs,
        ...(raw.httpStatus === undefined ? {} : { httpStatus: raw.httpStatus }),
      }),
    };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}
