/**
 * HTTP helpers with timeouts, retries and exponential backoff (PRD 5.4).
 *
 * Every function here reports failure as a value rather than throwing, because a
 * failed third-party call must degrade one check to "unable to verify" instead of
 * ending the audit.
 */

import pRetry, { AbortError } from 'p-retry';

import { env } from '../config/env.js';
import { logger } from './logger.js';

/** Sent on every request so site owners can identify the crawler. */
export const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'Chrome/125.0.0.0 Safari/537.36 SensiAuditBot/1.0 (+https://sensi.com/audit-bot)';

export type FetchOutcome<T> =
  | { ok: true; value: T; status: number }
  | { ok: false; reason: string; status?: number; rateLimited?: boolean };

export interface RequestOptions {
  timeoutMs?: number;
  retries?: number;
  headers?: Record<string, string>;
  /** Label used in logs. */
  label?: string;
}

/** Status codes worth retrying: transient server errors and rate limits. */
function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

/** Short, operator-safe description of a network failure. */
function describeError(error: unknown): string {
  if (error instanceof Error) {
    if (error.name === 'AbortError' || error.name === 'TimeoutError') return 'The request timed out.';
    return error.message;
  }
  return String(error);
}

/** Longest upstream explanation we will quote into a reason string. */
const MAX_UPSTREAM_MESSAGE = 300;

/**
 * The human-readable message from a failed API response, if it has one. Google,
 * Yelp and Serper all nest it differently, and any of them beats a bare status.
 */
export async function upstreamMessage(response: Response): Promise<string | undefined> {
  try {
    const text = await response.text();
    if (!text.trim()) return undefined;

    try {
      const body = JSON.parse(text) as {
        error?: { message?: string; description?: string } | string;
        message?: string;
      };
      const nested = typeof body.error === 'string' ? body.error : body.error?.message ?? body.error?.description;
      const message = nested ?? body.message;
      if (message) return message.slice(0, MAX_UPSTREAM_MESSAGE);
    } catch {
      // Not JSON. An HTML error page has nothing worth quoting to an operator.
      return undefined;
    }

    return undefined;
  } catch {
    return undefined;
  }
}

async function fetchWithTimeout(
  url: string,
  options: RequestOptions,
  init?: RequestInit,
): Promise<Response> {
  const timeoutMs = options.timeoutMs ?? env.SCRAPE_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/json;q=0.9,*/*;q=0.8',
        ...options.headers,
        ...(init?.headers ?? {}),
      },
      redirect: 'follow',
    });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetches a URL, retrying transient failures with exponential backoff.
 * `parse` turns a successful response into the value the caller wants.
 */
async function request<T>(
  url: string,
  parse: (response: Response) => Promise<T>,
  options: RequestOptions = {},
  init?: RequestInit,
): Promise<FetchOutcome<T>> {
  const retries = options.retries ?? 2;
  const label = options.label ?? url;

  try {
    return await pRetry(
      async () => {
        const response = await fetchWithTimeout(url, options, init);

        if (!response.ok) {
          // APIs explain themselves in the error body ("Places API has not been
          // enabled…"). Without it a 403 is indistinguishable from a bad key.
          const upstream = await upstreamMessage(response);
          const message = upstream
            ? `Request failed with status ${response.status}: ${upstream}`
            : `Request failed with status ${response.status}.`;
          if (isRetryableStatus(response.status)) {
            throw Object.assign(new Error(message), { status: response.status });
          }
          // 4xx other than rate limiting will not improve on retry.
          throw new AbortError(Object.assign(new Error(message), { status: response.status }));
        }

        return { ok: true as const, value: await parse(response), status: response.status };
      },
      {
        retries,
        minTimeout: 500,
        factor: 2,
        onFailedAttempt: (context) => {
          logger.debug('Retrying request', {
            label,
            attempt: context.attemptNumber,
            retriesLeft: context.retriesLeft,
            message: context.error.message,
          });
        },
      },
    );
  } catch (error) {
    const status = (error as { status?: number }).status;
    const reason = describeError(error);
    logger.warn('Request failed', { label, status, reason });
    return {
      ok: false,
      reason,
      ...(status === undefined ? {} : { status }),
      ...(status === 429 ? { rateLimited: true } : {}),
    };
  }
}

/** GETs JSON. */
export function fetchJson<T>(url: string, options?: RequestOptions): Promise<FetchOutcome<T>> {
  return request<T>(url, (response) => response.json() as Promise<T>, options);
}

/** POSTs a JSON body and reads a JSON response (Google Places search). */
export function postJson<T>(
  url: string,
  body: unknown,
  options?: RequestOptions,
): Promise<FetchOutcome<T>> {
  return request<T>(url, (response) => response.json() as Promise<T>, options, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

/** GETs text (used for robots.txt and non-rendered HTML fallbacks). */
export function fetchText(url: string, options?: RequestOptions): Promise<FetchOutcome<string>> {
  return request<string>(url, (response) => response.text(), options);
}

/**
 * Checks that a URL is reachable, following redirects, and returns the final URL.
 * Used by the input step to confirm the operator's site responds before we spend
 * a minute auditing it.
 */
export async function checkReachable(
  url: string,
  options: RequestOptions = {},
): Promise<FetchOutcome<{ finalUrl: string }>> {
  const result = await request<{ finalUrl: string }>(
    url,
    async (response) => ({ finalUrl: response.url || url }),
    { ...options, timeoutMs: options.timeoutMs ?? 15_000, retries: options.retries ?? 1 },
  );
  return result;
}
