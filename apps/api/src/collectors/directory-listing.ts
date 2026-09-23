/**
 * Checks one directory for the community's listing (Module B).
 *
 * The chain, per directory registry: `api` where a first-party API exists (Yelp),
 * otherwise a `serp` search to find the listing's URL, then a `scrape` of that one
 * page to verify the details it shows. Directory search pages are off limits —
 * robots.txt says so and we respect it — so the SERP is how a listing is found.
 *
 * Anything we cannot confirm comes back as `listingFound: null` with a reason. That
 * is "unable to verify", not "no listing" (PRD 5.4): telling an operator to create a
 * listing they already have is worse than saying we could not check.
 */

import type { CareType, CitationResult, DirectoryDefinition, Nap } from '@sensi/shared';

import { chooseCitationCandidates, mentionsCareTypes } from '../analysis/citation-match.js';
import { compareListingPage } from '../analysis/directory-nap.js';
import { compareNap, type NapAlternates } from '../analysis/nap.js';
import { logger } from '../lib/logger.js';
import { fetchPage } from './page-fetcher.js';
import { resultsOnDomain, serperSearch, type SerperOutcome } from './serper.js';
import { findYelpBusiness, type YelpBusiness, type YelpMatchOutcome } from './yelp.js';

export interface DirectoryCheckContext {
  businessName: string;
  /** NAP as published on the operator's own website — the reference. */
  websiteNap: Nap;
  zipCode: string;
  city?: string;
  state?: string;
  careTypes: CareType[];
  /**
   * Everything else the website publishes — a second phone number, a second way of
   * writing the address. A listing that uses one of those is consistent, not wrong.
   */
  napAlternates?: NapAlternates;
  refresh?: boolean;
  /**
   * Yelp match from the listing audit, passed in so a full audit spends one Yelp
   * call rather than two.
   */
  yelpMatch?: YelpMatchOutcome;
  /**
   * Set when the search allowance is spent: the remaining directories report
   * "unable to verify" with this reason instead of being called.
   */
  searchUnavailable?: string;
}

/** Yelp's own record, in the shape the NAP comparison expects. */
function napFromYelp(business: YelpBusiness): Nap {
  const nap: Nap = { name: business.name };
  if (business.street) nap.street = business.street;
  if (business.city) nap.city = business.city;
  if (business.state) nap.state = business.state;
  if (business.zipCode) nap.zipCode = business.zipCode;
  if (business.phone) nap.phone = business.phone;
  return nap;
}

async function checkYelp(
  directory: DirectoryDefinition,
  context: DirectoryCheckContext,
): Promise<CitationResult> {
  const match =
    context.yelpMatch ??
    (await findYelpBusiness({
      businessName: context.businessName,
      zipCode: context.zipCode,
      ...(context.city ? { city: context.city } : {}),
      ...(context.state ? { state: context.state } : {}),
      ...(context.websiteNap.phone ? { phone: context.websiteNap.phone } : {}),
      ...(context.refresh === undefined ? {} : { refresh: context.refresh }),
    }));

  const base = { directoryId: directory.id, label: directory.label } as const;

  if (!match.ok) {
    if ('notFound' in match) {
      return { ...base, listingFound: false, verifiedVia: 'api' };
    }
    return { ...base, listingFound: null, unavailableReason: match.reason };
  }

  const comparison = compareNap(
    context.websiteNap,
    napFromYelp(match.business),
    context.napAlternates ?? {},
  );
  const careTypeText = [match.business.name, ...(match.business.categories ?? [])].join(' ');

  const result: CitationResult = {
    ...base,
    listingFound: true,
    verifiedVia: 'api',
    mentionsCareTypes: mentionsCareTypes(careTypeText, context.careTypes),
  };
  if (match.business.url) result.listingUrl = match.business.url;
  if (comparison.compared.length) {
    result.napMatches = comparison.matches;
    if (comparison.mismatches.length) result.napMismatches = comparison.mismatches;
  }
  return result;
}

/** `site:` query that finds a listing without matching the directory's own pages. */
export function directoryQuery(
  directory: DirectoryDefinition,
  context: Pick<DirectoryCheckContext, 'businessName' | 'city' | 'state' | 'zipCode'>,
): string {
  const place = [context.city, context.state].filter(Boolean).join(' ') || context.zipCode;
  return `site:${directory.domain} ${context.businessName} ${place}`;
}

/** Reads the listing page itself to verify the details it shows. */
async function verifyListingPage(
  directory: DirectoryDefinition,
  listingUrl: string,
  context: DirectoryCheckContext,
  result: CitationResult,
): Promise<void> {
  const page = await fetchPage(listingUrl, {
    roles: ['directory_listing'],
    ...(context.refresh === undefined ? {} : { refresh: context.refresh }),
  });

  if (!page.ok) {
    logger.debug('Directory listing page not readable', {
      directory: directory.id,
      listingUrl,
      reason: page.reason,
    });
    return;
  }

  result.verifiedVia = 'scrape';

  const comparison = compareListingPage(page.snapshot, context.websiteNap, {
    ...(directory.usesTrackingPhoneNumbers ? { ignorePhone: true } : {}),
    ...(context.napAlternates ? { alternates: context.napAlternates } : {}),
  });
  if (comparison.matches !== undefined) {
    result.napMatches = comparison.matches;
    if (comparison.mismatches.length) result.napMismatches = comparison.mismatches;
  }

  const pageText = [page.snapshot.title ?? '', page.snapshot.bodyText].join(' ');
  result.mentionsCareTypes = mentionsCareTypes(pageText, context.careTypes);
}

async function checkViaSearch(
  directory: DirectoryDefinition,
  context: DirectoryCheckContext,
): Promise<CitationResult> {
  const base = { directoryId: directory.id, label: directory.label } as const;

  if (context.searchUnavailable) {
    return { ...base, listingFound: null, unavailableReason: context.searchUnavailable };
  }

  const outcome: SerperOutcome = await serperSearch(directoryQuery(directory, context), {
    num: 10,
    ...(context.city && context.state
      ? { location: `${context.city}, ${context.state}, United States` }
      : {}),
    ...(context.refresh === undefined ? {} : { refresh: context.refresh }),
  });

  if (!outcome.ok) {
    return { ...base, listingFound: null, unavailableReason: outcome.reason };
  }

  const onDomain = resultsOnDomain(outcome.results, directory.domain);
  const candidates = chooseCitationCandidates(onDomain, {
    businessName: context.businessName,
    ...(context.city ? { city: context.city } : {}),
    zipCode: context.zipCode,
  });

  if (!candidates.best) {
    return { ...base, listingFound: false, verifiedVia: 'serp' };
  }

  const result: CitationResult = {
    ...base,
    listingFound: true,
    listingUrl: candidates.best.link,
    verifiedVia: 'serp',
    ...(candidates.duplicates.length
      ? { duplicateListingsFound: candidates.duplicates.length + 1 }
      : {}),
  };

  // The snippet is a weak read of the listing; the page itself, when we may open
  // it, replaces both this and the NAP comparison.
  result.mentionsCareTypes = mentionsCareTypes(
    [candidates.best.title, candidates.best.snippet ?? ''].join(' '),
    context.careTypes,
  );

  if (directory.strategies.includes('scrape')) {
    await verifyListingPage(directory, candidates.best.link, context, result);
  }

  return result;
}

export async function checkDirectoryListing(
  directory: DirectoryDefinition,
  context: DirectoryCheckContext,
): Promise<CitationResult> {
  try {
    if (directory.id === 'yelp') return await checkYelp(directory, context);
    return await checkViaSearch(directory, context);
  } catch (error) {
    // A single directory must never take the audit down with it.
    const reason = error instanceof Error ? error.message : String(error);
    logger.warn('Directory check failed', { directory: directory.id, reason });
    return {
      directoryId: directory.id,
      label: directory.label,
      listingFound: null,
      unavailableReason: `We could not check ${directory.label} this time.`,
    };
  }
}
