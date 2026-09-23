/**
 * Serper.dev — Google search results as JSON.
 *
 * Two modules lean on it: Module B uses `site:` queries to find directory
 * listings we are not allowed to crawl, and Module E (Phase 5) reads the local
 * pack and AI Overview for "[care type] in [city]" searches.
 *
 * The free tier is 2,500 searches, so every query is cached 24h and callers pass
 * a budget: an audit must never spend an unbounded number of searches.
 */

import { withCache } from '../lib/cache.js';
import { postJson } from '../lib/http.js';
import { logger } from '../lib/logger.js';
import { env } from '../config/env.js';

const SEARCH_ENDPOINT = 'https://google.serper.dev/search';

export interface SerperOrganicResult {
  title: string;
  link: string;
  snippet?: string;
  position?: number;
}

/** The slice of Serper's response we read. Everything is optional upstream. */
export interface SerperResponse {
  organic?: Array<{ title?: string; link?: string; snippet?: string; position?: number }>;
  knowledgeGraph?: Record<string, unknown>;
  places?: Array<Record<string, unknown>>;
  peopleAlsoAsk?: Array<{ question?: string; snippet?: string; link?: string }>;
  answerBox?: Record<string, unknown>;
  credits?: number;
  message?: string;
}

export interface SerperSuccess {
  ok: true;
  query: string;
  results: SerperOrganicResult[];
  raw: SerperResponse;
}

export interface SerperUnavailable {
  ok: false;
  reason: string;
  missingKey?: boolean;
  rateLimited?: boolean;
}

export type SerperOutcome = SerperSuccess | SerperUnavailable;

export const SERPER_MISSING_KEY: SerperUnavailable = {
  ok: false,
  missingKey: true,
  reason:
    'Directory and AI search checks need a Serper.dev API key. Add SERPER_API_KEY to your environment to include them.',
};

/** Maps Serper's response onto our shape. Exported so the mapping is testable. */
export function mapSerperResponse(query: string, body: SerperResponse): SerperOutcome {
  if (body.message && !body.organic) {
    return { ok: false, reason: `Google search results were refused (${body.message})` };
  }

  const results: SerperOrganicResult[] = (body.organic ?? [])
    .filter((item): item is { title: string; link: string; snippet?: string; position?: number } =>
      Boolean(item?.title && item.link),
    )
    .map((item) => ({
      title: item.title,
      link: item.link,
      ...(item.snippet ? { snippet: item.snippet } : {}),
      ...(item.position === undefined ? {} : { position: item.position }),
    }));

  return { ok: true, query, results, raw: body };
}

export interface SerperSearchOptions {
  /** Number of results to ask for; fewer is not cheaper, but it is faster. */
  num?: number;
  /** "Brentwood, Tennessee, United States" — biases results to the community's area. */
  location?: string;
  refresh?: boolean;
}

/**
 * One Google search. Failure is returned as a value: a search we cannot run marks
 * a check "unable to verify" rather than ending the audit.
 */
export async function serperSearch(
  query: string,
  options: SerperSearchOptions = {},
): Promise<SerperOutcome> {
  if (!env.SERPER_API_KEY) return SERPER_MISSING_KEY;

  const body = {
    q: query,
    gl: 'us',
    hl: 'en',
    num: options.num ?? 10,
    ...(options.location ? { location: options.location } : {}),
  };

  // Key omitted from the cache key so a key change does not invalidate results.
  const cacheKey = `serper:${JSON.stringify(body)}`;

  return withCache<SerperOutcome>(
    'serper',
    cacheKey,
    async () => {
      const outcome = await postJson<SerperResponse>(SEARCH_ENDPOINT, body, {
        label: `serper:${query}`,
        timeoutMs: 20_000,
        headers: { 'X-API-KEY': env.SERPER_API_KEY! },
      });

      if (!outcome.ok) {
        logger.warn('Serper search failed', { query, reason: outcome.reason });
        return {
          ok: false,
          reason: outcome.rateLimited
            ? 'We have used up this month’s Google search allowance, so these checks were skipped.'
            : `We could not run a Google search for this check (${outcome.reason})`,
          ...(outcome.rateLimited ? { rateLimited: true } : {}),
        };
      }

      return mapSerperResponse(query, outcome.value);
    },
    { ...(options.refresh === undefined ? {} : { refresh: options.refresh }) },
  );
}

/**
 * Results whose link sits on `domain` (or a subdomain of it).
 * Serper occasionally returns near-miss domains for a `site:` query.
 */
export function resultsOnDomain(
  results: SerperOrganicResult[],
  domain: string,
): SerperOrganicResult[] {
  const wanted = domain.replace(/^www\./i, '').toLowerCase();
  return results.filter((result) => {
    try {
      const host = new URL(result.link).hostname.replace(/^www\./i, '').toLowerCase();
      return host === wanted || host.endsWith(`.${wanted}`);
    } catch {
      return false;
    }
  });
}
