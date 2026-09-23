/**
 * Disk cache with a TTL, so a re-run within 24 hours does not hit third-party
 * sites again (PRD 5.4). Cache failures never propagate: a broken cache should
 * slow an audit down, not break it.
 */

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { env } from '../config/env.js';
import { logger } from './logger.js';

interface CacheEnvelope<T> {
  /** Epoch millis after which the entry is stale. */
  expiresAt: number;
  /** Human-readable note about what produced the entry. */
  source: string;
  value: T;
}

function cachePath(namespace: string, key: string): string {
  const digest = createHash('sha256').update(key).digest('hex').slice(0, 32);
  return path.join(env.cacheDir, namespace, `${digest}.json`);
}

export async function readCache<T>(namespace: string, key: string): Promise<T | undefined> {
  if (env.CACHE_TTL_SECONDS <= 0) return undefined;

  try {
    const raw = await readFile(cachePath(namespace, key), 'utf8');
    const envelope = JSON.parse(raw) as CacheEnvelope<T>;
    if (envelope.expiresAt <= Date.now()) return undefined;
    return envelope.value;
  } catch {
    return undefined;
  }
}

export async function writeCache<T>(
  namespace: string,
  key: string,
  value: T,
  ttlSeconds = env.CACHE_TTL_SECONDS,
): Promise<void> {
  if (ttlSeconds <= 0) return;

  const filePath = cachePath(namespace, key);
  const envelope: CacheEnvelope<T> = {
    expiresAt: Date.now() + ttlSeconds * 1000,
    source: `${namespace}:${key}`,
    value,
  };

  try {
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, JSON.stringify(envelope), 'utf8');
  } catch (error) {
    logger.warn('Could not write cache entry', {
      namespace,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

export interface CacheOptions<T = unknown> {
  /** Ignore any cached value and refresh it. */
  refresh?: boolean;
  ttlSeconds?: number;
  /**
   * Whether a computed value is worth keeping. Answers are; failures are not.
   *
   * "The API rejected our request" is a fact about this minute, not about the
   * community, and storing it for 24 hours would keep a module unavailable long after
   * the cause was fixed. A real answer — including "we searched and there is no
   * listing" — is cached as normal.
   */
  shouldCache?: (value: T) => boolean;
}

/** Reads through the cache, computing and storing the value on a miss. */
export async function withCache<T>(
  namespace: string,
  key: string,
  compute: () => Promise<T>,
  options: CacheOptions<T> = {},
): Promise<T> {
  if (!options.refresh) {
    const cached = await readCache<T>(namespace, key);
    if (cached !== undefined) {
      logger.debug('Cache hit', { namespace, key });
      return cached;
    }
  }

  const value = await compute();
  if (!options.shouldCache || options.shouldCache(value)) {
    await writeCache(namespace, key, value, options.ttlSeconds);
  }
  return value;
}
