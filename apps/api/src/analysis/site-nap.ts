/**
 * Reads the name, address and phone the community publishes on its own website.
 *
 * This is the reference NAP: every directory listing and the Google profile are
 * compared against it, so it prefers structured data (which the operator's web
 * team set deliberately) over text scraped off the page.
 */

import type { Nap } from '@sensi/shared';

import type { NapAlternates } from './nap.js';
import type { PageSnapshot, SiteSnapshot } from '../types/site.js';

/** Pages in the order we trust them for contact details. */
function orderedPages(site: SiteSnapshot): PageSnapshot[] {
  const contact = site.pages.filter((page) => page.roles.includes('contact'));
  const homepage = site.pages.filter((page) => page.roles.includes('homepage'));
  const rest = site.pages.filter(
    (page) => !page.roles.includes('contact') && !page.roles.includes('homepage'),
  );
  // Contact pages carry the canonical address; the homepage is the next best.
  return [...contact, ...homepage, ...rest];
}

export function websiteNapFrom(site: SiteSnapshot): Nap {
  const pages = orderedPages(site);
  const nap: Nap = {};

  if (site.businessName) nap.name = site.businessName;

  for (const page of pages) {
    const address = page.structuredData.postalAddress;
    if (!nap.street && address?.street) nap.street = address.street;
    if (!nap.city && address?.city) nap.city = address.city;
    if (!nap.state && address?.state) nap.state = address.state;
    if (!nap.zipCode && address?.zipCode) nap.zipCode = address.zipCode;
    if (!nap.phone && page.structuredData.telephone) nap.phone = page.structuredData.telephone;
    if (!nap.name && page.structuredData.businessName) nap.name = page.structuredData.businessName;
  }

  // Fall back to what is written on the page.
  for (const page of pages) {
    if (!nap.street && page.addressesInText[0]) nap.street = page.addressesInText[0];
    if (!nap.phone && page.phonesInText[0]) nap.phone = page.phonesInText[0];

    const locality = page.localitiesInText[0];
    if (locality) {
      if (!nap.city) nap.city = locality.city;
      if (!nap.state) nap.state = locality.state;
      if (!nap.zipCode) nap.zipCode = locality.zipCode;
    }
  }

  if (site.locality) {
    if (!nap.city) nap.city = site.locality.city;
    if (!nap.state && site.locality.state) nap.state = site.locality.state;
    if (!nap.zipCode && site.locality.zipCode) nap.zipCode = site.locality.zipCode;
  }

  const formatted = [nap.street, nap.city, [nap.state, nap.zipCode].filter(Boolean).join(' ')]
    .filter((part) => part && part.trim())
    .join(', ');
  if (formatted) nap.formattedAddress = formatted;

  return nap;
}

/**
 * Every name, address and phone number the website publishes — not just the primary.
 *
 * A community's site usually carries a sales number and a main number, and the one we
 * chose as primary is arbitrary. Without this, a listing using the other number reads
 * as an inconsistency the operator should go and fix, when in fact they published it
 * themselves.
 */
export function websiteNapAlternates(site: SiteSnapshot): NapAlternates {
  const names = new Set<string>();
  const streets = new Set<string>();
  const phones = new Set<string>();

  if (site.businessName) names.add(site.businessName);

  for (const page of site.pages) {
    const address = page.structuredData.postalAddress;
    if (address?.street) streets.add(address.street);
    if (page.structuredData.businessName) names.add(page.structuredData.businessName);
    if (page.structuredData.telephone) phones.add(page.structuredData.telephone);
    for (const street of page.addressesInText) streets.add(street);
    for (const phone of page.phonesInText) phones.add(phone);
  }

  const alternates: NapAlternates = {};
  if (names.size) alternates.name = [...names];
  if (streets.size) alternates.street = [...streets];
  if (phones.size) alternates.phone = [...phones];
  return alternates;
}
