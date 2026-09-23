/**
 * What the crawler collects from a website. Server-side only — the frontend sees
 * the scored `ModuleResult`, not raw page data.
 */

import type { CareType } from '@sensi/shared';

/**
 * Why a page was fetched, which decides which checks apply to it.
 * `directory_listing` is a page on somebody else's site — a Caring.com or
 * YellowPages listing — read only to verify the details it shows.
 */
export type PageRole =
  | 'homepage'
  | 'contact'
  | 'care_type'
  | 'service_area'
  | 'faq'
  | 'about'
  | 'directory_listing';

export interface Heading {
  level: 1 | 2 | 3;
  text: string;
}

/**
 * A question the site asks itself, with the length of the answer underneath.
 *
 * Module E scores these: a question a family would actually ask, answered in prose
 * long enough to quote, is the unit an AI assistant lifts into its answer.
 */
export interface QuestionSection {
  question: string;
  answerWords: number;
}

export interface StructuredDataSummary {
  /** Every @type found across all JSON-LD blocks. */
  types: string[];
  /** True when a LocalBusiness (or subtype) / SeniorCare-style entity is present. */
  hasLocalBusiness: boolean;
  /** True for senior-care-specific types, which are a stronger signal. */
  hasSeniorCareType: boolean;
  /** Address pulled from a PostalAddress node, when present. */
  postalAddress?: {
    street?: string;
    city?: string;
    state?: string;
    zipCode?: string;
  };
  telephone?: string;
  businessName?: string;
  /** FAQPage Question nodes carrying a real answer, which AI answers quote from. */
  faqQuestions?: number;
  /** JSON-LD blocks that failed to parse — a real-world SEO problem worth noting. */
  invalidBlocks: number;
}

export interface PageSnapshot {
  requestedUrl: string;
  /** URL after redirects. */
  finalUrl: string;
  roles: PageRole[];
  httpStatus?: number;
  title?: string;
  metaDescription?: string;
  /** True when a <meta name="viewport"> is present. */
  hasViewportMeta: boolean;
  canonicalUrl?: string;
  headings: Heading[];
  /** Visible text with scripts, styles and nav boilerplate collapsed. */
  bodyText: string;
  /**
   * The same visible text, one entry per block element, in document order.
   *
   * `bodyText` joins blocks with a space, which is right for finding an address but
   * wrong for reading a sentence: a nav menu and a headline run together into
   * something that looks like prose and is not. Anything judging how a page *reads*
   * works from these instead.
   */
  textBlocks: string[];
  /** Word count of `bodyText`, used for thin-content checks. */
  wordCount: number;
  phonesInText: string[];
  /** Street addresses found in visible text. */
  addressesInText: string[];
  /** "City, ST 12345" matches found in visible text. */
  localitiesInText: Array<{ city: string; state: string; zipCode: string }>;
  structuredData: StructuredDataSummary;
  hasEmbeddedMap: boolean;
  mapProvider?: 'google' | 'apple' | 'bing' | 'other';
  /** Internal links, absolute and de-duplicated. */
  internalLinks: Array<{ url: string; text: string }>;
  /** Care types detected in this page's own content. */
  careTypes: CareType[];
  /** Question-style headings, in document order. */
  questionHeadings: string[];
  /** Question headings paired with how much answer follows each (Module E). */
  questionSections: QuestionSection[];
  fetchedVia: 'playwright' | 'http';
  /** Milliseconds the fetch took (diagnostic only, not a speed score). */
  fetchMs?: number;
}

export interface FailedPage {
  requestedUrl: string;
  roles: PageRole[];
  reason: string;
  /** True when robots.txt told us not to fetch it. */
  blockedByRobots?: boolean;
}

export interface Locality {
  city?: string;
  state?: string;
  zipCode?: string;
  /** Where the locality came from, so later phases can prefer a better source. */
  source: 'structured_data' | 'page_text' | 'google_places' | 'operator_input';
}

export interface SiteSnapshot {
  requestedUrl: string;
  /** Origin after redirects, e.g. https://www.example.com */
  origin: string;
  homepage?: PageSnapshot;
  pages: PageSnapshot[];
  failedPages: FailedPage[];
  /** Care types detected across the whole site. */
  careTypes: CareType[];
  /** Best guess at the community's city/state from the site itself. */
  locality?: Locality;
  /** Business name from structured data or the homepage title. */
  businessName?: string;
  warnings: string[];
}
