/**
 * Loads and validates environment configuration.
 *
 * API keys are all optional: a missing key must degrade one module to
 * "unable to verify" rather than stop an audit (PRD 5.4). `missingKeys` lets
 * routes report honestly which checks will be skipped.
 */

import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import dotenv from 'dotenv';
import { z } from 'zod';

const currentDir = path.dirname(fileURLToPath(import.meta.url));

/** Walks up from this file to find the repo root (the dir holding .env). */
function findRepoRoot(startDir: string): string {
  let dir = startDir;
  for (let depth = 0; depth < 8; depth += 1) {
    if (existsSync(path.join(dir, 'package.json')) && existsSync(path.join(dir, 'tsconfig.base.json'))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

export const REPO_ROOT = findRepoRoot(currentDir);

// Root .env first, then apps/api/.env for local overrides. Existing process env
// always wins, so hosted deployments need no file at all.
dotenv.config({ path: path.join(REPO_ROOT, '.env'), quiet: true });
dotenv.config({ path: path.join(REPO_ROOT, 'apps/api/.env'), quiet: true, override: false });

const booleanish = z
  .enum(['true', 'false', '1', '0'])
  .transform((value) => value === 'true' || value === '1');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  CORS_ORIGINS: z.string().default('http://localhost:3000'),

  GOOGLE_PLACES_API_KEY: z.string().min(1).optional(),
  PAGESPEED_API_KEY: z.string().min(1).optional(),
  SERPER_API_KEY: z.string().min(1).optional(),
  YELP_API_KEY: z.string().min(1).optional(),

  CACHE_TTL_SECONDS: z.coerce.number().int().nonnegative().default(86_400),
  CACHE_DIR: z.string().default('.cache'),
  PLAYWRIGHT_HEADLESS: booleanish.default(true),
  SCRAPE_TIMEOUT_MS: z.coerce.number().int().positive().default(20_000),
  RESPECT_ROBOTS_TXT: booleanish.default(true),
});

// Treat empty strings in .env (e.g. `SERPER_API_KEY=`) as absent.
const rawEnv = Object.fromEntries(
  Object.entries(process.env).filter(([, value]) => value !== undefined && value !== ''),
);

const parsed = envSchema.safeParse(rawEnv);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((issue) => `  ${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('\n');
  throw new Error(`Invalid environment configuration:\n${issues}`);
}

const data = parsed.data;

/** API keys that gate a data source, mapped to the modules they feed. */
export const API_KEY_REQUIREMENTS = [
  {
    key: 'GOOGLE_PLACES_API_KEY',
    label: 'Google Places API',
    affects: 'Google Business Profile checks, review data, and competitor discovery',
    signupUrl: 'https://console.cloud.google.com/',
  },
  {
    key: 'SERPER_API_KEY',
    label: 'Serper.dev',
    affects: 'AI search visibility and directory listing fallback checks',
    signupUrl: 'https://serper.dev/',
  },
  {
    key: 'YELP_API_KEY',
    label: 'Yelp Fusion API',
    affects: 'Yelp listing and review data',
    signupUrl: 'https://www.yelp.com/developers',
  },
] as const;

export const env = {
  ...data,
  isProduction: data.NODE_ENV === 'production',
  corsOrigins: data.CORS_ORIGINS.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  /** Absolute path to the scrape/API response cache. */
  cacheDir: path.isAbsolute(data.CACHE_DIR)
    ? data.CACHE_DIR
    : path.join(REPO_ROOT, data.CACHE_DIR),
} as const;

/** Keys that are not configured, with what each one costs the audit. */
export function missingApiKeys(): Array<(typeof API_KEY_REQUIREMENTS)[number]> {
  return API_KEY_REQUIREMENTS.filter((requirement) => !data[requirement.key]);
}
