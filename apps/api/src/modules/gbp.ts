/**
 * Module A — Google Business Profile (25 points, PRD 4.2).
 *
 * Everything here comes from the public Google Places record for the community.
 * Several things the operator's own dashboard shows are simply not in the public
 * data — Q&A, Posts, the description they wrote, and for most senior living
 * listings the category they chose — so those checks report "unable to verify"
 * and drop out of the denominator rather than punishing a profile we cannot see
 * (PRD 5.4). The advice still appears; only the score stays silent.
 */

import {
  CARE_TYPE_KEYWORDS,
  normalizeForKeywordMatch,
  type CareType,
  type CheckResult,
  type ModuleResult,
  type Nap,
} from '@sensi/shared';

import { compareNap, NAP_FIELD_LABELS, type NapAlternates } from '../analysis/nap.js';
import {
  hasPublishedCategory,
  hasSeniorCarePrimaryType,
  placesAddress,
  placesPhone,
  seniorCareTypes,
  type FindPlaceOutcome,
  type PlacesPlace,
} from '../collectors/places.js';
import { assembleModule, check } from '../scoring/assemble.js';

const MODULE = 'gbp' as const;

/** Photos a well-tended senior living profile carries. */
const GOOD_PHOTO_COUNT = 10;
const MINIMUM_PHOTO_COUNT = 3;

export interface GbpInput {
  /** Result of looking the community up in Google's directory. */
  lookup: FindPlaceOutcome;
  /** Full listing details, when the lookup found a match. */
  place?: PlacesPlace;
  /** NAP as published on the operator's own website. */
  websiteNap: Nap;
  /** Other names, addresses and numbers the website publishes. */
  napAlternates?: NapAlternates;
  websiteUrl: string;
  careTypes: CareType[];
  /** City we believe the community is in, for the description check. */
  city?: string;
}

/** The listing's NAP in the shape the comparison expects. */
export function napFromPlace(place: PlacesPlace): Nap {
  const address = placesAddress(place);
  const phone = placesPhone(place);
  const nap: Nap = {};
  const name = place.displayName?.text;
  if (name) nap.name = name;
  if (address.street) nap.street = address.street;
  if (address.city) nap.city = address.city;
  if (address.state) nap.state = address.state;
  if (address.zipCode) nap.zipCode = address.zipCode;
  if (phone) nap.phone = phone;
  if (place.formattedAddress) nap.formattedAddress = place.formattedAddress;
  return nap;
}

function hostOf(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url).hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return undefined;
  }
}

/** The reason string to show when a check needs a listing we do not have. */
function noListingReason(lookup: FindPlaceOutcome): string {
  if (lookup.ok) return 'Your Google listing could not be read in full.';
  if ('missingKey' in lookup && lookup.missingKey) return lookup.reason;
  if ('notFound' in lookup) return 'We could not find your Google listing, so this could not be checked.';
  return lookup.reason;
}

/* -------------------------------------------------------------------------- */
/* Individual checks                                                          */
/* -------------------------------------------------------------------------- */

function checkListingFound(lookup: FindPlaceOutcome, place: PlacesPlace | undefined): CheckResult {
  const base = {
    id: 'gbp.listing_found',
    moduleId: MODULE,
    label: 'You have a Google Business Profile we can find',
    maxPoints: 5,
    whyItMatters:
      'Your Google listing is what families see in Maps and in the local results box — for most communities it is the single biggest source of enquiries.',
  } as const;

  if (!lookup.ok) {
    if ('missingKey' in lookup && lookup.missingKey) {
      return check({
        ...base,
        status: 'unavailable',
        points: 0,
        detail: 'We could not check your Google listing this time.',
        unavailableReason: lookup.reason,
      });
    }

    if ('notFound' in lookup) {
      return check({
        ...base,
        status: 'fail',
        points: 0,
        detail:
          'We could not find a Google Business Profile for your community. Creating and verifying one is the highest-value thing you can do for local search.',
        evidence: { nearbyListings: lookup.alternatives.map((item) => item.name) },
      });
    }

    return check({
      ...base,
      status: 'unavailable',
      points: 0,
      detail: 'We could not check your Google listing this time.',
      unavailableReason: lookup.reason,
    });
  }

  const status = place?.businessStatus;
  if (status && status !== 'OPERATIONAL') {
    return check({
      ...base,
      status: 'warn',
      points: 2.5,
      detail:
        status === 'CLOSED_TEMPORARILY'
          ? 'Google shows your listing as temporarily closed. Families searching for care will skip it.'
          : 'Google shows your listing as closed. That needs fixing before anything else.',
      evidence: { businessStatus: status },
    });
  }

  // A loose match means we found *a* listing but cannot be certain it is theirs.
  if (lookup.matchedOn === 'name') {
    return check({
      ...base,
      status: 'warn',
      points: 3.5,
      detail:
        'We found a Google listing with a similar name, but its website and zip code do not match yours. If this is your listing, make sure it links to your website.',
      evidence: { listingName: place?.displayName?.text, matchedOn: lookup.matchedOn },
    });
  }

  return check({
    ...base,
    status: 'pass',
    points: 5,
    detail: `Your Google listing is live${place?.displayName?.text ? ` as “${place.displayName.text}”` : ''}.`,
    evidence: { matchedOn: lookup.matchedOn, mapsUrl: place?.googleMapsUri },
  });
}

function checkNapMatch(
  lookup: FindPlaceOutcome,
  place: PlacesPlace | undefined,
  websiteNap: Nap,
  alternates: NapAlternates,
): CheckResult {
  const base = {
    id: 'gbp.nap_match',
    moduleId: MODULE,
    label: 'Your Google listing matches your website exactly',
    maxPoints: 4,
    whyItMatters:
      'When your name, address and phone number differ between your listing and your website, Google is less sure the two are the same business and trusts both less.',
  } as const;

  if (!place) {
    return check({
      ...base,
      status: 'unavailable',
      points: 0,
      detail: 'We could not compare your listing with your website.',
      unavailableReason: noListingReason(lookup),
    });
  }

  const comparison = compareNap(websiteNap, napFromPlace(place), alternates);

  if (!comparison.compared.length) {
    return check({
      ...base,
      status: 'unavailable',
      points: 0,
      detail: 'We could not find enough contact details to compare.',
      unavailableReason:
        'Your website did not show an address or phone number we could compare with your Google listing.',
    });
  }

  if (comparison.matches) {
    return check({
      ...base,
      status: 'pass',
      points: 4,
      detail: `Your ${comparison.compared.map((field) => NAP_FIELD_LABELS[field]).join(', ')} match on both.`,
      evidence: { compared: comparison.compared },
    });
  }

  const fields = comparison.mismatches.map((mismatch) => NAP_FIELD_LABELS[mismatch.field]);
  const phoneOrAddress = comparison.mismatches.some(
    (mismatch) => mismatch.field === 'phone' || mismatch.field === 'street',
  );

  return check({
    ...base,
    // A different phone or street is a real trust problem; a name variation is minor.
    status: phoneOrAddress ? 'fail' : 'warn',
    points: phoneOrAddress ? 0 : 2,
    detail: `Your ${fields.join(' and ')} ${fields.length === 1 ? 'is' : 'are'} different on your Google listing than on your website. Pick one version and use it everywhere.`,
    evidence: { mismatches: comparison.mismatches },
  });
}

function checkCategories(
  lookup: FindPlaceOutcome,
  place: PlacesPlace | undefined,
  careTypes: CareType[],
): CheckResult {
  const base = {
    id: 'gbp.categories',
    moduleId: MODULE,
    label: 'Your listing category says what kind of care you provide',
    maxPoints: 3,
    whyItMatters:
      'Google decides which searches to show you for largely from your primary category, so "senior home care" or "senior caregiving services" reaches far more families than "home care" or "caregiving services".',
  } as const;

  if (!place) {
    return check({
      ...base,
      status: 'unavailable',
      points: 0,
      detail: 'We could not read your listing categories.',
      unavailableReason: noListingReason(lookup),
    });
  }

  const primaryLabel = place.primaryTypeDisplayName?.text ?? place.primaryType;
  const seniorTypes = seniorCareTypes(place);

  // Google publishes only a generic bucket for most senior living listings — every
  // community in the market we tested against came back as "Health". Failing them all
  // for a field we cannot read would be exactly the mistake the description check
  // avoids, so this reports itself unverifiable instead (PRD 5.4).
  if (!hasPublishedCategory(place)) {
    return check({
      ...base,
      status: 'unavailable',
      points: 0,
      detail:
        'Open your Business Profile and check that your main category is a senior care one — “senior home care”, “senior caregiving services”, “senior respite services” or “in-home senior care”.',
      unavailableReason: `Google shares only a broad category for your listing${primaryLabel ? ` (“${primaryLabel}”)` : ''} rather than the one you chose, so we could not check it. It is worth confirming yourself: the primary category decides which searches you appear in.`,
      evidence: { primaryType: place.primaryType, types: place.types },
    });
  }

  if (hasSeniorCarePrimaryType(place)) {
    return check({
      ...base,
      status: 'pass',
      points: 3,
      detail: `Your main category is “${primaryLabel}”, which is the right family of category for your community.`,
      evidence: { primaryType: place.primaryType, careTypes },
    });
  }

  if (seniorTypes.length) {
    return check({
      ...base,
      status: 'warn',
      points: 1.5,
      detail: `Your listing does mention senior care, but its main category is “${primaryLabel}”. Making a senior care category the primary one is a stronger signal.`,
      evidence: { primaryType: place.primaryType, seniorCareTypes: seniorTypes },
    });
  }

  return check({
    ...base,
    status: 'fail',
    points: 0,
    detail: primaryLabel
      ? `Your main category is “${primaryLabel}”, which does not tell Google you provide senior care.`
      : 'Your listing has no category that tells Google you provide senior care.',
    evidence: { primaryType: place.primaryType, types: place.types },
  });
}

function checkHours(lookup: FindPlaceOutcome, place: PlacesPlace | undefined): CheckResult {
  const base = {
    id: 'gbp.hours',
    moduleId: MODULE,
    label: 'Your listing shows when you are open',
    maxPoints: 2,
    whyItMatters:
      'Families check opening hours before they call or visit, and Google favours listings that keep them filled in.',
  } as const;

  if (!place) {
    return check({
      ...base,
      status: 'unavailable',
      points: 0,
      detail: 'We could not read your opening hours.',
      unavailableReason: noListingReason(lookup),
    });
  }

  const days = place.regularOpeningHours?.weekdayDescriptions ?? [];
  if (days.length >= 7) {
    return check({
      ...base,
      status: 'pass',
      points: 2,
      detail: 'Your opening hours are filled in for the whole week.',
      evidence: { weekdayDescriptions: days },
    });
  }
  if (days.length) {
    return check({
      ...base,
      status: 'warn',
      points: 1,
      detail: `Your hours are only filled in for ${days.length} of the 7 days.`,
      evidence: { weekdayDescriptions: days },
    });
  }

  return check({
    ...base,
    status: 'fail',
    points: 0,
    detail: 'Your listing does not show any opening hours. Adding them takes a minute in your Business Profile.',
  });
}

function checkPhotos(lookup: FindPlaceOutcome, place: PlacesPlace | undefined): CheckResult {
  const base = {
    id: 'gbp.photos',
    moduleId: MODULE,
    label: 'Your listing has plenty of photos',
    maxPoints: 3,
    whyItMatters:
      'Photos of the building, rooms and dining room are what families look at first, and listings with more of them get more clicks and calls.',
  } as const;

  if (!place) {
    return check({
      ...base,
      status: 'unavailable',
      points: 0,
      detail: 'We could not count the photos on your listing.',
      unavailableReason: noListingReason(lookup),
    });
  }

  const count = place.photos?.length ?? 0;
  if (count >= GOOD_PHOTO_COUNT) {
    return check({
      ...base,
      status: 'pass',
      points: 3,
      detail: `Google is showing ${count} photos on your listing.`,
      evidence: { photoCount: count },
    });
  }
  if (count >= MINIMUM_PHOTO_COUNT) {
    return check({
      ...base,
      status: 'warn',
      points: 1.5,
      detail: `Your listing has only ${count} photos. Aim for at least ${GOOD_PHOTO_COUNT}, including the entrance, a resident room, the dining room and a common area.`,
      evidence: { photoCount: count },
    });
  }

  return check({
    ...base,
    status: 'fail',
    points: 0,
    detail:
      count === 0
        ? 'Your listing has no photos at all, so families cannot picture your community.'
        : `Your listing has only ${count} photo${count === 1 ? '' : 's'}.`,
    evidence: { photoCount: count },
  });
}

function checkDescription(
  lookup: FindPlaceOutcome,
  place: PlacesPlace | undefined,
  careTypes: CareType[],
  city: string | undefined,
): CheckResult {
  const base = {
    id: 'gbp.description',
    moduleId: MODULE,
    label: 'Your listing description names your care and your town',
    maxPoints: 2,
    whyItMatters:
      'The description is your chance to say, in your own words, what care you offer and where — the same words families type into search.',
  } as const;

  if (!place) {
    return check({
      ...base,
      status: 'unavailable',
      points: 0,
      detail: 'We could not read your listing description.',
      unavailableReason: noListingReason(lookup),
    });
  }

  // Only Google's own editorial blurb is published to tools; the description the
  // operator writes in their Business Profile is not exposed at all. So a description
  // we can read is real evidence, and one we cannot read is no evidence either way —
  // scoring its absence would dock points for a field we are unable to see (PRD 5.4).
  const description = place.editorialSummary?.text;
  if (!description) {
    return check({
      ...base,
      status: 'unavailable',
      points: 0,
      detail: 'Open your Business Profile and check that the description field is filled in.',
      unavailableReason:
        'Google does not share the description you write in your Business Profile with outside tools, so we could not check it. Make sure it names the care you offer and your town.',
    });
  }

  const haystack = normalizeForKeywordMatch(description);
  const careKeywords = (careTypes.length ? careTypes : (Object.keys(CARE_TYPE_KEYWORDS) as CareType[]))
    .flatMap((careType) => CARE_TYPE_KEYWORDS[careType])
    .map((keyword) => normalizeForKeywordMatch(keyword));

  const mentionsCare = careKeywords.some((keyword) => haystack.includes(keyword));
  const mentionsCity = city ? haystack.includes(normalizeForKeywordMatch(city)) : undefined;

  if (mentionsCare && mentionsCity !== false) {
    return check({
      ...base,
      status: 'pass',
      points: 2,
      detail: 'Your description names the care you provide' + (mentionsCity ? ' and your town.' : '.'),
      evidence: { description },
    });
  }

  const missing = [!mentionsCare ? 'the type of care you offer' : null, mentionsCity === false ? 'your town' : null]
    .filter(Boolean)
    .join(' and ');

  return check({
    ...base,
    status: 'warn',
    points: 1,
    detail: `Your description does not mention ${missing}.`,
    evidence: { description },
  });
}

function checkWebsiteLink(
  lookup: FindPlaceOutcome,
  place: PlacesPlace | undefined,
  websiteUrl: string,
): CheckResult {
  const base = {
    id: 'gbp.website_link',
    moduleId: MODULE,
    label: 'Your listing links to your website',
    maxPoints: 2,
    whyItMatters:
      'The website link on your listing is how families move from Google to your own pages, and it ties your listing and your site together for search engines.',
  } as const;

  if (!place) {
    return check({
      ...base,
      status: 'unavailable',
      points: 0,
      detail: 'We could not check the website link on your listing.',
      unavailableReason: noListingReason(lookup),
    });
  }

  const listingHost = hostOf(place.websiteUri);
  const websiteHost = hostOf(websiteUrl);

  if (!listingHost) {
    return check({
      ...base,
      status: 'fail',
      points: 0,
      detail: 'Your listing has no website link. Adding it sends families straight to your own pages.',
    });
  }
  if (websiteHost && listingHost === websiteHost) {
    return check({
      ...base,
      status: 'pass',
      points: 2,
      detail: 'Your listing links to your website.',
      evidence: { websiteUri: place.websiteUri },
    });
  }

  return check({
    ...base,
    status: 'warn',
    points: 1,
    detail: `Your listing links to ${listingHost}, which is not the website we audited. If your community has one main website, point the listing at it.`,
    evidence: { websiteUri: place.websiteUri, auditedWebsite: websiteUrl },
  });
}

/**
 * Q&A and Posts are visible to the operator in their own dashboard but are not in
 * Google's public data, so we say so plainly instead of guessing.
 */
function checkQuestionsAndAnswers(): CheckResult {
  return check({
    id: 'gbp.questions_answers',
    moduleId: MODULE,
    label: 'Questions from families have answers',
    maxPoints: 2,
    whyItMatters:
      'Anyone can ask a question on your listing, and an unanswered one sits there in public. Answering them yourself also lets you add the words families search for.',
    status: 'unavailable',
    points: 0,
    detail: 'Open your Google Business Profile and check the Q&A section yourself.',
    unavailableReason:
      'Google does not share listing questions and answers with outside tools, so we could not check this. It is worth reviewing in your Business Profile dashboard.',
  });
}

function checkPosts(): CheckResult {
  return check({
    id: 'gbp.posts',
    moduleId: MODULE,
    label: 'You post updates on your listing',
    maxPoints: 2,
    whyItMatters:
      'Posts about events, openings and news keep your listing looking active, and active listings tend to hold their position in local results.',
    status: 'unavailable',
    points: 0,
    detail: 'Open your Google Business Profile and check when you last posted.',
    unavailableReason:
      'Google does not share listing posts with outside tools, so we could not check this. Aim for one post a month.',
  });
}

/* -------------------------------------------------------------------------- */

export function scoreGbp(input: GbpInput): ModuleResult {
  const { lookup, place, websiteNap, websiteUrl, careTypes, city } = input;

  const checks: CheckResult[] = [
    checkListingFound(lookup, place),
    checkNapMatch(lookup, place, websiteNap, input.napAlternates ?? {}),
    checkCategories(lookup, place, careTypes),
    checkHours(lookup, place),
    checkPhotos(lookup, place),
    checkDescription(lookup, place, careTypes, city),
    checkWebsiteLink(lookup, place, websiteUrl),
    checkQuestionsAndAnswers(),
    checkPosts(),
  ];

  return assembleModule(MODULE, checks);
}

/** Total points the module's checks can award — must equal the PRD weight of 25. */
export const GBP_MAX_CHECK_POINTS = 25;
