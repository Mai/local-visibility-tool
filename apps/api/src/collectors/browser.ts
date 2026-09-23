/**
 * Shared headless Chromium. One browser is launched lazily and reused across an
 * audit's page fetches; contexts are created and disposed per fetch so a hung
 * page cannot leak state into the next one.
 */

import { chromium, type Browser, type BrowserContext } from 'playwright';

import { env } from '../config/env.js';
import { USER_AGENT } from '../lib/http.js';
import { logger } from '../lib/logger.js';

let browserPromise: Promise<Browser> | undefined;
let renderBrowserPromise: Promise<Browser> | undefined;

/** Resource types we skip: they cost time and never affect our checks. */
const BLOCKED_RESOURCE_TYPES = new Set(['image', 'media', 'font']);

export class BrowserUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BrowserUnavailableError';
  }
}

async function launch(headless: boolean): Promise<Browser> {
  try {
    return await chromium.launch({
      headless,
      args: ['--disable-dev-shm-usage'],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new BrowserUnavailableError(
      message.includes("Executable doesn't exist")
        ? 'The headless browser is not installed. Run: npm run playwright:install'
        : `The headless browser could not start: ${message}`,
    );
  }
}

export async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = launch(env.PLAYWRIGHT_HEADLESS).catch((error: unknown) => {
      // Do not cache a failed launch: the next audit should retry.
      browserPromise = undefined;
      throw error;
    });
  }
  return browserPromise;
}

/**
 * A browser that is definitely headless, for rendering the PDF.
 *
 * Chromium can only print to PDF in headless mode, and `PLAYWRIGHT_HEADLESS=false` exists
 * so a developer can watch a scrape happen. Someone doing that should not also discover
 * that PDF export has quietly stopped working, so when the shared browser is headful the
 * renderer gets its own headless one instead of borrowing it.
 */
export async function getRenderBrowser(): Promise<Browser> {
  if (env.PLAYWRIGHT_HEADLESS) return getBrowser();

  if (!renderBrowserPromise) {
    renderBrowserPromise = launch(true).catch((error: unknown) => {
      renderBrowserPromise = undefined;
      throw error;
    });
  }
  return renderBrowserPromise;
}

/** Fresh context with a desktop viewport and images/fonts blocked. */
export async function createContext(): Promise<BrowserContext> {
  const browser = await getBrowser();
  const context = await browser.newContext({
    userAgent: USER_AGENT,
    viewport: { width: 1366, height: 900 },
    locale: 'en-US',
    javaScriptEnabled: true,
  });

  context.setDefaultTimeout(env.SCRAPE_TIMEOUT_MS);
  context.setDefaultNavigationTimeout(env.SCRAPE_TIMEOUT_MS);

  await context.route('**/*', (route) => {
    if (BLOCKED_RESOURCE_TYPES.has(route.request().resourceType())) {
      void route.abort();
      return;
    }
    void route.continue();
  });

  return context;
}

/** Runs `work` in a throwaway context, always closing it. */
export async function withContext<T>(work: (context: BrowserContext) => Promise<T>): Promise<T> {
  const context = await createContext();
  try {
    return await work(context);
  } finally {
    await context.close().catch(() => undefined);
  }
}

export async function closeBrowser(): Promise<void> {
  const pending = [browserPromise, renderBrowserPromise].filter(
    (candidate): candidate is Promise<Browser> => candidate !== undefined,
  );
  browserPromise = undefined;
  renderBrowserPromise = undefined;

  await Promise.all(
    pending.map(async (promise) => {
      try {
        const browser = await promise;
        await browser.close();
      } catch (error) {
        logger.warn('Error closing browser', {
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }),
  );
}
