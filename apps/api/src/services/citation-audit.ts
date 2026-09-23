/**
 * Runs the citation half of an audit: every directory that applies to the
 * community's care types, then Module B's score.
 *
 * Directories are checked a few at a time — enough to keep the audit inside the
 * loading screen's patience, not enough to look like an attack on anyone's site.
 * The moment the search allowance runs out, the remaining directories are reported
 * as "unable to verify" instead of being called again.
 */

import pLimit from 'p-limit';

import {
  DIRECTORY_BY_ID,
  directoriesForCareTypes,
  type CareType,
  type CitationResult,
  type ModuleResult,
  type Nap,
} from '@sensi/shared';

import type { NapAlternates } from '../analysis/nap.js';
import { checkDirectoryListing } from '../collectors/directory-listing.js';
import { SERPER_MISSING_KEY } from '../collectors/serper.js';
import type { YelpMatchOutcome } from '../collectors/yelp.js';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';
import { scoreCitations } from '../modules/citations.js';

/** Directories checked at once. Modest on purpose: these are other people's sites. */
const CONCURRENCY = 3;

export interface CitationAuditOptions {
  businessName: string;
  websiteNap: Nap;
  zipCode: string;
  city?: string;
  state?: string;
  careTypes: CareType[];
  /** Other names, addresses and numbers the website publishes. */
  napAlternates?: NapAlternates;
  refresh?: boolean;
  /** Yelp match from the listing audit, so the whole audit spends one Yelp call. */
  yelpMatch?: YelpMatchOutcome;
}

export interface CitationAuditResult {
  citations: ModuleResult;
  results: CitationResult[];
  warnings: string[];
}

export async function runCitationAudit(
  options: CitationAuditOptions,
): Promise<CitationAuditResult> {
  const directories = directoriesForCareTypes(options.careTypes);
  const warnings: string[] = [];

  // No search key at all: say so once, rather than nine times.
  let searchUnavailable: string | undefined = env.SERPER_API_KEY ? undefined : SERPER_MISSING_KEY.reason;
  if (searchUnavailable) warnings.push(searchUnavailable);

  const limit = pLimit(CONCURRENCY);

  const results = await Promise.all(
    directories.map((directory) =>
      limit(async () => {
        const result = await checkDirectoryListing(directory, {
          businessName: options.businessName,
          websiteNap: options.websiteNap,
          zipCode: options.zipCode,
          ...(options.city ? { city: options.city } : {}),
          ...(options.state ? { state: options.state } : {}),
          careTypes: options.careTypes,
          ...(options.napAlternates ? { napAlternates: options.napAlternates } : {}),
          ...(options.refresh === undefined ? {} : { refresh: options.refresh }),
          ...(options.yelpMatch ? { yelpMatch: options.yelpMatch } : {}),
          ...(searchUnavailable ? { searchUnavailable } : {}),
        });

        // Once the allowance is spent every further search fails the same way, so
        // stop spending calls to find that out.
        if (
          result.listingFound === null &&
          result.unavailableReason?.includes('allowance') &&
          !searchUnavailable
        ) {
          searchUnavailable = result.unavailableReason;
          warnings.push(result.unavailableReason);
        }

        return result;
      }),
    ),
  );

  const citations = scoreCitations({ results });

  // Mainstream directories first, the senior-care lead-gen ones last — the same
  // priority the recommendations for these two groups already carry (tier 1 is
  // `nice_to_have`; see recommendations.ts). Sorting is display order only: scoring
  // groups by tier internally regardless of array order.
  const ordered = [...results].sort(
    (a, b) => rank(DIRECTORY_BY_ID[a.directoryId]?.tier) - rank(DIRECTORY_BY_ID[b.directoryId]?.tier),
  );

  logger.info('Citation audit complete', {
    businessName: options.businessName,
    directories: directories.length,
    found: results.filter((result) => result.listingFound === true).length,
    notVerified: results.filter((result) => result.listingFound === null).length,
    points: citations.points,
  });

  return { citations, results: ordered, warnings };
}

function rank(tier: 1 | 2 | undefined): number {
  return tier === 1 ? 1 : 0;
}
