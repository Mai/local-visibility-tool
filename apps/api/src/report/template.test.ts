import assert from 'node:assert/strict';
import { test } from 'node:test';

import { GLOSSARY, type AuditResult, type CheckResult, type ModuleResult } from '@sensi/shared';

import { REPORT_CSS } from './styles.js';
import { renderReportHtml } from './template.js';

/* -------------------------------------------------------------------------- */
/* Fixture                                                                    */
/* -------------------------------------------------------------------------- */

const check = (over: Partial<CheckResult> = {}): CheckResult => ({
  id: 'gbp.photos',
  moduleId: 'gbp',
  label: 'Photos on your listing',
  status: 'pass',
  points: 3,
  maxPoints: 3,
  detail: 'You have 14 photos.',
  ...over,
});

const module_ = (over: Partial<ModuleResult> = {}): ModuleResult => ({
  moduleId: 'gbp',
  label: 'Google Business Profile',
  points: 21,
  maxPoints: 25,
  percent: 84,
  indicator: 'green',
  statusLine: 'Nearly complete.',
  checks: [check()],
  ...over,
});

function sampleResult(over: Partial<AuditResult> = {}): AuditResult {
  return {
    auditId: 'aud_123',
    completedAt: '2026-08-18T15:04:05.000Z',
    request: { url: 'https://cloverlandpark.example', zipCode: '37027' },
    business: {
      name: 'Cloverland Park',
      websiteUrl: 'https://www.cloverlandpark.example',
      zipCode: '37027',
      city: 'Brentwood',
      state: 'TN',
      nap: { formattedAddress: '9200 Cloverland Drive, Brentwood, TN 37027' },
      careTypes: ['assisted_living'],
      careTypesDetected: true,
      primaryCareType: 'assisted_living',
      primaryCareTypeDetected: true,
    },
    totalScore: 79,
    maxScore: 100,
    band: 'good',
    bandLabel: 'Good',
    bandSummary: 'You have a solid base with a few gaps.',
    modulesNotScored: [],
    modules: [module_()],
    citations: [],
    reviews: [],
    recommendations: [],
    unavailableChecks: [],
    warnings: [],
    ...over,
  };
}

/**
 * The document's content, for asserting on what it says.
 *
 * Two things make a naive `includes` misleading here. The stylesheet mentions every class
 * name, so searching the whole document for "cover-wordmark" finds the CSS rule whether or
 * not the element was rendered. And prose in the template wraps across source lines, so a
 * sentence an operator reads as one line is not one line in the markup.
 */
function body(output: string): string {
  return output.replace(/<style>[\s\S]*?<\/style>/, '').replace(/\s+/g, ' ');
}

/* -------------------------------------------------------------------------- */
/* Tests                                                                      */
/* -------------------------------------------------------------------------- */

test('the cover names the community, its score and its band', () => {
  const output = renderReportHtml(sampleResult());

  assert.ok(output.startsWith('<!doctype html>'));
  assert.ok(output.includes('Cloverland Park'));
  assert.ok(output.includes('>79<'));
  assert.ok(output.includes('Good'));
  assert.ok(output.includes('August 18, 2026'));
});

test('a community name containing markup cannot break the document', () => {
  const output = renderReportHtml(
    sampleResult({
      business: {
        ...sampleResult().business,
        name: 'Ivy & Oak <img src=x onerror=alert(1)>',
      },
    }),
  );

  // The markup is inert text now, not a tag. `onerror=` is still in the file as characters,
  // which is the point: it renders as part of the name instead of executing.
  assert.ok(!output.includes('<img'));
  assert.ok(output.includes('Ivy &amp; Oak &lt;img src=x onerror=alert(1)&gt;'));
});

test('the Sensi mark always appears on the cover, with no white-label option', () => {
  assert.ok(body(renderReportHtml(sampleResult())).includes('aria-label="Sensi"'));
});

test('a module nothing could be verified in reads "Not scored", never zero', () => {
  const output = renderReportHtml(
    sampleResult({
      modules: [
        module_({
          moduleId: 'geo',
          label: 'AI Search Visibility',
          points: 0,
          maxPoints: 15,
          percent: 0,
          indicator: 'grey',
          statusLine: 'We could not check this.',
          unavailableReason: 'None of these checks could be verified.',
          checks: [
            check({
              moduleId: 'geo',
              status: 'unavailable',
              points: 0,
              maxPoints: 5,
              label: 'Questions families ask',
              detail: 'Add an FAQ section.',
              unavailableReason: 'The search service was not available.',
            }),
          ],
        }),
      ],
      modulesNotScored: ['geo'],
    }),
  );

  assert.ok(output.includes('Not scored'));
  assert.ok(!output.includes('0 of 15 points'));
  // The check states that its points left the total rather than counting against them.
  assert.ok(output.includes('set aside'));
  assert.ok(output.includes('The search service was not available.'));
  assert.match(body(output), /left out of the score rather than counted as zero/);
});

test('recommendations are numbered across the groups, not within them', () => {
  const output = renderReportHtml(
    sampleResult({
      recommendations: [
        {
          id: 'r1',
          moduleId: 'gbp',
          title: 'Embed a Google map',
          whyItMatters: 'It confirms where you are.',
          steps: ['Open Google Maps', 'Copy the embed code'],
          effort: 'easy',
          impact: 'medium',
          group: 'quick_wins',
          estimatedPointGain: 2,
          relatedCheckIds: [],
        },
        {
          id: 'r2',
          moduleId: 'citations',
          title: 'Add local business markup',
          whyItMatters: 'It tells search engines what you are.',
          steps: ['Ask your web person'],
          effort: 'hard',
          impact: 'high',
          group: 'strategic',
          estimatedPointGain: 4,
          relatedCheckIds: [],
        },
      ],
    }),
  );

  const first = output.indexOf('Embed a Google map');
  const second = output.indexOf('Add local business markup');
  assert.ok(first > 0 && second > first, 'quick wins come before bigger projects');
  assert.ok(output.includes('Quick wins'));
  assert.ok(output.includes('Bigger projects'));
  assert.ok(output.includes('>1.</span>'));
  assert.ok(output.includes('>2.</span>'));
  // Steps are printed in full — a collapsed fix list is not a fix list.
  assert.ok(output.includes('Copy the embed code'));
});

test('a nice-to-have recommendation shows no impact badge or point value', () => {
  // These are optional by design — pairing them with "Big difference" and a point
  // count reads as urgency the group's own blurb explicitly tells the operator to
  // ignore.
  const output = body(
    renderReportHtml(
      sampleResult({
        recommendations: [
          {
            id: 'r1',
            moduleId: 'citations',
            title: 'Claim your listing on the senior-care lead-gen directories',
            whyItMatters: 'Several of them sell the leads they send.',
            steps: ['Search for your community on each one.'],
            effort: 'medium',
            impact: 'high',
            group: 'nice_to_have',
            estimatedPointGain: 8,
            relatedCheckIds: [],
          },
        ],
      }),
    ),
  );

  // Scoped to the fix list itself, found by its heading tag rather than its bare text:
  // the cover names this section in prose too ("the only page you have to act on is
  // 'What to do next'"), right next to its own "N things to fix, worth about N points
  // in total" summary — a different, unaffected total that legitimately says "worth
  // about".
  const section = output.slice(output.indexOf('<h2>What to do next</h2>'));
  assert.ok(section.includes('Claim your listing on the senior-care lead-gen directories'));
  assert.ok(!section.includes('Big difference'));
  assert.ok(!section.includes('worth about'));
});

test('an empty fix list says so rather than printing an empty page', () => {
  const output = renderReportHtml(sampleResult({ recommendations: [] }));

  assert.match(output, /Nothing needs fixing/);
});

test('sections with no data are left out entirely', () => {
  const output = renderReportHtml(sampleResult());

  assert.ok(!output.includes('How you compare nearby'));
  assert.ok(!output.includes('Where families find your local listings'));
  assert.ok(!output.includes('Whether AI assistants can find you'));
  // These two are always present: the glossary, and the score itself.
  assert.ok(output.includes('Jargon, explained'));
  assert.ok(output.includes('Your score, area by area'));
});

test('a review quote is escaped and attributed to its theme', () => {
  const output = renderReportHtml(
    sampleResult({
      reviews: [{ source: 'google', rating: 4.4, reviewCount: 28 }],
      reviewThemes: {
        topics: [
          {
            label: 'Food and dining',
            mentions: 6,
            sentiment: 'mixed',
            exampleQuote: 'They also want <b>theme</b> nights',
          },
        ],
        keywords: [{ phrase: 'memory care', mentions: 9 }],
        overallSentiment: 'positive',
      },
    }),
  );

  assert.ok(output.includes('Food and dining'));
  assert.ok(output.includes('6 mentions'));
  assert.ok(output.includes('&lt;b&gt;theme&lt;/b&gt;'));
  assert.ok(output.includes('memory care'));
});

test('the competitor comparison never appears in the PDF, even when the audit has one', () => {
  // The comparison stays on the results screen (ComparisonSection.tsx) but is deliberately
  // left out of the printed report — an operator forwards this to an owner or a board, and
  // naming nearby competitors by name in a document that leaves the building is not
  // something to do by default.
  const output = body(
    renderReportHtml(
      sampleResult({
        reviews: [{ source: 'google', rating: 4.4, reviewCount: 28 }],
        comparison: {
          competitors: [
            {
              name: 'Heritage Oaks',
              googlePlaceId: 'place_1',
              distanceMiles: 1.2,
              rating: 4.6,
              reviewCount: 44,
              careTypes: ['assisted_living'],
              scores: { moduleScores: { gbp: 88 }, totalScore: 88, notEvaluated: [] },
            },
          ],
          zipCodesSearched: ['37027'],
          radiusMiles: 5,
          comparedModules: ['gbp', 'reviews'],
          basis: 'Compared on what Google publishes about every community nearby.',
          targetScore: 81,
          averageCompetitorScore: 88,
          targetRank: 2,
          setSize: 2,
          insights: [
            {
              moduleId: 'reviews',
              standing: 'average',
              message: 'Your 4.4-star rating is in line with the 4.6 average near you.',
            },
          ],
        },
      }),
    ),
  );

  assert.ok(!output.includes('How you compare nearby'));
  assert.ok(!output.includes('Heritage Oaks'));
  assert.ok(!output.includes('4.6 stars, 44 reviews'));
});

test('a directory link prints its host and path, not its tracking parameters', () => {
  const output = body(
    renderReportHtml(
      sampleResult({
        citations: [
          {
            directoryId: 'yelp',
            label: 'Yelp',
            listingFound: true,
            napMatches: true,
            listingUrl: 'https://www.yelp.com/biz/cloverland-park-brentwood?adjust_creative=abc123&utm_campaign=x',
          },
        ],
      }),
    ),
  );

  assert.ok(output.includes('www.yelp.com/biz/cloverland-park-brentwood<'));
  // The href keeps the full URL so a click still lands on the listing.
  assert.ok(output.includes('adjust_creative=abc123&amp;utm_campaign=x"'));
});

test('a parameter that identifies the listing itself is kept', () => {
  // Apple Maps has no path to speak of — the listing lives in the query — so stripping the
  // query wholesale printed every Apple row as "maps.apple.com/place".
  const output = body(
    renderReportHtml(
      sampleResult({
        citations: [
          {
            directoryId: 'apple_maps',
            label: 'Apple Maps',
            listingFound: true,
            listingUrl: 'https://maps.apple.com/place?q=Cloverland+Park&utm_source=sensi',
          },
        ],
      }),
    ),
  );

  assert.ok(output.includes('maps.apple.com/place?q=Cloverland+Park<'));
});

test('a group heading cannot be left alone at the foot of a page', () => {
  // "Bigger projects" printed at the bottom of a page with its first item overleaf. The
  // generic heading rule does not reach it: the break falls after the wrapping div.
  assert.match(REPORT_CSS, /\.group-head \{[^}]*break-after: avoid/);
});

test('the status column fits the widest pill it has to hold', () => {
  // At 46pt the nowrap "Couldn't check" pill overran into the check label beside it.
  const width = /\.check-status \{ width: (\d+)pt/.exec(REPORT_CSS);
  assert.ok(width, 'check-status still declares a fixed width');
  assert.ok(Number(width[1]) >= 70, `status column is ${width[1]}pt, too narrow for the pills`);
});

test('the honesty pages appear whenever there is something to admit', () => {
  const output = renderReportHtml(
    sampleResult({
      unavailableChecks: [
        { id: 'gbp.categories', label: 'Your listing category', reason: 'Google shares only a broad category.' },
      ],
      warnings: ['Yelp did not answer in time.'],
    }),
  );

  assert.ok(output.includes('What we could not check'));
  assert.ok(output.includes('Google shares only a broad category.'));
  assert.ok(output.includes('Yelp did not answer in time.'));
  assert.match(output, /None of the below counted against your score/);
});

test('every glossary term reaches the report', () => {
  const output = renderReportHtml(sampleResult());

  for (const entry of GLOSSARY) {
    assert.ok(
      output.includes(entry.term.replace(/&/g, '&amp;')),
      `glossary is missing "${entry.term}"`,
    );
  }
});

test('only one rule breaks pages, so there is no blank page two', () => {
  // The cover once carried its own `break-after: page` on top of `.section`'s
  // `break-before: page`, which produced an empty second page in every report.
  assert.ok(!REPORT_CSS.includes('break-after: page'));
  assert.ok(REPORT_CSS.includes('break-before: page'));
});

test('backgrounds are forced to print, or the report loses all its colour', () => {
  assert.ok(REPORT_CSS.includes('print-color-adjust: exact'));
});
