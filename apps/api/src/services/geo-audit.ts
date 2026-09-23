/**
 * Runs Module E: the family-style searches, the brand search, and the content
 * analysis of the community's own pages.
 *
 * Phase 6's orchestrator will call this with a crawl it already has; exposed on its
 * own so the module can be run and verified against a real site.
 */

import type { AiSearchQuery, CareType, ModuleResult, ThirdPartyMention } from '@sensi/shared';

import { findThirdPartyMentions, runFamilySearches } from '../collectors/ai-search.js';
import { crawlSite } from '../collectors/site-crawler.js';
import { logger } from '../lib/logger.js';
import { scoreGeo } from '../modules/geo.js';
import type { SiteSnapshot } from '../types/site.js';

export interface GeoAuditOptions {
  businessName: string;
  websiteUrl: string;
  zipCode: string;
  city?: string;
  state?: string;
  /** Every level of care offered — drives the on-page content checks. */
  careTypes: CareType[];
  /** Which one to search as — drives the AI-visibility searches. See `pickPrimaryCareType`. */
  primaryCareType?: CareType;
  /** A crawl the caller already paid for. Fetched here when absent. */
  site?: SiteSnapshot;
  refresh?: boolean;
}

export interface GeoAuditResult {
  module: ModuleResult;
  searches: AiSearchQuery[];
  thirdPartyMentions: ThirdPartyMention[];
  warnings: string[];
}

export async function runGeoAudit(options: GeoAuditOptions): Promise<GeoAuditResult> {
  const warnings: string[] = [];

  const searchOptions = {
    businessName: options.businessName,
    websiteUrl: options.websiteUrl,
    ...(options.primaryCareType ? { primaryCareType: options.primaryCareType } : {}),
    zipCode: options.zipCode,
    ...(options.city ? { city: options.city } : {}),
    ...(options.state ? { state: options.state } : {}),
    ...(options.refresh === undefined ? {} : { refresh: options.refresh }),
  };

  // Independent work, so it runs together: the crawl, the family searches and the
  // brand search share nothing.
  const [site, searches, thirdParty] = await Promise.all([
    options.site ??
      crawlSite({
        url: options.websiteUrl,
        zipCode: options.zipCode,
        ...(options.refresh === undefined ? {} : { refresh: options.refresh }),
      }),
    runFamilySearches(searchOptions),
    findThirdPartyMentions(searchOptions),
  ]);

  if (!options.site) warnings.push(...site.warnings);
  const searchProblem = searches.find((search) => search.unavailableReason)?.unavailableReason;
  if (searchProblem) warnings.push(searchProblem);

  const module = scoreGeo({
    site,
    businessName: options.businessName,
    careTypes: options.careTypes,
    ...(options.city ? { city: options.city } : {}),
    searches,
    thirdPartyMentions: thirdParty.mentions,
    ...(thirdParty.unavailableReason
      ? { thirdPartyUnavailableReason: thirdParty.unavailableReason }
      : {}),
  });

  logger.info('GEO audit complete', {
    businessName: options.businessName,
    points: module.points,
    searches: searches.length,
    mentions: thirdParty.mentions.length,
  });

  return { module, searches, thirdPartyMentions: thirdParty.mentions, warnings };
}
