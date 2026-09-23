/**
 * robots.txt handling (PRD 5.4: "Respect robots.txt").
 *
 * Policy, matching the convention for well-behaved crawlers:
 * - explicit Disallow for our agent → do not fetch
 * - robots.txt missing or 4xx        → allowed
 * - robots.txt unreachable / 5xx     → allowed, with a warning logged
 */

import robotsParserImport from 'robots-parser';

import { logger } from './logger.js';
import { USER_AGENT } from './http.js';
import { fetchText } from './http.js';
import { withCache } from './cache.js';
import { env } from '../config/env.js';

/** Agent token we match rules against. */
const AGENT = 'SensiAuditBot';

/**
 * robots-parser ships CommonJS with an ESM-style default in its .d.ts, which
 * leaves the imported value untyped. Declaring the shape we use keeps the call
 * sites type-checked.
 */
interface Robot {
  isAllowed(url: string, userAgent?: string): boolean | undefined;
  getCrawlDelay(userAgent?: string): number | undefined;
}

const robotsParser = robotsParserImport as unknown as (url: string, contents: string) => Robot;

const parserCache = new Map<string, Robot | null>();

async function loadRobots(origin: string, refresh = false): Promise<Robot | null> {
  if (!refresh && parserCache.has(origin)) return parserCache.get(origin) ?? null;

  const robotsUrl = `${origin}/robots.txt`;
  const body = await withCache(
    'robots',
    robotsUrl,
    async () => {
      const outcome = await fetchText(robotsUrl, { label: robotsUrl, retries: 1, timeoutMs: 10_000 });
      if (outcome.ok) return outcome.value;
      logger.debug('No usable robots.txt; treating as allow-all', {
        robotsUrl,
        reason: outcome.reason,
      });
      return null;
    },
    { refresh },
  );

  const parser = body === null ? null : robotsParser(robotsUrl, body);
  parserCache.set(origin, parser);
  return parser;
}

export interface RobotsDecision {
  allowed: boolean;
  /** Set when disallowed, phrased for the audit's warning list. */
  reason?: string;
  /** Crawl-delay the site asked for, in milliseconds. */
  crawlDelayMs?: number;
}

/** Whether we may fetch `url`, honouring the site's robots.txt. */
export async function isAllowedByRobots(url: string, refresh = false): Promise<RobotsDecision> {
  if (!env.RESPECT_ROBOTS_TXT) return { allowed: true };

  let origin: string;
  try {
    origin = new URL(url).origin;
  } catch {
    return { allowed: false, reason: 'That web address could not be read.' };
  }

  const parser = await loadRobots(origin, refresh);
  if (!parser) return { allowed: true };

  // robots-parser returns undefined when no rule matches, which means allowed.
  const allowedForBot = parser.isAllowed(url, AGENT);
  const allowedForBrowser = parser.isAllowed(url, USER_AGENT);
  const allowed = allowedForBot !== false && allowedForBrowser !== false;

  const crawlDelaySeconds = parser.getCrawlDelay(AGENT);

  return {
    allowed,
    ...(allowed ? {} : { reason: `The site's robots.txt asks crawlers not to read ${url}.` }),
    ...(typeof crawlDelaySeconds === 'number' && crawlDelaySeconds > 0
      ? { crawlDelayMs: Math.min(crawlDelaySeconds, 10) * 1000 }
      : {}),
  };
}

/** Clears the in-process robots.txt cache (used by tests). */
export function resetRobotsCache(): void {
  parserCache.clear();
}
