/**
 * Module C — On-Page Geo Signals (25 points, PRD 4.2).
 *
 * Ten checks over the crawled pages. Every `detail` string is written to be read
 * by an operator with no SEO background, and every check carries the one-sentence
 * "why it matters" that the UI shows as a tooltip and the PDF prints inline.
 */

import {
  CARE_TYPE_KEYWORDS,
  CARE_TYPE_LABELS,
  normalizeForKeywordMatch,
  stateAbbreviationFor,
  stateNameFor,
  type CareType,
  type CheckResult,
  type ModuleResult,
} from '@sensi/shared';

import { CWV_THRESHOLDS, type PageSpeedOutcome } from '../collectors/pagespeed.js';
import { assembleModule, check } from '../scoring/assemble.js';
import type { Locality, PageSnapshot, SiteSnapshot } from '../types/site.js';

const MODULE = 'onpage' as const;

export interface OnPageInput {
  site: SiteSnapshot;
  /** Care types to check for (operator-selected, or detected from the site). */
  careTypes: CareType[];
  /**
   * Authoritative locality when we have one. Phase 3 passes the city from the
   * matched Google listing; otherwise the crawler's own guess is used.
   */
  locality?: Locality;
  pageSpeed: PageSpeedOutcome;
}

/** City / state words that count as "mentions where you are". */
function localityTerms(locality: Locality | undefined): string[] {
  if (!locality) return [];
  // A site can write its state either way, so match both forms whichever we hold.
  const terms = [
    locality.city,
    locality.state,
    stateNameFor(locality.state),
    stateAbbreviationFor(locality.state),
  ];
  return terms
    .filter((term): term is string => Boolean(term && term.length > 1))
    .map((term) => normalizeForKeywordMatch(term));
}

function includesAny(haystack: string, needles: string[]): boolean {
  const normalized = normalizeForKeywordMatch(haystack);
  return needles.some((needle) => normalized.includes(needle));
}

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  const normalized = normalizeForKeywordMatch(haystack);
  let count = 0;
  let index = normalized.indexOf(needle);
  while (index !== -1) {
    count += 1;
    index = normalized.indexOf(needle, index + needle.length);
  }
  return count;
}

function careTypeKeywordsFor(careTypes: CareType[]): string[] {
  const source = careTypes.length ? careTypes : (Object.keys(CARE_TYPE_KEYWORDS) as CareType[]);
  return source.flatMap((careType) =>
    CARE_TYPE_KEYWORDS[careType].map((keyword) => normalizeForKeywordMatch(keyword)),
  );
}

function pageByRole(site: SiteSnapshot, role: PageSnapshot['roles'][number]): PageSnapshot | undefined {
  return site.pages.find((page) => page.roles.includes(role));
}

/** Care types that have their own H1/H2 heading somewhere on the site. */
function careTypesWithHeadings(site: SiteSnapshot, careTypes: CareType[]): CareType[] {
  const headingText = site.pages
    .flatMap((page) => page.headings.filter((heading) => heading.level <= 2))
    .map((heading) => normalizeForKeywordMatch(heading.text));

  return careTypes.filter((careType) =>
    CARE_TYPE_KEYWORDS[careType].some((keyword) => {
      const normalized = normalizeForKeywordMatch(keyword);
      return headingText.some((heading) => heading.includes(normalized));
    }),
  );
}

/* -------------------------------------------------------------------------- */
/* Individual checks                                                          */
/* -------------------------------------------------------------------------- */

function checkTitleCity(site: SiteSnapshot, locality: Locality | undefined): CheckResult {
  const base = {
    id: 'onpage.title_city',
    moduleId: MODULE,
    label: 'Your page title says what town you are in',
    maxPoints: 3,
    whyItMatters:
      'The title is the blue headline people see in Google, and naming your town helps you show up for searches in your area.',
  } as const;

  const title = site.homepage?.title;
  if (!title) {
    return check({
      ...base,
      status: 'fail',
      points: 0,
      detail: 'Your homepage has no title at all, so Google has nothing to show as your headline.',
    });
  }

  const terms = localityTerms(locality);
  if (!terms.length) {
    return check({
      ...base,
      status: 'unavailable',
      points: 0,
      detail: 'We could not tell which city your website is for.',
      unavailableReason:
        'No city and state were found on your website or in your Google listing, so we could not check this.',
      evidence: { title },
    });
  }

  const city = locality?.city ? normalizeForKeywordMatch(locality.city) : undefined;
  const stateTerms = terms.filter((term) => term !== city);

  if (city && includesAny(title, [city])) {
    return check({
      ...base,
      status: 'pass',
      points: 3,
      detail: `Your homepage title mentions ${locality?.city}.`,
      evidence: { title },
    });
  }

  if (includesAny(title, stateTerms)) {
    return check({
      ...base,
      status: 'warn',
      points: 1,
      detail: `Your title mentions your state but not ${locality?.city ?? 'your city'}. Adding the city name is a stronger signal.`,
      evidence: { title },
    });
  }

  return check({
    ...base,
    status: 'fail',
    points: 0,
    detail: `Your homepage title does not mention ${locality?.city ?? 'your city'} or your state. Current title: “${title}”.`,
    evidence: { title },
  });
}

function checkMetaDescription(
  site: SiteSnapshot,
  locality: Locality | undefined,
  careTypes: CareType[],
): CheckResult {
  const base = {
    id: 'onpage.meta_description',
    moduleId: MODULE,
    label: 'Your search summary mentions your town and the care you offer',
    maxPoints: 2,
    whyItMatters:
      'This is the short description under your link in Google, and it is often what decides whether a family clicks.',
  } as const;

  const description = site.homepage?.metaDescription;
  if (!description) {
    return check({
      ...base,
      status: 'fail',
      points: 0,
      detail: 'Your homepage has no search summary, so Google writes its own from whatever text it finds.',
    });
  }

  const hasLocality = includesAny(description, localityTerms(locality));
  const hasCareType = includesAny(description, careTypeKeywordsFor(careTypes));

  if (hasLocality && hasCareType) {
    return check({
      ...base,
      status: 'pass',
      points: 2,
      detail: 'Your search summary names both your area and the care you provide.',
      evidence: { description },
    });
  }

  const missing = [!hasLocality ? 'your city' : null, !hasCareType ? 'the type of care you offer' : null]
    .filter(Boolean)
    .join(' and ');

  return check({
    ...base,
    status: 'warn',
    points: 1,
    detail: `Your search summary is missing ${missing}.`,
    evidence: { description },
  });
}

function checkHeadings(site: SiteSnapshot, careTypes: CareType[]): CheckResult {
  const base = {
    id: 'onpage.headings_care_type',
    moduleId: MODULE,
    label: 'Your page headings name the types of care you offer',
    maxPoints: 3,
    whyItMatters:
      'Headings tell both Google and AI assistants what each page is about, so the care you offer should appear in them.',
  } as const;

  if (!careTypes.length) {
    return check({
      ...base,
      status: 'fail',
      points: 0,
      detail:
        'We could not find any care types on your website — no mention of assisted living, memory care, or similar.',
    });
  }

  const covered = careTypesWithHeadings(site, careTypes);
  const missing = careTypes.filter((careType) => !covered.includes(careType));
  const missingLabels = missing.map((careType) => CARE_TYPE_LABELS[careType]).join(', ');

  if (!covered.length) {
    return check({
      ...base,
      status: 'fail',
      points: 0,
      detail: `Your care types are mentioned in body text but never as a heading. Missing headings for: ${missingLabels}.`,
      evidence: { missing: missingLabels },
    });
  }

  if (missing.length) {
    return check({
      ...base,
      status: 'warn',
      points: 2,
      detail: `${covered.length} of your ${careTypes.length} care types have their own heading. Still missing: ${missingLabels}.`,
      evidence: { missing: missingLabels },
    });
  }

  return check({
    ...base,
    status: 'pass',
    points: 3,
    detail: `All ${careTypes.length} of your care types appear as headings.`,
  });
}

function checkBodyLocality(site: SiteSnapshot, locality: Locality | undefined): CheckResult {
  const base = {
    id: 'onpage.body_locality',
    moduleId: MODULE,
    label: 'Your pages talk about the area you serve',
    maxPoints: 2,
    whyItMatters:
      'Naming your town, county, or nearby landmarks in your writing tells search engines which area you serve.',
  } as const;

  const city = locality?.city;
  if (!city) {
    return check({
      ...base,
      status: 'unavailable',
      points: 0,
      detail: 'We could not tell which city your website is for.',
      unavailableReason: 'No city was found on your website or in your Google listing.',
    });
  }

  const allText = site.pages.map((page) => page.bodyText).join(' ');
  const mentions = countOccurrences(allText, normalizeForKeywordMatch(city));

  if (mentions >= 3) {
    return check({
      ...base,
      status: 'pass',
      points: 2,
      detail: `Your pages mention ${city} ${mentions} times.`,
      evidence: { mentions },
    });
  }

  if (mentions >= 1) {
    return check({
      ...base,
      status: 'warn',
      points: 1,
      detail: `${city} appears only ${mentions === 1 ? 'once' : `${mentions} times`} across your pages. Work it into your homepage and care pages naturally.`,
      evidence: { mentions },
    });
  }

  return check({
    ...base,
    status: 'fail',
    points: 0,
    detail: `Your pages never mention ${city} in the text.`,
    evidence: { mentions },
  });
}

function checkNapInText(site: SiteSnapshot): CheckResult {
  const base = {
    id: 'onpage.nap_in_text',
    moduleId: MODULE,
    label: 'Your address and phone number are real text, not a picture',
    maxPoints: 3,
    whyItMatters:
      'Search engines cannot read words inside an image, so contact details saved as a graphic are invisible to them.',
  } as const;

  const homepage = site.homepage;
  if (!homepage) {
    return check({
      ...base,
      status: 'unavailable',
      points: 0,
      detail: 'We could not read your homepage.',
      unavailableReason: 'Your homepage could not be opened.',
    });
  }

  const contactPage = pageByRole(site, 'contact');

  const hasAddress = (page: PageSnapshot): boolean =>
    page.addressesInText.length > 0 ||
    page.localitiesInText.length > 0 ||
    Boolean(page.structuredData.postalAddress?.street);
  const hasPhone = (page: PageSnapshot): boolean =>
    page.phonesInText.length > 0 || Boolean(page.structuredData.telephone);

  const homepageComplete = hasAddress(homepage) && hasPhone(homepage);
  const contactComplete = contactPage ? hasAddress(contactPage) && hasPhone(contactPage) : undefined;

  const evidence = {
    homepagePhones: homepage.phonesInText.length,
    homepageAddresses: homepage.addressesInText.length,
    homepageLocalities: homepage.localitiesInText.length,
    contactPageFound: Boolean(contactPage),
    ...(contactPage
      ? {
          contactPagePhones: contactPage.phonesInText.length,
          contactPageAddresses: contactPage.addressesInText.length,
          contactPageLocalities: contactPage.localitiesInText.length,
        }
      : {}),
  };

  if (homepageComplete && contactComplete !== false) {
    return check({
      ...base,
      status: 'pass',
      points: 3,
      detail: contactPage
        ? 'Your address and phone number appear as text on both your homepage and contact page.'
        : 'Your address and phone number appear as text on your homepage.',
      evidence,
    });
  }

  const missingParts: string[] = [];
  if (!hasAddress(homepage)) missingParts.push('your address is not in the homepage text');
  if (!hasPhone(homepage)) missingParts.push('your phone number is not in the homepage text');
  if (contactComplete === false) missingParts.push('your contact page is missing one of the two');

  if (homepageComplete || hasAddress(homepage) || hasPhone(homepage)) {
    return check({
      ...base,
      status: 'warn',
      points: 1.5,
      detail: `Partly there — ${missingParts.join(', ')}.`,
      evidence,
    });
  }

  return check({
    ...base,
    status: 'fail',
    points: 0,
    detail:
      'We found neither your address nor your phone number as text. If they are in a logo or banner image, search engines cannot read them.',
    evidence,
  });
}

function checkEmbeddedMap(site: SiteSnapshot): CheckResult {
  const base = {
    id: 'onpage.embedded_map',
    moduleId: MODULE,
    label: 'A map of your location is embedded on your site',
    maxPoints: 2,
    whyItMatters:
      'An embedded map confirms your location to search engines and saves families a step when they plan a visit.',
  } as const;

  const pageWithMap = site.pages.find((page) => page.hasEmbeddedMap);
  if (pageWithMap?.mapProvider === 'google') {
    return check({
      ...base,
      status: 'pass',
      points: 2,
      detail: 'A Google Map is embedded on your site.',
      evidence: { page: pageWithMap.finalUrl },
    });
  }

  if (pageWithMap) {
    return check({
      ...base,
      status: 'warn',
      points: 1,
      detail: `A map is embedded, but it is not a Google Map. A Google Map is the stronger signal.`,
      evidence: { page: pageWithMap.finalUrl, provider: pageWithMap.mapProvider },
    });
  }

  return check({
    ...base,
    status: 'fail',
    points: 0,
    detail: 'No embedded map was found on your homepage or contact page.',
  });
}

function checkLocalSchema(site: SiteSnapshot): CheckResult {
  const base = {
    id: 'onpage.local_schema',
    moduleId: MODULE,
    label: 'Your site has hidden code describing your business to Google',
    maxPoints: 4,
    whyItMatters:
      'This code (called schema markup) spells out your name, address, and services in a format Google and AI tools read directly.',
  } as const;

  const withSchema = site.pages.map((page) => page.structuredData);
  const seniorCare = withSchema.find((data) => data.hasSeniorCareType);
  const localBusiness = withSchema.find((data) => data.hasLocalBusiness);
  const invalidBlocks = withSchema.reduce((sum, data) => sum + data.invalidBlocks, 0);
  const types = [...new Set(withSchema.flatMap((data) => data.types))];

  if (seniorCare) {
    return check({
      ...base,
      status: 'pass',
      points: 4,
      detail: `Your site describes itself with senior-care-specific business code (${seniorCare.types.join(', ')}).`,
      evidence: { types },
    });
  }

  if (localBusiness) {
    return check({
      ...base,
      status: 'warn',
      points: 3,
      detail:
        'Your site has general business code but not a senior-care-specific type. Switching to a senior care type is a small change with a real benefit.',
      evidence: { types },
    });
  }

  if (invalidBlocks > 0) {
    return check({
      ...base,
      status: 'warn',
      points: 1,
      detail: `Your site has ${invalidBlocks} block${invalidBlocks === 1 ? '' : 's'} of this code, but ${invalidBlocks === 1 ? 'it is' : 'they are'} broken and cannot be read.`,
      evidence: { invalidBlocks },
    });
  }

  return check({
    ...base,
    status: 'fail',
    points: 0,
    detail: 'Your site has none of this code, so Google has to guess what your business does.',
    evidence: { types },
  });
}

function checkServiceAreaPages(site: SiteSnapshot): CheckResult {
  const base = {
    id: 'onpage.service_area_pages',
    moduleId: MODULE,
    label: 'You have pages for the areas or communities you serve',
    maxPoints: 2,
    whyItMatters:
      'If you serve more than one town or run more than one community, each one needs its own page to show up in that area’s searches.',
  } as const;

  const serviceAreaPage = pageByRole(site, 'service_area');
  const distinctCities = new Set(
    site.pages.flatMap((page) => page.localitiesInText.map((locality) => locality.city.toLowerCase())),
  );

  if (serviceAreaPage) {
    return check({
      ...base,
      status: 'pass',
      points: 2,
      detail: 'You have a locations or service-area page.',
      evidence: { page: serviceAreaPage.finalUrl },
    });
  }

  if (distinctCities.size > 1) {
    return check({
      ...base,
      status: 'fail',
      points: 0,
      detail: `Your site mentions ${distinctCities.size} different towns but has no page for each area, so you are competing for all of them with one page.`,
      evidence: { cities: [...distinctCities] },
    });
  }

  return check({
    ...base,
    status: 'pass',
    points: 2,
    detail: 'You appear to serve a single location, so separate service-area pages are not needed.',
  });
}

function checkPageSpeed(pageSpeed: PageSpeedOutcome): CheckResult {
  const base = {
    id: 'onpage.page_speed',
    moduleId: MODULE,
    label: 'Your website loads quickly on a phone',
    maxPoints: 2,
    whyItMatters:
      'Most families search on a phone, and a slow site loses visitors before the page even appears.',
  } as const;

  if (!pageSpeed.ok) {
    return check({
      ...base,
      status: 'unavailable',
      points: 0,
      detail: 'We could not measure your loading speed this time.',
      unavailableReason: pageSpeed.reason,
    });
  }

  const { lcpMs, cls, performanceScore, usedFieldData } = pageSpeed;
  if (lcpMs === undefined && cls === undefined && performanceScore === undefined) {
    return check({
      ...base,
      status: 'unavailable',
      points: 0,
      detail: 'Google’s speed test returned no usable measurements.',
      unavailableReason: 'The speed test ran but reported no metrics for your site.',
    });
  }

  const evidence = {
    lcpSeconds: lcpMs === undefined ? undefined : Number((lcpMs / 1000).toFixed(1)),
    cls,
    performanceScore,
    measurementSource: usedFieldData ? 'real visitors' : 'lab test',
  };

  const lcpGood = lcpMs === undefined ? undefined : lcpMs <= CWV_THRESHOLDS.lcpMs;
  const clsGood = cls === undefined ? undefined : cls <= CWV_THRESHOLDS.cls;
  const problems: string[] = [];
  if (lcpGood === false) {
    problems.push(`your main content takes ${(lcpMs! / 1000).toFixed(1)} seconds to appear (2.5 is the target)`);
  }
  if (clsGood === false) problems.push('your page shifts around while it loads');

  if (!problems.length) {
    return check({
      ...base,
      status: 'pass',
      points: 2,
      detail:
        lcpMs === undefined
          ? `Your mobile speed score is ${performanceScore}/100.`
          : `Your main content appears in ${(lcpMs / 1000).toFixed(1)} seconds, within Google's target.`,
      evidence,
    });
  }

  return check({
    ...base,
    status: problems.length === 1 ? 'warn' : 'fail',
    points: problems.length === 1 ? 1 : 0,
    detail: `On a phone, ${problems.join(' and ')}.`,
    evidence,
  });
}

function checkMobileFriendly(site: SiteSnapshot, pageSpeed: PageSpeedOutcome): CheckResult {
  const base = {
    id: 'onpage.mobile_friendly',
    moduleId: MODULE,
    label: 'Your website works properly on a phone',
    maxPoints: 2,
    whyItMatters:
      'Google ranks the phone version of your site, and families browsing on a phone will leave a site they have to pinch and zoom.',
  } as const;

  // PSI's viewport audit is the stronger signal; our own parse is the fallback.
  const psiViewport = pageSpeed.ok ? pageSpeed.hasViewport : undefined;
  const parsedViewport = site.homepage?.hasViewportMeta;

  if (psiViewport === undefined && parsedViewport === undefined) {
    return check({
      ...base,
      status: 'unavailable',
      points: 0,
      detail: 'We could not check how your site behaves on a phone.',
      unavailableReason: 'Your homepage could not be read and the speed test was unavailable.',
    });
  }

  const isMobileReady = psiViewport ?? parsedViewport ?? false;
  const seoScore = pageSpeed.ok ? pageSpeed.seoScore : undefined;

  if (isMobileReady) {
    return check({
      ...base,
      status: 'pass',
      points: 2,
      detail: 'Your site is set up to resize for phone screens.',
      evidence: { seoScore, checkedVia: psiViewport === undefined ? 'page markup' : "Google's test" },
    });
  }

  return check({
    ...base,
    status: 'fail',
    points: 0,
    detail:
      'Your site is missing the setting that tells phones how to size the page, so it likely appears zoomed out and hard to read.',
    evidence: { seoScore },
  });
}

/* -------------------------------------------------------------------------- */
/* Module                                                                     */
/* -------------------------------------------------------------------------- */

export function scoreOnPage(input: OnPageInput): ModuleResult {
  const { site, careTypes, pageSpeed } = input;
  const locality = input.locality ?? site.locality;

  if (!site.homepage) {
    const reason =
      site.failedPages[0]?.blockedByRobots === true
        ? 'Your website asks search crawlers not to read it, so we could not review your pages.'
        : 'We could not open your website, so the website checks were skipped.';

    return assembleModule(MODULE, [], {
      statusLine: reason,
      unavailableReason: reason,
    });
  }

  const checks = [
    checkTitleCity(site, locality),
    checkMetaDescription(site, locality, careTypes),
    checkHeadings(site, careTypes),
    checkBodyLocality(site, locality),
    checkNapInText(site),
    checkEmbeddedMap(site),
    checkLocalSchema(site),
    checkServiceAreaPages(site),
    checkPageSpeed(pageSpeed),
    checkMobileFriendly(site, pageSpeed),
  ];

  return assembleModule(MODULE, checks);
}

/** Total points the module's checks can award — must equal the PRD weight of 25. */
export const ON_PAGE_MAX_CHECK_POINTS = 25;
