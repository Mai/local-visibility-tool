import assert from 'node:assert/strict';
import { test } from 'node:test';

import { mapPageSpeedResponse, type PsiResponse } from './pagespeed.js';

test('prefers real-user (CrUX) metrics and rescales CLS', () => {
  const body: PsiResponse = {
    loadingExperience: {
      metrics: {
        LARGEST_CONTENTFUL_PAINT_MS: { percentile: 3_100, category: 'AVERAGE' },
        // CrUX reports CLS x100, so 12 means 0.12.
        CUMULATIVE_LAYOUT_SHIFT_SCORE: { percentile: 12, category: 'AVERAGE' },
        INTERACTION_TO_NEXT_PAINT: { percentile: 180, category: 'FAST' },
      },
    },
    lighthouseResult: {
      categories: { performance: { score: 0.46 }, seo: { score: 0.92 } },
      audits: {
        'largest-contentful-paint': { numericValue: 4_900 },
        'cumulative-layout-shift': { numericValue: 0.02 },
        viewport: { score: 1 },
      },
    },
  };

  const result = mapPageSpeedResponse(body);
  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(result.usedFieldData, true);
  assert.equal(result.lcpMs, 3_100, 'field LCP wins over the lab number');
  assert.equal(result.cls, 0.12);
  assert.equal(result.inpMs, 180);
  assert.equal(result.performanceScore, 46);
  assert.equal(result.seoScore, 92);
  assert.equal(result.hasViewport, true);
});

test('falls back to the lab run when a site has no real-user data', () => {
  const result = mapPageSpeedResponse({
    lighthouseResult: {
      categories: { performance: { score: 0.88 } },
      audits: {
        'largest-contentful-paint': { numericValue: 2_140.6 },
        'cumulative-layout-shift': { numericValue: 0.0451 },
        viewport: { score: 0 },
      },
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(result.usedFieldData, false);
  assert.equal(result.lcpMs, 2_141);
  assert.equal(result.cls, 0.045);
  assert.equal(result.hasViewport, false);
  assert.equal(result.inpMs, undefined);
});

test('an API error becomes an unavailable result, not a throw', () => {
  const result = mapPageSpeedResponse({
    error: { message: 'Quota exceeded for quota metric Queries' },
  });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.reason, /Quota exceeded/);
});

test('an empty payload yields no metrics rather than fabricated zeros', () => {
  const result = mapPageSpeedResponse({});

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.lcpMs, undefined);
  assert.equal(result.cls, undefined);
  assert.equal(result.performanceScore, undefined);
  assert.equal(result.hasViewport, undefined);
});
