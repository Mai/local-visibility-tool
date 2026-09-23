/**
 * Runs the website half of an audit: reachability, crawl, speed test, Module C.
 *
 * Phase 6's orchestrator calls this alongside the Google, citation, review and
 * GEO collectors; for now it is also exposed directly so the on-page module can
 * be run and verified on its own.
 */

import type { CareType, ModuleResult } from '@sensi/shared';

import { fetchPageSpeed, type PageSpeedOutcome } from '../collectors/pagespeed.js';
import { crawlSite } from '../collectors/site-crawler.js';
import { checkReachable } from '../lib/http.js';
import { badRequest, upstreamUnavailable } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { scoreOnPage } from '../modules/onpage.js';
import type { Locality, PageRole, SiteSnapshot } from '../types/site.js';

export interface OnPageAuditOptions {
  url: string;
  zipCode: string;
  /** Operator-selected care types. Detected from the site when omitted. */
  careTypes?: CareType[];
  refresh?: boolean;
  /** Authoritative locality from the Google listing, once Phase 3 supplies it. */
  locality?: Locality;
  /**
   * A crawl the caller already paid for. When present the site is neither re-crawled
   * nor re-checked for reachability — a crawl that produced pages is proof enough.
   */
  site?: SiteSnapshot;
}

export interface CrawlSummary {
  origin: string;
  pagesRead: number;
  pages: Array<{ url: string; roles: PageRole[]; wordCount: number; fetchedVia: string }>;
  pagesFailed: Array<{ url: string; reason: string; blockedByRobots?: boolean }>;
}

export interface OnPageAuditResult {
  module: ModuleResult;
  careTypes: CareType[];
  careTypesDetected: boolean;
  locality?: Locality;
  businessName?: string;
  crawl: CrawlSummary;
  pageSpeed: PageSpeedOutcome;
  warnings: string[];
}

/**
 * Confirms the site responds before we spend a minute auditing it.
 *
 * A returned HTTP error status is not fatal: plenty of real sites answer a plain
 * request with 403 while rendering fine in a browser. Only a connection-level
 * failure means "we cannot audit this".
 */
export async function confirmReachable(url: string): Promise<string | undefined> {
  const outcome = await checkReachable(url, { label: `reachability:${url}` });
  if (outcome.ok) return undefined;

  if (outcome.status === undefined) {
    throw upstreamUnavailable(
      'We could not reach that website. Please double-check the address and try again.',
    );
  }

  // A missing page means the operator typed the wrong address. Auditing it anyway
  // would score their "Page Not Found" page and report meaningless findings.
  if (outcome.status === 404 || outcome.status === 410) {
    throw badRequest(
      'There is no page at that web address. Please check the link and try again — for example, use your homepage address.',
    );
  }

  return `Your website answered our first request with an error (status ${outcome.status}). We continued using a full browser instead.`;
}

function summarizeCrawl(site: SiteSnapshot): CrawlSummary {
  return {
    origin: site.origin,
    pagesRead: site.pages.length,
    pages: site.pages.map((page) => ({
      url: page.finalUrl,
      roles: page.roles,
      wordCount: page.wordCount,
      fetchedVia: page.fetchedVia,
    })),
    pagesFailed: site.failedPages.map((page) => ({
      url: page.requestedUrl,
      reason: page.reason,
      ...(page.blockedByRobots ? { blockedByRobots: true } : {}),
    })),
  };
}

export async function runOnPageAudit(options: OnPageAuditOptions): Promise<OnPageAuditResult> {
  const { url, zipCode, refresh } = options;
  const warnings: string[] = [];

  if (!options.site) {
    const reachabilityWarning = await confirmReachable(url);
    if (reachabilityWarning) warnings.push(reachabilityWarning);
  }

  // The crawl and the speed test are independent, so they run together.
  const [site, pageSpeed] = await Promise.all([
    options.site ?? crawlSite({ url, zipCode, ...(refresh === undefined ? {} : { refresh }) }),
    fetchPageSpeed(url, { ...(refresh === undefined ? {} : { refresh }) }),
  ]);

  // A crawl the caller handed us has already reported its own warnings.
  if (!options.site) warnings.push(...site.warnings);
  if (!pageSpeed.ok) {
    warnings.push(`Speed and mobile checks were skipped: ${pageSpeed.reason}`);
  }

  const operatorCareTypes = options.careTypes ?? [];
  const careTypes = operatorCareTypes.length ? operatorCareTypes : site.careTypes;
  const careTypesDetected = operatorCareTypes.length === 0;

  if (careTypesDetected && !careTypes.length && site.homepage) {
    warnings.push(
      'We could not tell which types of care you offer from your website. Selecting them yourself will make the results more accurate.',
    );
  }

  const locality = options.locality ?? site.locality;

  const module = scoreOnPage({
    site,
    careTypes,
    pageSpeed,
    ...(locality ? { locality } : {}),
  });

  logger.info('On-page audit complete', {
    url,
    points: module.points,
    pagesRead: site.pages.length,
    careTypes,
  });

  return {
    module,
    careTypes,
    careTypesDetected,
    crawl: summarizeCrawl(site),
    pageSpeed,
    warnings,
    ...(locality ? { locality } : {}),
    ...(site.businessName ? { businessName: site.businessName } : {}),
  };
}
