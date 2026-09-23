/**
 * Minimal structured logger. Audits touch several flaky third-party sources, so
 * every skipped or failed check should leave a trace here.
 */

import { env } from '../config/env.js';

type Level = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const minLevel: Level = env.NODE_ENV === 'development' ? 'debug' : 'info';

function write(level: Level, message: string, context?: Record<string, unknown>): void {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[minLevel]) return;
  const line = { level, message, ...context };
  const serialized = JSON.stringify(line);
  if (level === 'error' || level === 'warn') {
    process.stderr.write(`${serialized}\n`);
  } else {
    process.stdout.write(`${serialized}\n`);
  }
}

export const logger = {
  debug: (message: string, context?: Record<string, unknown>) => write('debug', message, context),
  info: (message: string, context?: Record<string, unknown>) => write('info', message, context),
  warn: (message: string, context?: Record<string, unknown>) => write('warn', message, context),
  error: (message: string, context?: Record<string, unknown>) => write('error', message, context),
};
