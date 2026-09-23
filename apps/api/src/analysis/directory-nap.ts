/**
 * Checks whether a directory listing page shows the community's own details.
 *
 * A listing page is not a tidy record: it carries nearby communities, "similar
 * options" panels and the directory's own contact details. So the question asked of
 * the page text is deliberately one-sided — *does our address / phone appear on this
 * page at all?* Finding it is proof the listing agrees with the website.
 *
 * Not finding it proves nothing, and this is where an audit does real damage if it
 * guesses. A Place for Mom does not publish street addresses at all; the first
 * address on Cloverland Park's page is 870 Oak Meadow Drive, a community three miles
 * away in the "nearby options" panel. Reported as "your listing shows a different
 * address", that is an afternoon wasted on a listing that was never wrong.
 *
 * So: page text can confirm a field, never contradict one. Only the page's own
 * structured data — the record the directory publishes about this business — is
 * allowed to disagree. Everything else comes back unverified.
 */

import { normalizeAddress, normalizePhone, type Nap } from '@sensi/shared';

import type { NapAlternates, NapField, NapMismatch } from './nap.js';
import type { PageSnapshot } from '../types/site.js';

export interface ListingPageComparison {
  /** True when every field we could compare agrees. Undefined when none could be. */
  matches?: boolean;
  compared: NapField[];
  mismatches: NapMismatch[];
  /** Why nothing could be compared, for the evidence trail. */
  reason?: string;
}

export interface ComparePageOptions {
  /** Leave the phone out — lead-gen directories publish a tracking number. */
  ignorePhone?: boolean;
  /** Other numbers and addresses the website publishes; any of them counts as ours. */
  alternates?: NapAlternates;
}

/** Candidate values of one kind found on the page, by how much they can prove. */
interface Pool {
  field: NapField;
  /** Our published values for this field — the primary first. */
  ours: string[];
  /** The directory's own record of this business. May contradict us. */
  claimed: string[];
  /** Values anywhere in the page text. May confirm us, never contradict us. */
  mentioned: string[];
  /** Loose match: "1420 Peachtree Rd Ste 200" should match "1420 Peachtree Road". */
  loose?: boolean;
}

function normalizedStreet(value: string | undefined): string | undefined {
  const normalized = normalizeAddress(value);
  return normalized && normalized.length >= 6 ? normalized : undefined;
}

export function compareListingPage(
  page: PageSnapshot,
  websiteNap: Nap,
  options: ComparePageOptions = {},
): ListingPageComparison {
  const structured = page.structuredData.postalAddress;
  const alternates = options.alternates ?? {};
  /** Our values for a field: the primary plus anything else the website publishes. */
  const ours = (primary: string | undefined, others: string[] = []): string[] => [
    ...new Set([...(primary ? [primary] : []), ...others]),
  ];

  const pools: Pool[] = [
    {
      field: 'street',
      ours: ours(websiteNap.street, alternates.street),
      claimed: structured?.street ? [structured.street] : [],
      mentioned: page.addressesInText,
      loose: true,
    },
    {
      field: 'city',
      ours: ours(websiteNap.city),
      claimed: structured?.city ? [structured.city] : [],
      mentioned: page.localitiesInText.map((locality) => locality.city),
    },
    {
      field: 'zipCode',
      ours: ours(websiteNap.zipCode),
      claimed: structured?.zipCode ? [structured.zipCode] : [],
      mentioned: page.localitiesInText.map((locality) => locality.zipCode),
    },
    {
      field: 'phone',
      ours: options.ignorePhone ? [] : ours(websiteNap.phone, alternates.phone),
      claimed: page.structuredData.telephone ? [page.structuredData.telephone] : [],
      mentioned: page.phonesInText,
    },
  ];

  const compared: NapField[] = [];
  const mismatches: NapMismatch[] = [];

  for (const pool of pools) {
    if (!pool.ours.length) continue;

    const canonical = (value: string): string | undefined => {
      switch (pool.field) {
        case 'street':
          return normalizedStreet(value);
        case 'phone':
          return normalizePhone(value);
        case 'zipCode':
          return value.trim().slice(0, 5);
        default:
          return value.trim().toLowerCase().replace(/\s+/g, ' ') || undefined;
      }
    };

    const clean = (values: string[]): string[] =>
      values.map((value) => canonical(value)).filter((value): value is string => Boolean(value));

    const mine = clean(pool.ours);
    if (!mine.length) continue;

    const agrees = (value: string): boolean =>
      mine.some((own) => (pool.loose ? value.includes(own) || own.includes(value) : value === own));

    const claimed = clean(pool.claimed);
    const mentioned = clean(pool.mentioned);

    // Our value somewhere on the page settles it, wherever it came from.
    if (claimed.some(agrees) || mentioned.some(agrees)) {
      compared.push(pool.field);
      continue;
    }

    // Absent from the page and the directory publishes its own record of this field:
    // the two genuinely disagree.
    if (claimed.length) {
      compared.push(pool.field);
      mismatches.push({
        field: pool.field,
        onWebsite: pool.ours[0]!.trim(),
        onListing: pool.claimed[0]!.trim(),
      });
    }

    // Otherwise the page never said, and neither do we.
  }

  if (!compared.length) {
    return {
      compared,
      mismatches,
      reason:
        'The listing page did not show an address or phone number we could compare with your website.',
    };
  }

  return { matches: mismatches.length === 0, compared, mismatches };
}
