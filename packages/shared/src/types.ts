/**
 * The contract between the API and the web app. Every audit response the
 * frontend and the PDF renderer consume is described here.
 */

import type { CareType } from './care-types.js';
import type { DirectoryId } from './directories.js';
import type { ModuleId, ScoreBandId } from './scoring.js';

/* -------------------------------------------------------------------------- */
/* Request                                                                    */
/* -------------------------------------------------------------------------- */

export interface AuditRequest {
  /** Website URL as typed by the operator; the API normalizes it. */
  url: string;
  /** 5-digit US zip code of the community. */
  zipCode: string;
  /**
   * Care types the operator selected. When omitted or empty, the API detects
   * them from the website and the Google listing. These drive the on-page,
   * citation and AI-visibility keyword checks — what the site should say.
   */
  careTypes?: CareType[];
  /**
   * Which one of those the operator actually competes as, for finding rivals.
   * A site can mention several levels of care without being all of them — see
   * `pickPrimaryCareType`. When omitted, the API guesses from `careTypes`.
   */
  primaryCareType?: CareType;
  /** Skip the 24h cache and re-run every check. */
  refresh?: boolean;
}

/* -------------------------------------------------------------------------- */
/* Checks                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * `unavailable` means we could not verify the check (a directory blocked the
 * scraper, an API quota was hit). It never fails the whole audit, and it is
 * excluded from the denominator rather than counted as a failure.
 */
export type CheckStatus = 'pass' | 'warn' | 'fail' | 'unavailable';

export interface CheckResult {
  /** Stable machine id, e.g. `gbp.photos_min_10`. */
  id: string;
  moduleId: ModuleId;
  /** What was checked, in plain language. */
  label: string;
  status: CheckStatus;
  /** Points awarded for this check. */
  points: number;
  /** Points available for this check. */
  maxPoints: number;
  /** One-line finding shown to the operator, e.g. "You have 4 photos." */
  detail: string;
  /** Why this check exists, in one sentence. Powers the tooltip. */
  whyItMatters?: string;
  /** Reason a check came back `unavailable`. */
  unavailableReason?: string;
  /** Raw values behind the finding, for debugging and the PDF appendix. */
  evidence?: Record<string, unknown>;
}

export interface ModuleResult {
  moduleId: ModuleId;
  label: string;
  points: number;
  maxPoints: number;
  /** 0–100, for charts and the radar comparison. */
  percent: number;
  /** 'grey' means the module could not be scored at all, not that it scored badly. */
  indicator: 'green' | 'yellow' | 'red' | 'grey';
  /** One-line status shown on the module score card. */
  statusLine: string;
  checks: CheckResult[];
  /** Set when the module could not run at all (e.g. missing API key). */
  unavailableReason?: string;
}

/* -------------------------------------------------------------------------- */
/* Business identity                                                          */
/* -------------------------------------------------------------------------- */

/** Name, address and phone — the trio that must match everywhere. */
export interface Nap {
  name?: string;
  street?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  phone?: string;
  /** Single-line formatted address as reported by the source. */
  formattedAddress?: string;
}

export interface BusinessProfile {
  name: string;
  websiteUrl: string;
  zipCode: string;
  city?: string;
  state?: string;
  county?: string;
  nap: Nap;
  careTypes: CareType[];
  /** True when careTypes came from detection rather than operator input. */
  careTypesDetected: boolean;
  /** Which care type competitor search treated this business as. */
  primaryCareType?: CareType;
  /** True when primaryCareType came from a guess rather than operator input. */
  primaryCareTypeDetected: boolean;
  googlePlaceId?: string;
}

/* -------------------------------------------------------------------------- */
/* Reviews & citations                                                        */
/* -------------------------------------------------------------------------- */

export interface ReviewSnapshot {
  source: 'google' | 'yelp' | 'a_place_for_mom';
  rating?: number;
  reviewCount?: number;
  /** ISO date of the most recent review we could see. */
  mostRecentReviewAt?: string;
  reviewsInLast90Days?: number;
  /** 0–1 share of reviews with an owner response. */
  ownerResponseRate?: number;
  unavailableReason?: string;
}

/** Sentiment and language families use when they talk about the community. */
export interface ReviewThemes {
  /** Themes ranked by how often reviewers mention them. */
  topics: Array<{
    label: string;
    mentions: number;
    sentiment: 'positive' | 'mixed' | 'negative';
    /** A short representative quote, trimmed. */
    exampleQuote?: string;
  }>;
  /** Words and phrases reviewers use most, for the keyword panel. */
  keywords: Array<{ phrase: string; mentions: number }>;
  overallSentiment?: 'positive' | 'mixed' | 'negative';
}

export interface CitationResult {
  directoryId: DirectoryId;
  label: string;
  listingFound: boolean | null;
  listingUrl?: string;
  /** Whether name/address/phone match the website exactly. */
  napMatches?: boolean;
  napMismatches?: Array<{ field: keyof Nap; onWebsite?: string; onListing?: string }>;
  mentionsCareTypes?: boolean;
  duplicateListingsFound?: number;
  /** How this listing was verified. */
  verifiedVia?: 'api' | 'scrape' | 'serp';
  unavailableReason?: string;
}

/* -------------------------------------------------------------------------- */
/* AI search visibility (Module E)                                            */
/* -------------------------------------------------------------------------- */

/**
 * What one family-style search turned up — "assisted living in Brentwood, TN".
 *
 * These searches are what AI assistants read before they answer, so where a
 * community sits in them is the closest verifiable proxy for whether an assistant
 * will mention it.
 */
export interface AiSearchQuery {
  /** The search as a family would type it. */
  query: string;
  /** Position of the community's own website in the results, 1-based. */
  websiteRank?: number;
  /** Position of a page *about* the community, when its own site is absent. */
  mentionRank?: number;
  /** Domains ranking above the community, for the evidence trail. */
  aheadOfYou?: string[];
  /** Questions Google reports people also ask for this search. */
  peopleAlsoAsk?: string[];
  /** Whether a generated answer appeared, and whether it named the community. */
  generatedAnswer?: 'mentions_you' | 'no_mention' | 'not_shared';
  /** Set when the search could not be run at all. */
  unavailableReason?: string;
}

/** Somewhere other than the community's own site that talks about it. */
export interface ThirdPartyMention {
  domain: string;
  url: string;
  title: string;
}

/* -------------------------------------------------------------------------- */
/* Competitors                                                                */
/* -------------------------------------------------------------------------- */

export interface CompetitorScores {
  /** Module scores, 0–100, for the modules visible in public listing data. */
  moduleScores: Partial<Record<ModuleId, number>>;
  /** 0–100 across the compared modules only — see `CompetitiveComparison.basis`. */
  totalScore: number;
  /** Modules we could not evaluate for this competitor. */
  notEvaluated: ModuleId[];
}

export interface Competitor {
  name: string;
  googlePlaceId: string;
  websiteUrl?: string;
  formattedAddress?: string;
  zipCode?: string;
  /** Miles from the target community. */
  distanceMiles?: number;
  rating?: number;
  reviewCount?: number;
  careTypes: CareType[];
  scores: CompetitorScores;
}

export interface CompetitiveComparison {
  competitors: Competitor[];
  /** Zip codes the search reached: the community's own plus its neighbours. */
  zipCodesSearched: string[];
  /** How far out we looked, in miles. */
  radiusMiles?: number;
  /**
   * The modules this comparison covers. Only what Google publishes about every
   * business is visible for a competitor, so the website, directory and AI-visibility
   * modules are not part of it.
   */
  comparedModules: ModuleId[];
  /** One sentence saying what the comparison is, for the operator to read. */
  basis: string;
  /** The community's own score on the compared modules only, 0–100. */
  targetScore: number;
  /** Average competitor total score, for the "above/below average" language. */
  averageCompetitorScore: number;
  /** 1 = best in the set (target included). */
  targetRank: number;
  setSize: number;
  /** Plain-language callouts, e.g. "You have fewer reviews than 3 of 5…". */
  insights: Array<{
    moduleId: ModuleId | 'overall';
    standing: 'leading' | 'average' | 'trailing';
    message: string;
  }>;
}

/* -------------------------------------------------------------------------- */
/* Recommendations                                                            */
/* -------------------------------------------------------------------------- */

export type EffortLevel = 'easy' | 'medium' | 'hard';
export type ImpactLevel = 'high' | 'medium' | 'low';
export type RecommendationGroup = 'quick_wins' | 'strategic' | 'ongoing' | 'nice_to_have';

export interface Recommendation {
  id: string;
  moduleId: ModuleId;
  /** What to fix — plain English, no jargon. */
  title: string;
  /** Why it matters, one sentence. */
  whyItMatters: string;
  /** How to fix it, as steps a non-technical user can follow. */
  steps: string[];
  effort: EffortLevel;
  impact: ImpactLevel;
  group: RecommendationGroup;
  /** Points recoverable if this is fixed; drives the ranking. */
  estimatedPointGain: number;
  /** Checks this recommendation resolves. */
  relatedCheckIds: string[];
}

/* -------------------------------------------------------------------------- */
/* Progress (loading screen)                                                  */
/* -------------------------------------------------------------------------- */

export const AUDIT_STEP_IDS = [
  'validate_site',
  'read_website',
  'google_listing',
  'listings',
  'reviews',
  'ai_visibility',
  'competitors',
  'scoring',
] as const;

export type AuditStepId = (typeof AUDIT_STEP_IDS)[number];

export type AuditStepStatus = 'pending' | 'running' | 'done' | 'skipped' | 'failed';

export interface AuditStep {
  id: AuditStepId;
  /** Plain-language label, e.g. "Checking your Google listing…". */
  label: string;
  status: AuditStepStatus;
  /** Populated when a step is skipped or fails without stopping the audit. */
  note?: string;
}

export type AuditStatus = 'queued' | 'running' | 'complete' | 'failed';

/** Shape polled by the loading screen while an audit runs. */
export interface AuditProgress {
  auditId: string;
  status: AuditStatus;
  steps: AuditStep[];
  /** 0–100. */
  percentComplete: number;
  /**
   * The site being audited, so the waiting screen can name it.
   *
   * It comes from the job rather than the browser's history state: an operator who
   * reloads the page, or opens the link on their phone, should still see which
   * community they are waiting on.
   */
  websiteUrl?: string;
  error?: string;
}

/* -------------------------------------------------------------------------- */
/* Result                                                                     */
/* -------------------------------------------------------------------------- */

export interface AuditResult {
  auditId: string;
  /** ISO timestamp of when the audit ran. */
  completedAt: string;
  request: AuditRequest;
  business: BusinessProfile;

  totalScore: number;
  maxScore: number;
  band: ScoreBandId;
  bandLabel: string;
  bandSummary: string;
  /**
   * Modules left out of the total because nothing in them could be verified. Their
   * points leave the denominator rather than scoring zero (PRD 5.4), so the score is
   * a share of what we could check.
   */
  modulesNotScored: ModuleId[];

  modules: ModuleResult[];
  citations: CitationResult[];
  reviews: ReviewSnapshot[];
  reviewThemes?: ReviewThemes;
  /** The family-style searches Module E ran, and where the community placed. */
  aiSearches?: AiSearchQuery[];
  comparison?: CompetitiveComparison;
  recommendations: Recommendation[];

  /** Checks that could not be verified, surfaced honestly in UI and PDF. */
  unavailableChecks: Array<{ id: string; label: string; reason: string }>;
  /** Non-fatal problems worth telling the operator about. */
  warnings: string[];
}

/* -------------------------------------------------------------------------- */
/* API envelopes                                                              */
/* -------------------------------------------------------------------------- */

export interface ApiError {
  error: {
    code: string;
    /** Message safe to show the operator as-is. */
    message: string;
    details?: unknown;
  };
}

export interface StartAuditResponse {
  auditId: string;
  status: AuditStatus;
}

export interface PdfExportRequest {
  auditId: string;
}
