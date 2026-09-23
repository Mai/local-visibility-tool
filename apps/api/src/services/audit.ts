/**
 * The whole audit, start to finish: crawl, listing, directories, AI visibility,
 * competitors, score, recommendations.
 *
 * Two shapes matter here.
 *
 * **One crawl, shared.** The website is fetched once and passed to every module that
 * needs it. Crawling a community's site three times to answer three questions would be
 * slow for the operator and rude to their server.
 *
 * **Nothing fails the audit.** Each stage reports its own trouble as a warning or an
 * "unable to verify" check and the audit carries on (PRD 5.4). The only errors that
 * escape are the two the operator has to act on: a website that does not exist, and a
 * community name we could not work out.
 */

import {
  AUDIT_STEP_LABELS,
  initialAuditSteps,
  pickPrimaryCareType,
  type AuditRequest,
  type AuditResult,
  type AuditStep,
  type AuditStepId,
  type AuditStepStatus,
  type BusinessProfile,
  type CareType,
  type ModuleResult,
} from '@sensi/shared';

import { websiteNapAlternates, websiteNapFrom } from '../analysis/site-nap.js';
import { findCompetitors } from '../collectors/competitors.js';
import { placesAddress } from '../collectors/places.js';
import { crawlSite } from '../collectors/site-crawler.js';
import { badRequest } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { buildComparison } from '../scoring/competitors.js';
import { buildRecommendations } from '../scoring/recommendations.js';
import { assembleTotal, sortModules } from '../scoring/total.js';
import { runCitationAudit } from './citation-audit.js';
import { runGeoAudit } from './geo-audit.js';
import { runListingAudit } from './listing-audit.js';
import { confirmReachable, runOnPageAudit } from './onpage-audit.js';

export interface RunAuditOptions {
  auditId: string;
  request: AuditRequest;
  /** Community name from the operator, when they told us. */
  businessName?: string;
  /** Progress callback for the loading screen. */
  onStep?: (id: AuditStepId, status: AuditStepStatus, note?: string) => void;
  /** Evaluation time, injectable so review recency is deterministic in tests. */
  now?: Date;
}

/** A step reporter that also builds the step list, for callers without a store. */
export function createStepTracker(): {
  steps: AuditStep[];
  onStep: (id: AuditStepId, status: AuditStepStatus, note?: string) => void;
} {
  const steps = initialAuditSteps();
  return {
    steps,
    onStep: (id, status, note) => {
      const step = steps.find((candidate) => candidate.id === id);
      if (!step) return;
      step.status = status;
      step.label = AUDIT_STEP_LABELS[id];
      if (note) step.note = note;
    },
  };
}

export async function runAudit(options: RunAuditOptions): Promise<AuditResult> {
  const { auditId, request } = options;
  const now = options.now ?? new Date();
  const refresh = request.refresh;
  const step = options.onStep ?? (() => {});
  const warnings: string[] = [];

  /* -- The website ------------------------------------------------------- */

  step('validate_site', 'running');
  const reachabilityWarning = await confirmReachable(request.url);
  if (reachabilityWarning) warnings.push(reachabilityWarning);
  step('validate_site', 'done');

  step('read_website', 'running');
  const site = await crawlSite({
    url: request.url,
    zipCode: request.zipCode,
    ...(refresh === undefined ? {} : { refresh }),
  });
  warnings.push(...site.warnings);

  const businessName = options.businessName?.trim() || site.businessName;
  if (!businessName) {
    step('read_website', 'failed', 'We could not work out your community’s name.');
    throw badRequest(
      'We could not work out your community’s name from your website. Please tell us the name as it appears on your Google listing.',
    );
  }

  const websiteUrl = site.homepage?.finalUrl ?? request.url;
  const websiteNap = websiteNapFrom(site);
  const napAlternates = websiteNapAlternates(site);

  const onpage = await runOnPageAudit({
    url: websiteUrl,
    zipCode: request.zipCode,
    ...(request.careTypes?.length ? { careTypes: request.careTypes } : {}),
    ...(refresh === undefined ? {} : { refresh }),
    site,
  });
  warnings.push(...onpage.warnings);
  step(
    'read_website',
    'done',
    `${onpage.crawl.pagesRead} page${onpage.crawl.pagesRead === 1 ? '' : 's'} read.`,
  );

  // Care types the audit runs on: the operator's choice, else what the site says.
  const careTypes: CareType[] = onpage.careTypes;
  // Which one of those decides who counts as a competitor — see pickPrimaryCareType.
  // Distinct from careTypes above: a site can describe several levels of care in its
  // own copy without competing in all of them.
  const primaryCareType: CareType | undefined =
    request.primaryCareType ?? pickPrimaryCareType(careTypes);
  const primaryCareTypeDetected = request.primaryCareType === undefined;
  const siteCity = site.locality?.city;
  const siteState = site.locality?.state;

  /* -- The Google listing and the reviews -------------------------------- */

  step('google_listing', 'running');
  step('reviews', 'running');
  const listing = await runListingAudit({
    businessName,
    websiteUrl,
    zipCode: request.zipCode,
    ...(siteCity ? { city: siteCity } : {}),
    ...(siteState ? { state: siteState } : {}),
    websiteNap,
    napAlternates,
    careTypes,
    ...(refresh === undefined ? {} : { refresh }),
    now,
  });
  warnings.push(...listing.warnings);
  step(
    'google_listing',
    listing.place ? 'done' : 'skipped',
    listing.place ? undefined : 'We could not find your Google listing.',
  );
  step('reviews', 'done');

  // The listing is the better source for where the community is, once we have it.
  const city = listing.listingCity ?? siteCity;
  const state = listing.listingState ?? siteState;
  const listingAddress = listing.place ? placesAddress(listing.place) : undefined;

  /* -- Directories, AI visibility and competitors ------------------------ */

  // Independent of each other and each the slowest thing in the audit, so they run
  // together: directory lookups, SERP queries and the competitor search share nothing.
  step('listings', 'running');
  step('ai_visibility', 'running');
  step('competitors', 'running');

  const [citations, geo, competitorSearch] = await Promise.all([
    runCitationAudit({
      businessName,
      websiteNap,
      napAlternates,
      zipCode: request.zipCode,
      ...(city ? { city } : {}),
      ...(state ? { state } : {}),
      careTypes,
      ...(refresh === undefined ? {} : { refresh }),
    }),
    runGeoAudit({
      businessName,
      websiteUrl,
      zipCode: request.zipCode,
      ...(city ? { city } : {}),
      ...(state ? { state } : {}),
      careTypes,
      ...(primaryCareType ? { primaryCareType } : {}),
      site,
      ...(refresh === undefined ? {} : { refresh }),
    }),
    findCompetitors({
      businessName,
      websiteUrl,
      zipCode: request.zipCode,
      ...(city ? { city } : {}),
      ...(state ? { state } : {}),
      ...(primaryCareType ? { primaryCareType } : {}),
      ...(listing.place?.location?.latitude !== undefined &&
      listing.place.location.longitude !== undefined
        ? {
            location: {
              latitude: listing.place.location.latitude,
              longitude: listing.place.location.longitude,
            },
          }
        : {}),
      ...(listing.googlePlaceId ? { excludePlaceId: listing.googlePlaceId } : {}),
      ...(refresh === undefined ? {} : { refresh }),
    }),
  ]);

  warnings.push(...citations.warnings);
  warnings.push(...geo.warnings);
  step('listings', 'done');
  step('ai_visibility', 'done');

  /* -- Scoring ----------------------------------------------------------- */

  step('scoring', 'running');

  const comparison = buildComparison({
    ...(listing.place ? { targetPlace: listing.place } : {}),
    search: competitorSearch,
    now,
  });

  if (comparison) {
    step('competitors', 'done', `${comparison.competitors.length} nearby communities compared.`);
  } else {
    const note =
      competitorSearch.unavailableReason ??
      (listing.place
        ? 'We could not find nearby communities to compare you with.'
        : 'Without your Google listing there was nothing to compare like-for-like.');
    step('competitors', 'skipped', note);
    warnings.push(note);
  }

  const modules: ModuleResult[] = sortModules([
    listing.gbp,
    citations.citations,
    onpage.module,
    listing.reviews,
    geo.module,
  ]);

  const total = assembleTotal(modules);
  const recommendations = buildRecommendations(modules);

  const business: BusinessProfile = {
    name: businessName,
    websiteUrl,
    zipCode: request.zipCode,
    ...(city ? { city } : {}),
    ...(state ? { state } : {}),
    ...(listingAddress?.county ? { county: listingAddress.county } : {}),
    nap: websiteNap,
    careTypes,
    careTypesDetected: onpage.careTypesDetected,
    ...(primaryCareType ? { primaryCareType } : {}),
    primaryCareTypeDetected,
    ...(listing.googlePlaceId ? { googlePlaceId: listing.googlePlaceId } : {}),
  };

  step('scoring', 'done');

  logger.info('Audit complete', {
    auditId,
    url: request.url,
    totalScore: total.totalScore,
    band: total.band,
    modulesNotScored: total.modulesNotScored,
    recommendations: recommendations.length,
    competitors: comparison?.competitors.length ?? 0,
    warnings: warnings.length,
  });

  return {
    auditId,
    completedAt: now.toISOString(),
    request,
    business,
    totalScore: total.totalScore,
    maxScore: total.maxScore,
    band: total.band,
    bandLabel: total.bandLabel,
    bandSummary: total.bandSummary,
    modulesNotScored: total.modulesNotScored,
    modules,
    citations: citations.results,
    reviews: listing.reviewSnapshots,
    ...(listing.reviewThemes ? { reviewThemes: listing.reviewThemes } : {}),
    aiSearches: geo.searches,
    ...(comparison ? { comparison } : {}),
    recommendations,
    unavailableChecks: total.unavailableChecks,
    // Same warning from two modules reads as a bug rather than as emphasis.
    warnings: [...new Set(warnings)],
  };
}
