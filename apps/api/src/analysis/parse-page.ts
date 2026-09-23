/**
 * Turns raw HTML into a `PageSnapshot`. Pure and network-free, so every
 * extraction rule is unit-testable against fixture HTML.
 */

import * as cheerio from 'cheerio';

import { detectCareTypes, normalizePhone } from '@sensi/shared';

import type {
  Heading,
  PageRole,
  PageSnapshot,
  QuestionSection,
  StructuredDataSummary,
} from '../types/site.js';

/** Elements whose text is never visible copy. */
const NON_CONTENT_SELECTOR = 'script, style, noscript, template, svg, iframe';

/**
 * Elements that render on their own line. Their boundaries must become whitespace,
 * otherwise `.text()` glues neighbours together — "Contact Us" followed by
 * "1420 Peachtree Road" reads as "Us1420", which no address or zip pattern matches.
 */
const BLOCK_SELECTOR =
  'address, article, aside, blockquote, br, dd, div, dl, dt, fieldset, figcaption, figure, footer, form, h1, h2, h3, h4, h5, h6, header, hr, li, main, nav, ol, p, pre, section, table, tbody, td, tfoot, th, thead, tr, ul';

/** The same list without the self-closing ones, for "does this element wrap others". */
const CONTAINER_SELECTOR = BLOCK_SELECTOR.split(', ')
  .filter((tag) => tag !== 'br' && tag !== 'hr')
  .join(', ');

/** US street address, e.g. "1420 N. Peachtree Rd, Suite 200". */
const STREET_ADDRESS_RE =
  /\b\d{1,6}\s+(?:[NSEW]\.?\s+)?[A-Za-z0-9'.-]+(?:\s+[A-Za-z0-9'.-]+){0,3}\s+(?:street|st|avenue|ave|road|rd|boulevard|blvd|drive|dr|lane|ln|court|ct|way|parkway|pkwy|highway|hwy|circle|cir|place|pl|terrace|ter|trail|trl|route|rte)\b\.?(?:\s*,?\s*(?:suite|ste|unit|apt|#)\s*[\w-]+)?/gi;

/**
 * Words that do not appear inside a street name. Directory pages set prose right
 * next to the address — "Floor plans available", "Open 24 Hours 1." — and the
 * pattern above reads that as a street, which then looks like the operator
 * publishing a different address. A candidate carrying one of these is not one.
 */
const NOT_IN_STREET_NAME = new Set([
  'hours', 'open', 'closed', 'floor', 'floors', 'plans', 'plan', 'available', 'availability',
  'travel', 'time', 'times', 'starting', 'cost', 'costs', 'pricing', 'price', 'month', 'monthly',
  'reviews', 'review', 'rating', 'ratings', 'photos', 'photo', 'call', 'tour', 'tours', 'visit',
  'min', 'minute', 'minutes', 'miles', 'mile', 'away', 'nearby', 'save', 'includes', 'included',
  'amenities', 'bedroom', 'bedrooms', 'bath', 'baths', 'studio', 'apartment', 'apartments',
]);

/** Street-type words, used to spot a "city" that is really part of an address. */
const STREET_TYPE_WORDS =
  /\b(street|st|avenue|ave|road|rd|boulevard|blvd|drive|dr|lane|ln|court|ct|parkway|pkwy|highway|hwy|circle|cir|terrace|ter|trail|trl|suite|ste)\b/i;

/**
 * Trims and sanity-checks one address match.
 *
 * A street address carries exactly one house number, so "License TN ACLF #500 6030
 * Cloverland Drive" keeps only "6030 Cloverland Drive" — the leading licence number
 * would otherwise make the community's own address disagree with every listing of it.
 */
export function cleanStreetAddress(raw: string): string | undefined {
  let value = collapseWhitespace(raw);
  while (/^\d+[.,]?\s+\d/.test(value)) value = value.replace(/^\d+[.,]?\s+/, '');

  const middle = value
    .split(' ')
    .slice(1, -1)
    .map((word) => word.replace(/[^A-Za-z]/g, '').toLowerCase());
  if (middle.some((word) => NOT_IN_STREET_NAME.has(word))) return undefined;

  return value;
}

/** "Marietta, GA 30060" — the pattern that reveals the community's city. */
const CITY_STATE_ZIP_RE = /\b([A-Z][A-Za-z.'-]*(?:[ ][A-Z][A-Za-z.'-]*){0,3}),\s*([A-Z]{2})\s+(\d{5})(?:-\d{4})?\b/g;

/** 10-digit US phone numbers in the formats operators actually publish. */
const PHONE_RE = /(?:\+?1[\s.-]?)?\(?\b[2-9]\d{2}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g;

/** JSON-LD @types that count as a local business entity. */
const LOCAL_BUSINESS_TYPES = new Set(
  [
    'LocalBusiness',
    'Organization',
    'MedicalOrganization',
    'MedicalBusiness',
    'Place',
    'HealthAndBeautyBusiness',
    'ProfessionalService',
  ].map((type) => type.toLowerCase()),
);

/** JSON-LD @types specific to senior care — a stronger relevance signal. */
const SENIOR_CARE_TYPES = new Set(
  [
    'SeniorCare',
    'AssistedLiving',
    'AssistedLivingFacility',
    'NursingHome',
    'RetirementCommunity',
    'ResidentialCareFacility',
    'HomeHealthCareService',
    'MedicalClinic',
    'Hospital',
  ].map((type) => type.toLowerCase()),
);

const QUESTION_START_RE =
  /^(what|how|who|when|where|why|which|can|could|do|does|did|is|are|should|will|would|may|might)\b/i;

function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

/** Flattens JSON-LD, following @graph and arrays, into plain nodes. */
function flattenJsonLd(node: unknown, output: Record<string, unknown>[] = []): Record<string, unknown>[] {
  if (Array.isArray(node)) {
    for (const item of node) flattenJsonLd(item, output);
    return output;
  }
  if (node && typeof node === 'object') {
    const record = node as Record<string, unknown>;
    output.push(record);
    if ('@graph' in record) flattenJsonLd(record['@graph'], output);
  }
  return output;
}

function typeNames(node: Record<string, unknown>): string[] {
  const raw = node['@type'];
  if (typeof raw === 'string') return [raw];
  if (Array.isArray(raw)) return raw.filter((value): value is string => typeof value === 'string');
  return [];
}

function asString(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length ? trimmed : undefined;
  }
  if (typeof value === 'number') return String(value);
  return undefined;
}

function extractStructuredData($: cheerio.CheerioAPI): StructuredDataSummary {
  const nodes: Record<string, unknown>[] = [];
  let invalidBlocks = 0;

  $('script[type="application/ld+json"]').each((_index, element) => {
    const raw = $(element).text();
    if (!raw.trim()) return;
    try {
      flattenJsonLd(JSON.parse(raw), nodes);
    } catch {
      invalidBlocks += 1;
    }
  });

  const types = unique(nodes.flatMap(typeNames));
  const lowerTypes = types.map((type) => type.toLowerCase());

  const summary: StructuredDataSummary = {
    types,
    hasLocalBusiness: lowerTypes.some((type) => LOCAL_BUSINESS_TYPES.has(type)),
    hasSeniorCareType: lowerTypes.some((type) => SENIOR_CARE_TYPES.has(type)),
    invalidBlocks,
  };

  // FAQPage markup is what puts a question in front of an AI assistant as an answer
  // it can lift, so a Question node with real answer text is worth counting.
  const faqQuestions = nodes.filter((node) => {
    if (!typeNames(node).some((type) => type.toLowerCase() === 'question')) return false;
    const accepted = node['acceptedAnswer'];
    if (!accepted || typeof accepted !== 'object') return false;
    const text = asString((accepted as Record<string, unknown>)['text']);
    return Boolean(text && text.trim().length > 20);
  }).length;
  if (faqQuestions) summary.faqQuestions = faqQuestions;

  // Prefer values attached to a business-like node over any stray node.
  const businessNode =
    nodes.find((node) =>
      typeNames(node).some((type) => SENIOR_CARE_TYPES.has(type.toLowerCase())),
    ) ??
    nodes.find((node) =>
      typeNames(node).some((type) => LOCAL_BUSINESS_TYPES.has(type.toLowerCase())),
    );

  if (businessNode) {
    const name = asString(businessNode['name']);
    if (name) summary.businessName = name;

    const telephone = asString(businessNode['telephone']);
    if (telephone) summary.telephone = telephone;
  }

  const addressNode = nodes.find((node) =>
    typeNames(node).some((type) => type.toLowerCase() === 'postaladdress'),
  );
  const inlineAddress = businessNode?.['address'];
  const address =
    addressNode ??
    (inlineAddress && typeof inlineAddress === 'object' && !Array.isArray(inlineAddress)
      ? (inlineAddress as Record<string, unknown>)
      : undefined);

  if (address) {
    const postalAddress: NonNullable<StructuredDataSummary['postalAddress']> = {};
    const street = asString(address['streetAddress']);
    const city = asString(address['addressLocality']);
    const state = asString(address['addressRegion']);
    const zipCode = asString(address['postalCode']);
    if (street) postalAddress.street = street;
    if (city) postalAddress.city = city;
    if (state) postalAddress.state = state;
    if (zipCode) postalAddress.zipCode = zipCode.slice(0, 5);
    if (Object.keys(postalAddress).length) summary.postalAddress = postalAddress;
  }

  return summary;
}

function detectEmbeddedMap($: cheerio.CheerioAPI): {
  hasEmbeddedMap: boolean;
  mapProvider?: PageSnapshot['mapProvider'];
} {
  const sources: string[] = [];
  $('iframe[src], iframe[data-src]').each((_index, element) => {
    const source = $(element).attr('src') ?? $(element).attr('data-src');
    if (source) sources.push(source.toLowerCase());
  });
  // Lazy-loaded map embeds are common; a container class is a weaker but real signal.
  $('[class*="map"], [id*="map"]').each((_index, element) => {
    const dataSource = $(element).attr('data-src') ?? $(element).attr('data-map-src');
    if (dataSource) sources.push(dataSource.toLowerCase());
  });

  for (const source of sources) {
    if (source.includes('google.com/maps') || source.includes('maps.google') || source.includes('maps.googleapis')) {
      return { hasEmbeddedMap: true, mapProvider: 'google' };
    }
  }
  for (const source of sources) {
    if (source.includes('maps.apple.com')) return { hasEmbeddedMap: true, mapProvider: 'apple' };
    if (source.includes('bing.com/maps')) return { hasEmbeddedMap: true, mapProvider: 'bing' };
    if (source.includes('mapbox') || source.includes('openstreetmap') || source.includes('/maps')) {
      return { hasEmbeddedMap: true, mapProvider: 'other' };
    }
  }

  return { hasEmbeddedMap: false };
}

/**
 * The page's visible copy, with a space wherever the layout has a line break.
 * Mutates its own throwaway document, so callers pass a dedicated load.
 */
function extractVisibleText($: cheerio.CheerioAPI): string {
  $(NON_CONTENT_SELECTOR).remove();
  $(BLOCK_SELECTOR).before(' ').after(' ');
  return collapseWhitespace($('body').text() || $.root().text());
}

/**
 * The page's text split at every block boundary, innermost block first.
 *
 * A sentence never spans two block elements, so this is what tells prose apart from a
 * navigation menu that happens to sit above a headline. Mutates its own document.
 */
export function extractTextBlocks($: cheerio.CheerioAPI): string[] {
  $(NON_CONTENT_SELECTOR).remove();
  // A <br> inside a paragraph is a line break, not a new block, so its boundary only
  // needs to become whitespace.
  $('br').before(' ');

  const blocks: string[] = [];
  $(CONTAINER_SELECTOR).each((_index, element) => {
    const node = $(element);
    // An outer wrapper's text is its children's text; only the innermost blocks count.
    if (node.find(CONTAINER_SELECTOR).length) return;
    const text = collapseWhitespace(node.text());
    if (text) blocks.push(text);
  });

  return unique(blocks);
}

function extractHeadings($: cheerio.CheerioAPI): Heading[] {
  const headings: Heading[] = [];
  $('h1, h2, h3').each((_index, element) => {
    const tagName = (element as { tagName?: string }).tagName?.toLowerCase() ?? 'h3';
    const level = tagName === 'h1' ? 1 : tagName === 'h2' ? 2 : 3;
    const text = collapseWhitespace($(element).text());
    if (text) headings.push({ level, text });
  });
  return headings;
}

/**
 * Question headings together with how much answer follows each one.
 *
 * This is the shape AI assistants reuse: a question a family would actually ask,
 * answered underneath in prose they can quote. A page of question headings with two
 * words under each is an accordion nobody can cite, so the answer length is the part
 * worth measuring.
 */
function extractQuestionSections($: cheerio.CheerioAPI): QuestionSection[] {
  const sections: QuestionSection[] = [];
  const seen = new Set<string>();

  const record = (question: string, answer: string): void => {
    const text = collapseWhitespace(question);
    // A question mark is required here, unlike `questionHeadings`. Marketing banners
    // start with question words without asking anything — "WHAT MAKES US DIFFERENT
    // AND BETTER" is a headline — and telling an operator to answer one of those in
    // full sentences is advice they would rightly ignore.
    if (!text || !text.includes('?')) return;
    const key = text.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    const words = collapseWhitespace(answer);
    sections.push({ question: text, answerWords: words ? words.split(' ').length : 0 });
  };

  /**
   * The answer under a heading.
   *
   * Usually the heading's own next siblings. When the heading is wrapped in its own
   * container — the common pattern in page builders — those are empty, and the answer
   * is next to the wrapper instead, so we step out and look again. Collection stops at
   * anything containing a heading, which is where the next question begins.
   */
  const answerUnder = (heading: cheerio.Cheerio<never>): string => {
    let node: cheerio.Cheerio<never> = heading;
    for (let depth = 0; depth < 3; depth += 1) {
      const parts: string[] = [];
      for (const sibling of node.nextAll().toArray()) {
        const element = $(sibling);
        const tag = (sibling as { tagName?: string }).tagName?.toLowerCase() ?? '';
        if (/^h[1-6]$/.test(tag) || element.find('h1, h2, h3, h4, h5, h6').length) break;
        parts.push(element.text());
      }
      const text = collapseWhitespace(parts.join(' '));
      if (text) return text;

      const parent = node.parent();
      if (!parent.length || parent.is('body')) break;
      node = parent as cheerio.Cheerio<never>;
    }
    return '';
  };

  // Headed sections: everything between this heading and the next one of any level.
  $('h2, h3, h4').each((_index, element) => {
    const heading = $(element) as cheerio.Cheerio<never>;
    record(heading.text(), answerUnder(heading));
  });

  // Accordions and definition lists, which is how most FAQ pages are actually built.
  $('details').each((_index, element) => {
    const details = $(element);
    const summary = details.find('summary').first();
    const answer = details.clone();
    answer.find('summary').remove();
    record(summary.text(), answer.text());
  });

  $('dt').each((_index, element) => {
    record($(element).text(), $(element).next('dd').text());
  });

  return sections;
}

function extractPhones($: cheerio.CheerioAPI, bodyText: string): string[] {
  const fromLinks: string[] = [];
  $('a[href^="tel:"]').each((_index, element) => {
    const href = $(element).attr('href');
    if (href) fromLinks.push(href.replace(/^tel:/i, ''));
  });

  const fromText = bodyText.match(PHONE_RE) ?? [];
  const normalized = [...fromLinks, ...fromText]
    .map((phone) => normalizePhone(phone))
    .filter((phone): phone is string => typeof phone === 'string' && phone.length === 10);

  return unique(normalized);
}

function extractInternalLinks(
  $: cheerio.CheerioAPI,
  baseUrl: string,
): Array<{ url: string; text: string }> {
  const base = new URL(baseUrl);
  const seen = new Set<string>();
  const links: Array<{ url: string; text: string }> = [];

  $('a[href]').each((_index, element) => {
    const href = $(element).attr('href');
    if (!href || /^(mailto:|tel:|javascript:|#)/i.test(href)) return;

    let resolved: URL;
    try {
      resolved = new URL(href, base);
    } catch {
      return;
    }
    if (resolved.hostname.replace(/^www\./, '') !== base.hostname.replace(/^www\./, '')) return;
    if (/\.(pdf|jpg|jpeg|png|gif|svg|webp|zip|docx?|xlsx?)$/i.test(resolved.pathname)) return;

    resolved.hash = '';
    const url = resolved.toString();
    if (seen.has(url)) return;
    seen.add(url);

    links.push({ url, text: collapseWhitespace($(element).text()) });
  });

  return links;
}

export interface ParsePageInput {
  html: string;
  requestedUrl: string;
  finalUrl?: string;
  roles: PageRole[];
  fetchedVia: PageSnapshot['fetchedVia'];
  httpStatus?: number;
  fetchMs?: number;
}

export function parsePage(input: ParsePageInput): PageSnapshot {
  const finalUrl = input.finalUrl ?? input.requestedUrl;
  const $ = cheerio.load(input.html);

  const title = collapseWhitespace($('title').first().text()) || undefined;
  const metaDescription =
    collapseWhitespace($('meta[name="description"]').attr('content') ?? '') || undefined;
  const canonicalUrl = $('link[rel="canonical"]').attr('href')?.trim() || undefined;
  const hasViewportMeta = $('meta[name="viewport"]').length > 0;

  const headings = extractHeadings($);

  // A second load, because reading the text destructively edits the document.
  const bodyText = extractVisibleText(cheerio.load(input.html));
  const textBlocks = extractTextBlocks(cheerio.load(input.html));

  const localitiesInText = unique(
    [...bodyText.matchAll(CITY_STATE_ZIP_RE)].map(
      (match) => `${match[1]!.trim()}|${match[2]!}|${match[3]!}`,
    ),
  )
    .map((packed) => {
      const [city, state, zipCode] = packed.split('|') as [string, string, string];
      return { city, state, zipCode };
    })
    // "6030 Cloverland Dr, Brentwood, TN 37027" wrapped over two lines can leave the
    // street in the city slot. A city has no house number and no street type.
    .filter((locality) => !/\d/.test(locality.city) && !STREET_TYPE_WORDS.test(locality.city));

  const addressesInText = unique(
    (bodyText.match(STREET_ADDRESS_RE) ?? [])
      .map((address) => cleanStreetAddress(address))
      .filter((address): address is string => Boolean(address)),
  ).slice(0, 10);

  const careTypeSource = [title ?? '', metaDescription ?? '', headings.map((h) => h.text).join(' '), bodyText].join(
    ' ',
  );

  const questionHeadings = headings
    .map((heading) => heading.text)
    .filter((text) => text.includes('?') || QUESTION_START_RE.test(text));

  const questionSections = extractQuestionSections(cheerio.load(input.html));

  const snapshot: PageSnapshot = {
    requestedUrl: input.requestedUrl,
    finalUrl,
    roles: input.roles,
    hasViewportMeta,
    headings,
    bodyText,
    textBlocks,
    wordCount: bodyText ? bodyText.split(/\s+/).length : 0,
    phonesInText: extractPhones($, bodyText),
    addressesInText,
    localitiesInText,
    structuredData: extractStructuredData($),
    internalLinks: extractInternalLinks($, finalUrl),
    careTypes: detectCareTypes(careTypeSource),
    questionHeadings,
    questionSections,
    fetchedVia: input.fetchedVia,
    ...detectEmbeddedMap($),
  };

  if (title) snapshot.title = title;
  if (metaDescription) snapshot.metaDescription = metaDescription;
  if (canonicalUrl) snapshot.canonicalUrl = canonicalUrl;
  if (input.httpStatus !== undefined) snapshot.httpStatus = input.httpStatus;
  if (input.fetchMs !== undefined) snapshot.fetchMs = input.fetchMs;

  return snapshot;
}
