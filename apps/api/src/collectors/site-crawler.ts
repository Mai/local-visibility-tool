/**
 * Crawls the pages that matter for a local SEO audit: the homepage plus the
 * contact, care-type, service-area, FAQ and about pages it links to.
 *
 * Deliberately shallow — one hop from the homepage. The goal is enough evidence
 * to score Modules C and E, not a full site mirror.
 */

import pLimit from 'p-limit';

import { CARE_TYPE_KEYWORDS, CARE_TYPES, normalizeForKeywordMatch } from '@sensi/shared';

import { businessNameFromTitle } from '../analysis/business-name.js';
import { logger } from '../lib/logger.js';
import type { FailedPage, Locality, PageRole, PageSnapshot, SiteSnapshot } from '../types/site.js';
import { withContext } from './browser.js';
import { fetchPage } from './page-fetcher.js';

/** Extra pages beyond the homepage. Keeps an audit inside its ~60s budget. */
const MAX_EXTRA_PAGES = 6;
const FETCH_CONCURRENCY = 3;

const ROLE_PATTERNS: Array<{ role: PageRole; pattern: RegExp }> = [
  { role: 'contact', pattern: /contact|get-in-touch|schedule-a-(tour|visit)|tour/ },
  {
    role: 'service_area',
    pattern: /locations?|communities|our-communities|service-?areas?|areas-we-serve|neighborhoods?|find-a-community/,
  },
  { role: 'faq', pattern: /faqs?|frequently-asked|questions/ },
  { role: 'about', pattern: /about|our-story|who-we-are|team|leadership|staff/ },
];

/** Roles a link qualifies for, based on its URL path and anchor text. */
function classifyLink(url: string, text: string): PageRole[] {
  let pathname: string;
  try {
    pathname = new URL(url).pathname.toLowerCase();
  } catch {
    return [];
  }

  const haystack = `${pathname} ${normalizeForKeywordMatch(text)}`;
  const roles: PageRole[] = [];

  for (const { role, pattern } of ROLE_PATTERNS) {
    if (pattern.test(haystack)) roles.push(role);
  }

  const mentionsCareType = CARE_TYPES.some((careType) =>
    CARE_TYPE_KEYWORDS[careType].some((keyword) => {
      const normalized = normalizeForKeywordMatch(keyword);
      // Match both "/memory-care" style slugs and "Memory Care" link text.
      return haystack.includes(normalized) || pathname.includes(normalized.replace(/[' ]/g, '-'));
    }),
  );
  if (mentionsCareType) roles.push('care_type');

  return roles;
}

/** Picks which linked pages to fetch, capped and de-duplicated. */
function selectPages(homepage: PageSnapshot): Array<{ url: string; roles: PageRole[] }> {
  const quotas: Record<PageRole, number> = {
    homepage: 0,
    contact: 1,
    care_type: 3,
    service_area: 1,
    faq: 1,
    about: 1,
    // Never reached from the operator's own site: a directory listing is somebody
    // else's page, fetched one at a time by the citation checks.
    directory_listing: 0,
  };

  const selected = new Map<string, Set<PageRole>>();

  for (const link of homepage.internalLinks) {
    if (selected.size >= MAX_EXTRA_PAGES) break;
    if (link.url === homepage.finalUrl) continue;

    const roles = classifyLink(link.url, link.text);
    // Only take a link if it fills a role we still have room for.
    const wantedRoles = roles.filter((role) => quotas[role] > 0);
    if (!wantedRoles.length) continue;

    for (const role of wantedRoles) quotas[role] -= 1;
    selected.set(link.url, new Set(wantedRoles));
  }

  return [...selected.entries()].map(([url, roles]) => ({ url, roles: [...roles] }));
}

/**
 * Best available guess at the community's city and state from its own website.
 * Phase 3 replaces this with the Google listing's address when one is matched.
 */
function resolveLocality(pages: PageSnapshot[], zipCode: string): Locality | undefined {
  const fromSchema: Locality[] = pages
    .map((page) => page.structuredData.postalAddress)
    .filter((address): address is NonNullable<typeof address> => Boolean(address?.city))
    .map((address) => ({
      city: address.city!,
      source: 'structured_data' as const,
      ...(address.state ? { state: address.state } : {}),
      ...(address.zipCode ? { zipCode: address.zipCode } : {}),
    }));

  const fromText: Locality[] = pages.flatMap((page) =>
    page.localitiesInText.map((locality) => ({
      city: locality.city,
      state: locality.state,
      zipCode: locality.zipCode,
      source: 'page_text' as const,
    })),
  );

  // A zip matching what the operator entered beats a stronger source pointing at
  // some other town — big operators list sister communities on every page.
  return (
    fromSchema.find((locality) => locality.zipCode === zipCode) ??
    fromText.find((locality) => locality.zipCode === zipCode) ??
    fromSchema[0] ??
    fromText[0]
  );
}

function resolveBusinessName(pages: PageSnapshot[]): string | undefined {
  for (const page of pages) {
    const fromSchema = page.structuredData.businessName;
    if (fromSchema) return fromSchema;
  }

  const homepage = pages.find((page) => page.roles.includes('homepage'));
  if (!homepage) return undefined;

  const host = (() => {
    try {
      return new URL(homepage.finalUrl).hostname;
    } catch {
      return undefined;
    }
  })();

  // Titles are built from segments and the name is not always first, so the domain
  // is used to pick the right one.
  if (homepage.title) {
    const fromTitle = businessNameFromTitle(homepage.title, host);
    if (fromTitle) return fromTitle;
  }

  return homepage.headings.find((heading) => heading.level === 1)?.text;
}

export interface CrawlSiteOptions {
  url: string;
  zipCode: string;
  refresh?: boolean;
}

export async function crawlSite(options: CrawlSiteOptions): Promise<SiteSnapshot> {
  const { url, zipCode, refresh } = options;
  const warnings: string[] = [];
  const failedPages: FailedPage[] = [];

  const snapshot = await withContext(async (context) => {
    const homepageResult = await fetchPage(url, {
      roles: ['homepage'],
      ...(refresh === undefined ? {} : { refresh }),
      context,
    });

    if (!homepageResult.ok) {
      failedPages.push({
        requestedUrl: url,
        roles: ['homepage'],
        reason: homepageResult.reason,
        ...(homepageResult.blockedByRobots ? { blockedByRobots: true } : {}),
      });
      warnings.push(
        homepageResult.blockedByRobots
          ? 'Your website asks search crawlers not to read it, so we could not review your pages.'
          : `We could not open your website (${homepageResult.reason}), so the website checks were skipped.`,
      );

      return {
        requestedUrl: url,
        origin: new URL(url).origin,
        pages: [],
        failedPages,
        careTypes: [],
        warnings,
      } satisfies SiteSnapshot;
    }

    const homepage = homepageResult.snapshot;
    const targets = selectPages(homepage);
    logger.info('Crawling site', { url, extraPages: targets.length });

    const limit = pLimit(FETCH_CONCURRENCY);
    const results = await Promise.all(
      targets.map((target) =>
        limit(async () => {
          const result = await fetchPage(target.url, {
            roles: target.roles,
            ...(refresh === undefined ? {} : { refresh }),
            context,
          });
          return { target, result };
        }),
      ),
    );

    const pages: PageSnapshot[] = [homepage];
    for (const { target, result } of results) {
      if (result.ok) {
        pages.push(result.snapshot);
        continue;
      }
      failedPages.push({
        requestedUrl: target.url,
        roles: target.roles,
        reason: result.reason,
        ...(result.blockedByRobots ? { blockedByRobots: true } : {}),
      });
    }

    if (failedPages.length) {
      warnings.push(
        `We could not read ${failedPages.length} page${failedPages.length === 1 ? '' : 's'} on your site. Those checks were based on the pages we could read.`,
      );
    }

    const careTypes = [...new Set(pages.flatMap((page) => page.careTypes))];
    const locality = resolveLocality(pages, zipCode);
    const businessName = resolveBusinessName(pages);

    return {
      requestedUrl: url,
      origin: new URL(homepage.finalUrl).origin,
      homepage,
      pages,
      failedPages,
      careTypes,
      warnings,
      ...(locality ? { locality } : {}),
      ...(businessName ? { businessName } : {}),
    } satisfies SiteSnapshot;
  });

  return snapshot;
}
