/**
 * Turns failed and partial checks into a ranked, plain-language to-do list
 * (PRD 4.5).
 *
 * Three rules shape it:
 *
 * 1. **Every recommendation is something the operator can do themselves**, or hand to
 *    one person with one instruction. No "improve your Core Web Vitals" — the steps
 *    say which pictures to compress and where.
 * 2. **The order is by points recoverable**, not by how interesting the problem is.
 *    A community missing its opening hours gets told about that before its schema
 *    markup.
 * 3. **A check we could not verify can still produce advice**, in the ongoing list and
 *    worth zero points. Google hides Q&A, posts and owner replies from tools; the
 *    operator can see all three in their own dashboard, so the honest thing is to ask
 *    them to look rather than to say nothing.
 */

import {
  GROUP_ORDER,
  MODULE_BY_ID,
  type CheckResult,
  type EffortLevel,
  type ImpactLevel,
  type ModuleResult,
  type Recommendation,
  type RecommendationGroup,
} from '@sensi/shared';

interface CatalogueEntry {
  /** What to do, as an instruction. */
  title: string;
  steps: string[];
  effort: EffortLevel;
  /**
   * Work that is never "done": review flow, replies, posts. These land in the ongoing
   * list however badly they scored, because calling them a quick win would be a lie.
   */
  recurring?: boolean;
  /**
   * Advice worth giving even when the check came back unverifiable — the operator can
   * see the thing in a dashboard we cannot read.
   */
  adviseWhenUnverifiable?: boolean;
  /**
   * Overrides the effort-based group for advice that is optional regardless of how many
   * points it is worth — the senior-care lead-gen directories, which often charge for
   * the leads they send. Worth doing for free, but not worth ranking against the
   * mainstream platforms above it just because the points recoverable are similar.
   */
  forceGroup?: RecommendationGroup;
}

/* -------------------------------------------------------------------------- */
/* The catalogue: one entry per check id                                      */
/* -------------------------------------------------------------------------- */

const CATALOGUE: Record<string, CatalogueEntry> = {
  /* ---- Module A: Google Business Profile ---- */
  'gbp.listing_found': {
    title: 'Create and verify your Google Business Profile',
    effort: 'medium',
    steps: [
      'Go to google.com/business and sign in with a Google account your community controls — not a personal one belonging to a staff member who might leave.',
      'Search for your community first. If a listing already exists, choose “Claim this business” rather than creating a second one.',
      'Enter your name, address and phone number exactly as they appear on your website.',
      'Complete the verification Google asks for. It is usually a postcard to your address, and can take up to two weeks.',
      'Once verified, add your categories, hours, photos and description.',
    ],
  },
  'gbp.nap_match': {
    title: 'Make your listing and your website agree on your name, address and phone',
    effort: 'easy',
    steps: [
      'Decide which version is correct — usually whatever is on your signage and your invoices.',
      'Open your Business Profile and correct the name, address or phone number that differs.',
      'Fix the same details in your website footer and on your contact page.',
      'Use one phone number as the public one. If you advertise a separate sales line, put it on the page as a second number, not as the main one.',
    ],
  },
  'gbp.categories': {
    title: 'Set a senior care category as your listing’s main category',
    effort: 'easy',
    // Google publishes only a generic bucket for most senior living listings, so this
    // check usually cannot be scored. The advice is a two-minute job and matters more
    // than almost anything else on the listing, so it is still worth saying.
    adviseWhenUnverifiable: true,
    steps: [
      'Open your Business Profile and choose Edit profile → Business category.',
      'Set the primary category to the care you mainly provide — “senior home care”, “senior caregiving services”, “senior respite services” or “in-home senior care”.',
      'Add the others as additional categories. There is no penalty for having several.',
      'Leave it alone for a few weeks afterwards; changing the primary category repeatedly resets how Google ranks you.',
    ],
  },
  'gbp.hours': {
    title: 'Fill in your opening hours for all seven days',
    effort: 'easy',
    steps: [
      'Open your Business Profile and choose Edit profile → Hours.',
      'Enter the hours a family could visit or reach someone — for most communities the office hours, not 24 hours.',
      'Add special hours for public holidays so families do not arrive to a closed door.',
    ],
  },
  'gbp.photos': {
    title: 'Add more photos to your Google listing',
    effort: 'easy',
    steps: [
      'Take ten or more photos on a bright day: the entrance and sign, a resident apartment, the dining room, a lounge, the garden or courtyard, and an activity in progress.',
      'Ask permission before photographing any resident, and keep faces out of the frame if you do not have it in writing.',
      'Upload them in your Business Profile under Photos, and set the best exterior shot as the cover.',
      'Add two or three new photos every few months. Fresh photos keep the listing looking looked-after.',
    ],
  },
  'gbp.description': {
    title: 'Write a listing description that names your care and your town',
    effort: 'easy',
    adviseWhenUnverifiable: true,
    steps: [
      'Open your Business Profile and choose Edit profile → Description.',
      'Open with one plain sentence: what you are and where. For example, “We are an in-home senior caregiving and respite care service in Brentwood, Tennessee.”',
      'Say who you care for, what is included, and one thing that is true of you and not of everyone else.',
      'Keep it under 750 characters and do not list prices or promotions — Google removes those.',
    ],
  },
  'gbp.website_link': {
    title: 'Point your Google listing at your website',
    effort: 'easy',
    steps: [
      'Open your Business Profile and choose Edit profile → Contact → Website.',
      'Enter your homepage address, including https://.',
      'If a marketing agency has pointed it at a landing page they own, change it to your own site. You want the link on a domain you control.',
    ],
  },
  'gbp.questions_answers': {
    title: 'Answer the questions families have asked on your listing',
    effort: 'easy',
    recurring: true,
    adviseWhenUnverifiable: true,
    steps: [
      'Open your Google listing as a member of the public would see it and scroll to “Questions & answers”.',
      'Answer anything unanswered, in your own words, from the business account rather than a personal one.',
      'Post the five questions your sales line hears every week — cost, care levels, pets, visiting, availability — and answer them yourself. This is allowed and it is the most useful thing in the section.',
      'Check back monthly; anyone can post a question and an unanswered one sits there in public.',
    ],
  },
  'gbp.posts': {
    title: 'Post an update on your listing once a month',
    effort: 'easy',
    recurring: true,
    adviseWhenUnverifiable: true,
    steps: [
      'Open your Business Profile and choose Add update.',
      'Post whatever you would put in a family newsletter: an event, a new chef, a renovation, an open house.',
      'Add one photo and, where it fits, a “Call now” or “Learn more” button.',
      'Put it in one person’s calendar as a monthly task. Posts expire, so the value is in the habit.',
    ],
  },

  /* ---- Module B: Local Listings ---- */
  'citations.tier2_listings': {
    title: 'Add your community to Yelp and the mainstream directories',
    effort: 'medium',
    steps: [
      'Create or claim a listing on Yelp, Bing Places, Apple Maps, Facebook and YellowPages and Medicare.gov.',
      'Use the same name, address and phone number as everywhere else.',
      'Bing Places can import your details straight from your Google Business Profile, which makes it a five-minute job.',
    ],
  },
  'citations.tier1_listings': {
    title: 'Claim your listing on the senior-care lead-gen directories',
    effort: 'medium',
    // Optional regardless of the points recoverable — see the field's own doc comment.
    forceGroup: 'nice_to_have',
    steps: [
      'These are optional. A Place for Mom, Caring.com, SeniorAdvisor and Healthgrades are specialist senior-care and medical directories, and several charge for the leads they send — do Google, Bing, Yelp and the other mainstream directories first, then come back to this.',
      'Search for your community on each one. Where a listing exists, claim it. Where none does, create one.',
      'Enter exactly the same name, address and phone number you use on your website.',
      'A free claimed listing is enough — you do not have to buy their leads to get the benefit of being found there.',
    ],
  },
  'citations.nap_consistency': {
    title: 'Make your contact details identical everywhere they appear',
    effort: 'medium',
    steps: [
      'Write down the correct name, address and phone number in one place, exactly as you want them to appear — including “Suite” or “Ste”, and “Road” or “Rd”.',
      'Work through each directory listing and correct anything that differs, however small.',
      'Watch for old phone numbers from a previous owner or management company; those are the ones that cost you calls.',
      'Keep the list. Every new listing you create from now on gets copied from it.',
    ],
  },
  'citations.care_types': {
    title: 'Say which types of care you offer on every directory listing',
    effort: 'easy',
    steps: [
      'Open each listing and find the services, care types or amenities section.',
      'Tick or write in every level of care you actually provide — home care, respite care, assisted living, memory care, independent living, skilled nursing.',
      'Use the ordinary words families use, not internal names for your programmes.',
    ],
  },
  'citations.no_duplicates': {
    title: 'Remove the duplicate listings for your community',
    effort: 'medium',
    steps: [
      'Search each directory for your community name and for your address, and note every listing that is really you.',
      'Decide which one to keep — normally the claimed one with the most reviews.',
      'Report the others as duplicates through the directory’s own form, or ask their support to merge them into the one you keep.',
      'Duplicates usually come from a change of ownership or management. Ask whoever ran the community before you which listings they created.',
    ],
  },

  /* ---- Module C: Website Location Signals ---- */
  'onpage.title_city': {
    title: 'Put your town in your homepage title',
    effort: 'easy',
    steps: [
      'The title is the blue line in Google’s results and the text in the browser tab. In WordPress it is the SEO title; in Wix and Squarespace it is under page settings.',
      'Write it as care, then place, then name — for example “Assisted Living & Memory Care in Brentwood, TN | Cloverland Park”.',
      'Keep it under about 60 characters so Google does not cut it off.',
      'Give every other page its own title. Two pages with the same title compete with each other.',
    ],
  },
  'onpage.meta_description': {
    title: 'Write a homepage description that names your care and your town',
    effort: 'easy',
    steps: [
      'Find the meta description field in your page settings — the same place as the title.',
      'Write one or two sentences a family would read as an answer: what care you offer, which town, and one reason to call.',
      'Aim for 140–160 characters. Longer gets truncated in the results.',
    ],
  },
  'onpage.headings_care_type': {
    title: 'Use your page headings to name the care you provide',
    effort: 'medium',
    steps: [
      'Give each page one main heading that says what the page is about in the words a family would use.',
      'Make sure the words “home care”, “caregiving services” or whichever care you offer appear in a heading, not only in body text or in an image.',
      'If your headline is a slogan, keep it as the design element and add a plain heading beneath it.',
    ],
  },
  'onpage.body_locality': {
    title: 'Mention your town and county in your page text',
    effort: 'easy',
    steps: [
      'On your homepage and your care pages, write a sentence or two that names your town, your county and a couple of neighbouring areas families travel from.',
      'Write it as something useful — “Ten minutes from downtown Franklin, and a short drive for families in Cool Springs” — not a list of place names.',
      'Do not stuff in every nearby town. Google treats that as spam and families notice it too.',
    ],
  },
  'onpage.nap_in_text': {
    title: 'Put your address and phone number in the page text itself',
    effort: 'easy',
    steps: [
      'Add your full address and phone number to the footer of every page, as text — not inside an image or a graphic.',
      'Make the phone number a clickable link (tel:) so it dials from a phone.',
      'Repeat both on your contact page, with the same wording as your Google listing.',
    ],
  },
  'onpage.local_schema': {
    title: 'Add local business markup to your website',
    effort: 'hard',
    steps: [
      'This is the one item on the list that normally needs whoever maintains your site. Send them this: “Please add LocalBusiness (or SeniorHomeCare) JSON-LD structured data to the homepage with our name, address, phone, opening hours and geo coordinates.”',
      'On WordPress, an SEO plugin such as Yoast or Rank Math will generate it from a form once you fill in the business details.',
      'Afterwards, paste your homepage address into Google’s Rich Results Test to confirm it is detected.',
    ],
  },
  'onpage.embedded_map': {
    title: 'Embed a Google map on your contact page',
    effort: 'easy',
    steps: [
      'Open Google Maps, search for your community, choose Share → Embed a map, and copy the HTML.',
      'Paste it into your contact page using your site builder’s embed or HTML block.',
      'Check it on a phone afterwards — an embedded map that overflows the screen is worse than none.',
    ],
  },
  'onpage.service_area_pages': {
    title: 'Give each type of care its own page',
    effort: 'hard',
    steps: [
      'Create one page per level of care you offer: senior home care, respite care, memory care, independent living, etc.',
      'On each, describe who it suits, what a day looks like, what is included, and how to arrange a visit. Aim for 400 words or more of your own writing.',
      'Name your town on each page, and link to it from your main navigation.',
      'Do not copy the same text between pages with the care name swapped. Google discounts near-duplicate pages, and families can tell.',
    ],
  },
  'onpage.mobile_friendly': {
    title: 'Fix how your site behaves on a phone',
    effort: 'medium',
    steps: [
      'Open your homepage on your own phone and try to find your phone number, your address and how to book a visit.',
      'Note anything you have to pinch, zoom or scroll sideways to read — that is the list to hand your web person.',
      'Most senior living enquiries start on a phone, often from an adult child at work, so this outranks anything about desktop layout.',
    ],
  },
  'onpage.page_speed': {
    title: 'Make your pages load faster',
    effort: 'medium',
    steps: [
      'The usual cause is photographs uploaded straight from a camera. Resize them to about 2,000 pixels wide and save as JPEG or WebP before uploading.',
      'Remove any auto-playing background video on the homepage, or replace it with a still image.',
      'Ask your web person to enable caching and image compression — on most hosts this is a switch, not a project.',
      'Re-test at pagespeed.web.dev afterwards so you can see the difference.',
    ],
  },

  /* ---- Module D: Reviews ---- */
  'reviews.google_rating': {
    title: 'Raise your Google star rating',
    effort: 'medium',
    recurring: true,
    steps: [
      'Ask the families of residents who have settled in well. They are the most likely to write something warm and specific, and they rarely think to do it unsolicited.',
      'Ask in person or by a short email with the direct link from your Business Profile. Never offer anything in return — Google removes incentivised reviews.',
      'Reply to every critical review calmly, in public, with what you have changed. Future families read the reply more carefully than the complaint.',
      'A rating moves slowly. Ten new four- and five-star reviews shift it far more than arguing with one bad one.',
    ],
  },
  'reviews.google_volume': {
    title: 'Ask more families for a Google review',
    effort: 'easy',
    recurring: true,
    steps: [
      'Get your review link from your Business Profile — “Ask for reviews” gives you a short URL.',
      'Put it in one place your team can find: an email signature, a card at reception, a line in the move-in follow-up.',
      'Ask at the natural moments: a fortnight after a move-in, after a family event, after someone thanks a staff member.',
      'Set a modest target — two a month gets you past twenty-five in a year.',
    ],
  },
  'reviews.recency': {
    title: 'Keep a steady flow of new reviews coming in',
    effort: 'medium',
    recurring: true,
    steps: [
      'Make asking part of an existing routine rather than a campaign — the move-in follow-up call is the easiest hook.',
      'Give one person responsibility for checking each month whether a new review has come in.',
      'A page whose newest review is two years old reads as a community that stopped caring, even when the reviews are glowing.',
    ],
  },
  'reviews.owner_responses': {
    title: 'Reply to every review you receive',
    effort: 'easy',
    recurring: true,
    adviseWhenUnverifiable: true,
    steps: [
      'Open your Business Profile, go to Reviews, and work through anything without a reply.',
      'Thank positive reviewers by name and mention the specific thing they praised.',
      'For critical ones: acknowledge it, do not argue, do not mention the resident’s details, say what you are doing, and give a direct number to call. Keep it to three sentences.',
      'Aim to reply to critical reviews within a day and to everything else within a week.',
    ],
  },
  'reviews.yelp_presence': {
    title: 'Claim your Yelp listing',
    effort: 'easy',
    steps: [
      'Go to biz.yelp.com and search for your community. Claim the listing if it exists, or add it if it does not.',
      'Fill in your hours, care types and photos, using the same contact details as everywhere else.',
      'Make sure your listing is accurate. Keep it up to date and let it sit there.',
    ],
  },

  /* ---- Module E: AI Search Visibility ---- */
  'geo.search_presence': {
    title: 'Get your own website ranking for “[your care] in [your town]”',
    effort: 'hard',
    steps: [
      'This follows from the rest of the list rather than standing alone: the title, the care pages, the local mentions and the directory listings are what move it.',
      'Search your own “[care type] in [town]” and note which sites rank above you. If they are directories, make sure your listing on each of them is claimed and complete.',
      'Write one genuinely useful page about choosing care in your area — cost, licensing, what to ask on a tour. That is the kind of page both Google and AI assistants quote.',
      'Expect this to take months, not weeks.',
    ],
  },
  'geo.ai_answer': {
    title: 'Give AI assistants something to quote about your community',
    effort: 'medium',
    adviseWhenUnverifiable: true,
    steps: [
      'Assistants summarise the pages that answer a question plainly. Write your key facts as short, complete sentences rather than marketing copy.',
      'State the things they need and cannot infer: which care levels you offer, which town and county you serve, whether you accept Medicaid, and roughly what it costs.',
      'Ask an assistant “what home care options are in [your town]?” yourself every few months. It is free, and it tells you what they currently think.',
    ],
  },
  'geo.answers_questions': {
    title: 'Answer families’ real questions on your website, in full sentences',
    effort: 'medium',
    steps: [
      'List the ten questions your sales line actually gets asked. Cost, care levels, waiting lists, pets, visiting, what happens if care needs change.',
      'Add each as a heading ending in a question mark, with two or three plain sentences underneath.',
      'Answer the question in the first sentence. “In-home senior care starts at $X an hour and includes…” — not “We offer a range of flexible options”.',
      'A page laid out this way is what both Google and AI assistants lift answers from.',
    ],
  },
  'geo.plain_description': {
    title: 'Say in one plain sentence what you are and where',
    effort: 'easy',
    steps: [
      'Near the top of your homepage, write one sentence: “[Name] is an in-home senior caregiving and respite care service in [town], [state].”',
      'Put it in ordinary text, not inside an image or a video.',
      'It reads as almost too obvious, which is the point — it is the sentence a search engine or an assistant repeats when someone asks what you are.',
    ],
  },
  'geo.care_type_detail': {
    title: 'Describe each type of care you offer in its own words',
    effort: 'medium',
    steps: [
      'Give every care level a heading and at least a paragraph of description — not a bullet in a list of amenities.',
      'Say who it suits, what help is included, and how it differs from the level above and below it.',
      'If you offer memory care, say so explicitly and describe it. Families search for it by name and often will not consider a community that only implies it.',
    ],
  },
  'geo.third_party_mentions': {
    title: 'Get other websites talking about your community',
    effort: 'hard',
    steps: [
      'Claimed directory listings are the easiest mentions and you may already be part-way there.',
      'Then look local: the chamber of commerce, the local paper’s community pages, the hospital or rehab discharge planners, a nearby church or civic group whose newsletter covers events.',
      'Give them something to write about — an open house, a resident’s hundredth birthday, a partnership with a local school.',
      'Ask each one to link to your website. A mention with a link counts for more than a mention alone.',
    ],
  },
};

/* -------------------------------------------------------------------------- */

function impactFor(pointGain: number): ImpactLevel {
  if (pointGain >= 3) return 'high';
  if (pointGain >= 1.5) return 'medium';
  return 'low';
}

function groupFor(entry: CatalogueEntry): RecommendationGroup {
  if (entry.forceGroup) return entry.forceGroup;
  if (entry.recurring) return 'ongoing';
  return entry.effort === 'easy' ? 'quick_wins' : 'strategic';
}

/**
 * Points a fix is really worth in the 100-point score.
 *
 * A check's own `maxPoints` is its share of the module before rescaling. When some of
 * the module's checks came back unverifiable, the ones that remain each carry more of
 * the module's weight — so the gain is scaled by the same factor the module used
 * (PRD 5.4). Otherwise a recommendation would understate itself in exactly the
 * situation where it matters most.
 */
function pointGain(check: CheckResult, module: ModuleResult): number {
  const availablePoints = module.checks
    .filter((candidate) => candidate.status !== 'unavailable')
    .reduce((sum, candidate) => sum + candidate.maxPoints, 0);
  if (availablePoints <= 0) return 0;

  const scale = MODULE_BY_ID[module.moduleId].maxPoints / availablePoints;
  return Number(((check.maxPoints - check.points) * scale).toFixed(1));
}

/**
 * The ranked to-do list.
 *
 * Ordered by group, then by points recoverable, so the first thing the operator reads
 * is the cheapest fix worth the most — which is what "quick win" has to mean if the
 * label is going to be trusted.
 */
export function buildRecommendations(modules: ModuleResult[]): Recommendation[] {
  const recommendations: Recommendation[] = [];

  for (const module of modules) {
    for (const check of module.checks) {
      const entry = CATALOGUE[check.id];
      if (!entry) continue;

      const actionable =
        check.status === 'fail' ||
        check.status === 'warn' ||
        (check.status === 'unavailable' && entry.adviseWhenUnverifiable);
      if (!actionable) continue;

      const gain = check.status === 'unavailable' ? 0 : pointGain(check, module);
      // A check that passed all but a rounding error is not worth an item on a list an
      // operator is meant to work through.
      if (check.status !== 'unavailable' && gain < 0.5) continue;

      recommendations.push({
        id: `rec.${check.id}`,
        moduleId: module.moduleId,
        title: entry.title,
        whyItMatters: check.whyItMatters ?? MODULE_BY_ID[module.moduleId].plainDescription,
        steps: entry.steps,
        effort: entry.effort,
        // Advice from a check we could not verify makes no promise about points, so it
        // is ranked on effort instead of claiming an impact we cannot support.
        impact: check.status === 'unavailable' ? 'medium' : impactFor(gain),
        // Unverifiable advice is always ongoing: we cannot tell them it is broken, only
        // that it is worth their attention.
        group: check.status === 'unavailable' ? 'ongoing' : groupFor(entry),
        estimatedPointGain: gain,
        relatedCheckIds: [check.id],
      });
    }
  }

  return recommendations.sort(
    (a, b) =>
      GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group) ||
      b.estimatedPointGain - a.estimatedPointGain ||
      a.title.localeCompare(b.title),
  );
}

/** Check ids with no recommendation behind them — a build-time completeness test. */
export function checkIdsWithoutRecommendations(checkIds: string[]): string[] {
  return checkIds.filter((id) => !CATALOGUE[id]);
}
