import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { CheckResult } from '@sensi/shared';

import type { PageSpeedOutcome } from '../collectors/pagespeed.js';
import type { PageSnapshot, SiteSnapshot } from '../types/site.js';
import { ON_PAGE_MAX_CHECK_POINTS, scoreOnPage } from './onpage.js';

function page(overrides: Partial<PageSnapshot> = {}): PageSnapshot {
  return {
    requestedUrl: 'https://sunrisemeadows.example/',
    finalUrl: 'https://sunrisemeadows.example/',
    roles: ['homepage'],
    hasViewportMeta: true,
    headings: [],
    bodyText: '',
    textBlocks: [],
    wordCount: 0,
    phonesInText: [],
    addressesInText: [],
    localitiesInText: [],
    structuredData: { types: [], hasLocalBusiness: false, hasSeniorCareType: false, invalidBlocks: 0 },
    hasEmbeddedMap: false,
    internalLinks: [],
    careTypes: [],
    questionHeadings: [],
    questionSections: [],
    fetchedVia: 'playwright',
    ...overrides,
  };
}

/** A community doing everything right, for the "full marks" case. */
function strongSite(): SiteSnapshot {
  const homepage = page({
    title: 'Sunrise Meadows | Assisted Living in Marietta, GA',
    metaDescription: 'Assisted living and memory care in Marietta, Georgia.',
    headings: [
      { level: 1, text: 'Welcome to Sunrise Meadows' },
      { level: 2, text: 'Assisted Living' },
      { level: 2, text: 'Memory Care' },
    ],
    bodyText:
      'Our Marietta community offers assisted living and memory care. Families across Marietta choose us. Call 770-555-0142. Serving Marietta since 1998.',
    phonesInText: ['7705550142'],
    addressesInText: ['1420 N. Peachtree Rd'],
    localitiesInText: [{ city: 'Marietta', state: 'GA', zipCode: '30060' }],
    structuredData: {
      types: ['AssistedLivingFacility'],
      hasLocalBusiness: false,
      hasSeniorCareType: true,
      invalidBlocks: 0,
      postalAddress: { street: '1420 N. Peachtree Rd', city: 'Marietta', state: 'GA', zipCode: '30060' },
      telephone: '(770) 555-0142',
    },
    hasEmbeddedMap: true,
    mapProvider: 'google',
    careTypes: ['assisted_living', 'memory_care'],
  });

  const contact = page({
    requestedUrl: 'https://sunrisemeadows.example/contact',
    finalUrl: 'https://sunrisemeadows.example/contact',
    roles: ['contact'],
    title: 'Contact Sunrise Meadows in Marietta, GA',
    bodyText: '1420 N. Peachtree Rd, Marietta, GA 30060. Call 770-555-0142.',
    phonesInText: ['7705550142'],
    addressesInText: ['1420 N. Peachtree Rd'],
    localitiesInText: [{ city: 'Marietta', state: 'GA', zipCode: '30060' }],
    hasEmbeddedMap: true,
    mapProvider: 'google',
  });

  return {
    requestedUrl: 'https://sunrisemeadows.example/',
    origin: 'https://sunrisemeadows.example',
    homepage,
    pages: [homepage, contact],
    failedPages: [],
    careTypes: ['assisted_living', 'memory_care'],
    locality: { city: 'Marietta', state: 'GA', zipCode: '30060', source: 'structured_data' },
    businessName: 'Sunrise Meadows',
    warnings: [],
  };
}

const goodSpeed: PageSpeedOutcome = {
  ok: true,
  performanceScore: 92,
  lcpMs: 1_900,
  cls: 0.02,
  hasViewport: true,
  seoScore: 100,
  usedFieldData: true,
  strategy: 'mobile',
};

const findCheck = (checks: CheckResult[], id: string): CheckResult => {
  const found = checks.find((check) => check.id === id);
  assert.ok(found, `expected check ${id}`);
  return found;
};

test('module check points sum to the PRD weight of 25', () => {
  const result = scoreOnPage({
    site: strongSite(),
    careTypes: ['assisted_living', 'memory_care'],
    pageSpeed: goodSpeed,
  });

  const total = result.checks.reduce((sum, check) => sum + check.maxPoints, 0);
  assert.equal(total, ON_PAGE_MAX_CHECK_POINTS);
  assert.equal(total, result.maxPoints);
});

test('a well-optimized site scores full marks', () => {
  const result = scoreOnPage({
    site: strongSite(),
    careTypes: ['assisted_living', 'memory_care'],
    pageSpeed: goodSpeed,
  });

  assert.equal(result.points, 25);
  assert.equal(result.percent, 100);
  assert.equal(result.indicator, 'green');
  assert.ok(result.checks.every((check) => check.status === 'pass'));
});

test('a bare site fails the checks it can be judged on', () => {
  const homepage = page({ title: 'Home', hasViewportMeta: false });
  const site: SiteSnapshot = {
    requestedUrl: 'https://bare.example/',
    origin: 'https://bare.example',
    homepage,
    pages: [homepage],
    failedPages: [],
    careTypes: [],
    warnings: [],
  };

  const result = scoreOnPage({
    site,
    careTypes: [],
    pageSpeed: { ok: false, reason: 'Google’s speed test is rate limiting us right now.' },
  });

  // Only the single-location service-area check earns points (2 of the 18 that
  // could be judged), rescaled onto the module's 25-point weight.
  assert.equal(result.percent, 11);
  assert.equal(result.points, 2.8);
  assert.equal(result.indicator, 'red');
  // No city anywhere means the city checks cannot be judged, not that they failed.
  assert.equal(findCheck(result.checks, 'onpage.title_city').status, 'unavailable');
  assert.equal(findCheck(result.checks, 'onpage.body_locality').status, 'unavailable');
  assert.equal(findCheck(result.checks, 'onpage.page_speed').status, 'unavailable');
  assert.equal(findCheck(result.checks, 'onpage.mobile_friendly').status, 'fail');
  assert.match(result.statusLine, /could not be verified/);
});

test('unavailable checks are excluded from the score, not counted as failures', () => {
  const site = strongSite();

  const withSpeed = scoreOnPage({
    site,
    careTypes: ['assisted_living', 'memory_care'],
    pageSpeed: goodSpeed,
  });
  const withoutSpeed = scoreOnPage({
    site,
    careTypes: ['assisted_living', 'memory_care'],
    pageSpeed: { ok: false, reason: 'rate limited' },
  });

  // Losing the speed test must not cost a site that passes everything else.
  assert.equal(withSpeed.percent, 100);
  assert.equal(withoutSpeed.percent, 100);
  assert.equal(withoutSpeed.points, 25);
  assert.equal(findCheck(withoutSpeed.checks, 'onpage.page_speed').points, 0);
});

test('a missing city in the title is scored, and state-only is a partial credit', () => {
  const site = strongSite();
  site.homepage!.title = 'Sunrise Meadows | Senior Living in Georgia';
  site.pages[0] = site.homepage!;

  const result = scoreOnPage({
    site,
    careTypes: ['assisted_living', 'memory_care'],
    pageSpeed: goodSpeed,
  });

  const titleCheck = findCheck(result.checks, 'onpage.title_city');
  assert.equal(titleCheck.status, 'warn');
  assert.equal(titleCheck.points, 1);
  assert.match(titleCheck.detail, /mentions your state but not Marietta/);
});

test('care types mentioned only in body text fail the heading check', () => {
  const site = strongSite();
  site.homepage!.headings = [{ level: 1, text: 'Welcome' }];
  site.pages = [site.homepage!];

  const result = scoreOnPage({
    site,
    careTypes: ['assisted_living', 'memory_care'],
    pageSpeed: goodSpeed,
  });

  const headingCheck = findCheck(result.checks, 'onpage.headings_care_type');
  assert.equal(headingCheck.status, 'fail');
  assert.match(headingCheck.detail, /never as a heading/);
});

test('multi-town sites without location pages fail the service-area check', () => {
  const site = strongSite();
  site.homepage!.localitiesInText = [
    { city: 'Marietta', state: 'GA', zipCode: '30060' },
    { city: 'Kennesaw', state: 'GA', zipCode: '30144' },
  ];
  site.pages = [site.homepage!];

  const result = scoreOnPage({
    site,
    careTypes: ['assisted_living'],
    pageSpeed: goodSpeed,
  });

  const areaCheck = findCheck(result.checks, 'onpage.service_area_pages');
  assert.equal(areaCheck.status, 'fail');
  assert.match(areaCheck.detail, /2 different towns/);
});

test('slow loading is scored from Core Web Vitals', () => {
  const result = scoreOnPage({
    site: strongSite(),
    careTypes: ['assisted_living', 'memory_care'],
    pageSpeed: { ...goodSpeed, lcpMs: 5_200, cls: 0.31 },
  });

  const speedCheck = findCheck(result.checks, 'onpage.page_speed');
  assert.equal(speedCheck.status, 'fail');
  assert.match(speedCheck.detail, /5\.2 seconds/);
  assert.match(speedCheck.detail, /shifts around/);
});

test('an unreadable website reports the module as unscored', () => {
  const result = scoreOnPage({
    site: {
      requestedUrl: 'https://blocked.example/',
      origin: 'https://blocked.example',
      pages: [],
      failedPages: [
        { requestedUrl: 'https://blocked.example/', roles: ['homepage'], reason: 'robots.txt', blockedByRobots: true },
      ],
      careTypes: [],
      warnings: [],
    },
    careTypes: [],
    pageSpeed: { ok: false, reason: 'not run' },
  });

  assert.equal(result.points, 0);
  assert.deepEqual(result.checks, []);
  assert.match(result.unavailableReason ?? '', /asks search crawlers not to read it/);
});
