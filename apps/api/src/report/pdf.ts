/**
 * HTML → PDF, through the Chromium we already ship for scraping.
 *
 * The page is loaded with `setContent` rather than by pointing the browser at the web app.
 * That keeps the API from depending on the frontend being up and on a particular port, and
 * it means the render cannot hang on the network — there is no network involved. The
 * report is one self-contained string: system fonts, inline SVG, no images.
 *
 * Page geometry lives here rather than in an `@page` rule so there is one place to look
 * when a margin is wrong. US Letter, because the audience is US senior living operators.
 */

import { getRenderBrowser } from '../collectors/browser.js';
import { logger } from '../lib/logger.js';

import { renderReportHtml, reportTitle } from './template.js';

import type { AuditResult } from '@sensi/shared';

/** Generous, but not unbounded: a wedged renderer must not hold a request open forever. */
const RENDER_TIMEOUT_MS = 30_000;

function footerTemplate(title: string): string {
  // Header and footer templates are rendered in their own little documents and inherit
  // nothing from the page's stylesheet, so every style here has to be inline.
  const escaped = title.replace(/[&<>]/g, (char) =>
    char === '&' ? '&amp;' : char === '<' ? '&lt;' : '&gt;',
  );
  return `
    <div style="width: 100%; margin: 0 0.55in; padding-top: 6px; font-size: 7pt;
                font-family: system-ui, Helvetica, Arial, sans-serif; color: #55635f;
                display: flex; justify-content: space-between; border-top: 0.5pt solid #e2e8e6;">
      <span>${escaped}</span>
      <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
    </div>`;
}

/** Renders the report for a finished audit and returns the PDF bytes. */
export async function renderReportPdf(result: AuditResult): Promise<Buffer> {
  const startedAt = Date.now();
  const browser = await getRenderBrowser();
  const context = await browser.newContext();

  try {
    const page = await context.newPage();
    page.setDefaultTimeout(RENDER_TIMEOUT_MS);

    await page.setContent(renderReportHtml(result), { waitUntil: 'load' });
    // Chromium applies screen styles by default. The report has no screen variant, but
    // asking for print media makes the `break-*` rules and page boxes behave as written.
    await page.emulateMedia({ media: 'print' });

    const pdf = await page.pdf({
      format: 'Letter',
      printBackground: true,
      preferCSSPageSize: false,
      margin: { top: '0.55in', bottom: '0.6in', left: '0.55in', right: '0.55in' },
      displayHeaderFooter: true,
      headerTemplate: '<span></span>',
      footerTemplate: footerTemplate(reportTitle(result)),
    });

    logger.info('Rendered report PDF', {
      auditId: result.auditId,
      bytes: pdf.length,
      ms: Date.now() - startedAt,
    });

    return pdf;
  } finally {
    await context.close().catch(() => undefined);
  }
}

/**
 * A filename an operator can find again in their downloads folder.
 *
 * Everything outside a small safe set is dropped rather than escaped: this string ends up
 * in a `Content-Disposition` header, where a stray quote or newline is a header-injection
 * bug rather than a cosmetic one.
 */
export function reportFilename(result: AuditResult): string {
  const slug =
    result.business.name
      .normalize('NFKD')
      .replace(/[^\w\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .toLowerCase()
      .slice(0, 60) || 'community';
  const day = result.completedAt.slice(0, 10);
  return `${slug}-local-search-report-${day}.pdf`;
}
