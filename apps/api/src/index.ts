import { createApp } from './app.js';
import { closeBrowser } from './collectors/browser.js';
import { env, missingApiKeys } from './config/env.js';
import { logger } from './lib/logger.js';

const app = createApp();

// Pass '0.0.0.0' to explicitly bind IPv4 host interface
const server = app.listen(env.PORT, '0.0.0.0', () => {
  logger.info('API listening', { port: env.PORT, environment: env.NODE_ENV });

  for (const requirement of missingApiKeys()) {
    logger.warn(`${requirement.key} is not set — ${requirement.affects} will be skipped`, {
      signupUrl: requirement.signupUrl,
    });
  }
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    logger.info('Shutting down', { signal });
    server.close(() => {
      // Leaving Chromium running would orphan the process.
      void closeBrowser().finally(() => process.exit(0));
    });
  });
}