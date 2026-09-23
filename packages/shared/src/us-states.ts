/**
 * State abbreviation → full name. Used when checking whether a page mentions its
 * region: a title may say "GA" or "Georgia", and both count.
 */

export const US_STATE_NAMES: Record<string, string> = {
  AL: 'Alabama',
  AK: 'Alaska',
  AZ: 'Arizona',
  AR: 'Arkansas',
  CA: 'California',
  CO: 'Colorado',
  CT: 'Connecticut',
  DE: 'Delaware',
  DC: 'District of Columbia',
  FL: 'Florida',
  GA: 'Georgia',
  HI: 'Hawaii',
  ID: 'Idaho',
  IL: 'Illinois',
  IN: 'Indiana',
  IA: 'Iowa',
  KS: 'Kansas',
  KY: 'Kentucky',
  LA: 'Louisiana',
  ME: 'Maine',
  MD: 'Maryland',
  MA: 'Massachusetts',
  MI: 'Michigan',
  MN: 'Minnesota',
  MS: 'Mississippi',
  MO: 'Missouri',
  MT: 'Montana',
  NE: 'Nebraska',
  NV: 'Nevada',
  NH: 'New Hampshire',
  NJ: 'New Jersey',
  NM: 'New Mexico',
  NY: 'New York',
  NC: 'North Carolina',
  ND: 'North Dakota',
  OH: 'Ohio',
  OK: 'Oklahoma',
  OR: 'Oregon',
  PA: 'Pennsylvania',
  RI: 'Rhode Island',
  SC: 'South Carolina',
  SD: 'South Dakota',
  TN: 'Tennessee',
  TX: 'Texas',
  UT: 'Utah',
  VT: 'Vermont',
  VA: 'Virginia',
  WA: 'Washington',
  WV: 'West Virginia',
  WI: 'Wisconsin',
  WY: 'Wyoming',
};

/** Full state name for an abbreviation, or undefined if it is not a US state. */
export function stateNameFor(abbreviation: string | undefined): string | undefined {
  if (!abbreviation) return undefined;
  return US_STATE_NAMES[abbreviation.trim().toUpperCase()];
}

const ABBREVIATION_BY_NAME: Record<string, string> = Object.fromEntries(
  Object.entries(US_STATE_NAMES).map(([abbreviation, name]) => [name.toLowerCase(), abbreviation]),
);

/**
 * Abbreviation for a full state name. Schema.org `addressRegion` carries either
 * form, so a site writing "Tennessee" still has to match a title saying "TN".
 */
export function stateAbbreviationFor(name: string | undefined): string | undefined {
  if (!name) return undefined;
  return ABBREVIATION_BY_NAME[name.trim().toLowerCase()];
}
