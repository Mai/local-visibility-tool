/**
 * Compares the name, address and phone (NAP) a business publishes in two places.
 *
 * Consistency is the point: search engines treat "Suite 200" and "Ste 200", or two
 * different phone numbers, as evidence that they may be different businesses. The
 * comparison normalises away formatting that does not matter and reports only
 * differences a human would also call a difference.
 */

import {
  normalizeAddress,
  normalizeBusinessName,
  normalizePhone,
  stateAbbreviationFor,
  type Nap,
} from '@sensi/shared';

export type NapField = 'name' | 'street' | 'city' | 'state' | 'zipCode' | 'phone';

export interface NapMismatch {
  field: NapField;
  onWebsite?: string;
  onListing?: string;
}

export interface NapComparison {
  /** True when every field present on both sides agrees. */
  matches: boolean;
  /** Fields we could actually compare — both sides had a value. */
  compared: NapField[];
  mismatches: NapMismatch[];
}

/**
 * Everything else the website publishes, so a listing that uses the sales line
 * instead of the main line is not reported as an inconsistency.
 *
 * Senior living sites carry two or three numbers — "Sales", "Other Inquiries" — and
 * whichever one we picked as primary is arbitrary. A listing showing any number that
 * is on the website is consistent with the website.
 */
export interface NapAlternates {
  name?: string[];
  street?: string[];
  phone?: string[];
}

const FIELDS: NapField[] = ['name', 'street', 'city', 'state', 'zipCode', 'phone'];

/** Canonical form per field, so only meaningful differences survive. */
function canonical(field: NapField, value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  switch (field) {
    case 'name':
      return normalizeBusinessName(trimmed) || undefined;
    case 'street':
      return normalizeAddress(trimmed) || undefined;
    case 'city':
      return trimmed.toLowerCase().replace(/\s+/g, ' ');
    case 'state': {
      // "Tennessee" and "TN" are the same state.
      const abbreviation = stateAbbreviationFor(trimmed) ?? trimmed;
      return abbreviation.toUpperCase().slice(0, 2);
    }
    case 'zipCode':
      return trimmed.slice(0, 5);
    case 'phone':
      return normalizePhone(trimmed);
  }
}

/**
 * Fields where one value sitting inside the other is the same value.
 *
 * "6030 Cloverland Dr" vs "6030 Cloverland Dr Ste 100" is one address written twice,
 * and "Cloverland Park" vs "Cloverland Park Senior Living" is one business — the
 * shorter form is usually what the website's own title says. Neither is worth an
 * operator's time. City, state, zip and phone are exact or they are wrong.
 */
const CONTAINMENT_FIELDS = new Set<NapField>(['name', 'street']);

export function compareNap(
  website: Nap,
  listing: Nap,
  alternates: NapAlternates = {},
): NapComparison {
  const compared: NapField[] = [];
  const mismatches: NapMismatch[] = [];

  const agrees = (field: NapField, left: string, right: string): boolean =>
    CONTAINMENT_FIELDS.has(field) ? left.includes(right) || right.includes(left) : left === right;

  for (const field of FIELDS) {
    const websiteRaw = website[field];
    const listingRaw = listing[field];
    if (!websiteRaw || !listingRaw) continue;

    const left = canonical(field, websiteRaw);
    const right = canonical(field, listingRaw);
    if (!left || !right) continue;

    compared.push(field);

    if (agrees(field, left, right)) continue;

    // Before calling it a difference: is the listing's version published somewhere
    // else on the website?
    const alternateMatch = (alternates[field as keyof NapAlternates] ?? []).some((value) => {
      const other = canonical(field, value);
      return other ? agrees(field, other, right) : false;
    });
    if (alternateMatch) continue;

    mismatches.push({ field, onWebsite: websiteRaw.trim(), onListing: listingRaw.trim() });
  }

  return { matches: mismatches.length === 0, compared, mismatches };
}

/**
 * 0–1 overlap of the significant words in two business names, used to decide
 * whether a directory listing is the operator's community. "Sunrise Meadows Senior
 * Living" and "Sunrise Meadows" score 1: one is a shortening of the other.
 */
export function businessNameSimilarity(a: string | undefined, b: string | undefined): number {
  const words = (value: string | undefined): Set<string> =>
    new Set(
      (normalizeBusinessName(value) ?? '')
        .split(/\s+/)
        .filter((word) => word.length > 2),
    );

  const left = words(a);
  const right = words(b);
  if (!left.size || !right.size) return 0;

  let shared = 0;
  for (const word of left) if (right.has(word)) shared += 1;
  return shared / Math.min(left.size, right.size);
}

/** Field names as an operator would say them, for the findings text. */
export const NAP_FIELD_LABELS: Record<NapField, string> = {
  name: 'business name',
  street: 'street address',
  city: 'city',
  state: 'state',
  zipCode: 'zip code',
  phone: 'phone number',
};
