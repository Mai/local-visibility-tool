/**
 * Care types a senior living community can offer, plus the keyword vocabulary
 * used to detect each one in page copy, GBP fields and directory listings.
 */

export const CARE_TYPES = [
  'assisted_living',
  'memory_care',
  'independent_living',
  'skilled_nursing',
  'home_care',
  'respite_care',
] as const;

export type CareType = (typeof CARE_TYPES)[number];

/** Plain-language label shown in the UI and PDF. */
export const CARE_TYPE_LABELS: Record<CareType, string> = {
  assisted_living: 'Assisted Living',
  memory_care: 'Memory Care',
  independent_living: 'Independent Living',
  skilled_nursing: 'Skilled Nursing',
  home_care: 'Home Care',
  respite_care: 'Respite Care',
};

/**
 * Keywords that signal each care type. Matching is case-insensitive and
 * apostrophe-insensitive (see `normalizeForKeywordMatch`), so entries are
 * written in their natural form.
 */
export const CARE_TYPE_KEYWORDS: Record<CareType, readonly string[]> = {
  assisted_living: ['assisted living', 'assisted-living', 'personal care'],
  memory_care: [
    'memory care',
    'dementia care',
    "alzheimer's care",
    'alzheimers care',
    'alzheimer care',
  ],
  independent_living: [
    'independent living',
    'senior community',
    'retirement community',
    'continuing care retirement community',
    'ccrc',
  ],
  skilled_nursing: [
    'skilled nursing',
    'nursing home',
    'short-term rehab',
    'short term rehab',
    'rehabilitation',
  ],
  home_care: ['home care', 'in-home care', 'in home care', 'home health'],
  respite_care: ['respite care', 'respite stay', 'short-term stay'],
};

/**
 * The full detection vocabulary from the PRD, flattened. Used for generic
 * "does this page talk about senior care at all" checks.
 */
export const ALL_CARE_KEYWORDS: readonly string[] = [
  'assisted living',
  'memory care',
  'dementia care',
  "alzheimer's care",
  'independent living',
  'skilled nursing',
  'short-term rehab',
  'respite care',
  'home care',
  'in-home care',
  'personal care',
  'senior community',
  'retirement community',
  'continuing care retirement community',
  'ccrc',
];

/**
 * The Google Places search phrase that finds rivals in one category.
 *
 * Not just the display label lowercased: "home care" alone returns medical supply
 * stores and staffing agencies on Google, so the competitor search needs "home care
 * agency" to land on the same kind of business a family would actually be choosing
 * between. Independent living and skilled nursing get the same treatment for the
 * same reason — the bare label is ambiguous, the phrase a family would type is not.
 */
export const CARE_TYPE_SEARCH_TERMS: Record<CareType, string> = {
  assisted_living: 'assisted living',
  memory_care: 'memory care',
  independent_living: 'independent living community',
  skilled_nursing: 'nursing home',
  home_care: 'home care agency',
  respite_care: 'respite care',
};

/**
 * The phrases a family actually types, for the AI-visibility searches (Module E).
 *
 * Up to two per category, both about the *same* category — not, as this used to run,
 * two different detected care types. A home care agency's own page routinely mentions
 * "assisted living" while describing who it serves, and running that as one of the
 * two searches compared the agency against assisted living communities instead of
 * against other home care agencies.
 */
export const CARE_TYPE_FAMILY_QUERY_TERMS: Record<CareType, readonly string[]> = {
  assisted_living: ['assisted living', 'senior assisted living'],
  memory_care: ['memory care', 'dementia care'],
  independent_living: ['independent living', 'senior living'],
  skilled_nursing: ['skilled nursing', 'nursing home'],
  home_care: ['home care', 'senior home care'],
  respite_care: ['respite care', 'senior respite care'],
};

/**
 * Which detected care type actually decides who counts as a competitor.
 *
 * A page that talks about several levels of care is not necessarily several kinds of
 * business. A home care agency's site routinely says things like "when it's time to
 * consider assisted living, we can help you find the right fit" — "assisted living"
 * appears, but the agency is not one. The reverse essentially never happens: a
 * facility's site does not casually call itself "home care". So when both a
 * facility-style keyword and `home_care`/`respite_care` are present, the in-home type
 * wins the tiebreak; otherwise the first match in `CARE_TYPES` order is used, which is
 * the order the PRD lists them in.
 *
 * This is a guess, not a fact, and the operator can always override it — see
 * `AuditRequest.primaryCareType`.
 */
export function pickPrimaryCareType(careTypes: readonly CareType[]): CareType | undefined {
  if (careTypes.includes('home_care')) return 'home_care';
  if (careTypes.includes('respite_care')) return 'respite_care';
  return careTypes[0];
}

/** Google Places primary categories that indicate a senior care business. */
export const SENIOR_CARE_PLACE_TYPES: readonly string[] = [
  'assisted_living_facility',
  'nursing_home',
  'retirement_home',
  'elder_care',
  'home_health_care_service',
];

/**
 * Lowercases text and collapses curly apostrophes/whitespace so keyword
 * matching is resilient to typographic variation.
 */
export function normalizeForKeywordMatch(text: string): string {
  return text
    .toLowerCase()
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Returns the care types whose keywords appear anywhere in `text`. */
export function detectCareTypes(text: string): CareType[] {
  const haystack = normalizeForKeywordMatch(text);
  return CARE_TYPES.filter((careType) =>
    CARE_TYPE_KEYWORDS[careType].some((keyword) =>
      haystack.includes(normalizeForKeywordMatch(keyword)),
    ),
  );
}
