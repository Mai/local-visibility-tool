/**
 * The printed report (PRD 4.7, Phase 8).
 *
 * This is a deliberate second rendering of the audit rather than a print stylesheet over
 * the dashboard. An operator forwards this to an owner or a regional director, so it has
 * to open with a cover they can read in ten seconds, put the fix list before the
 * evidence, and break between findings instead of through them. None of that is what a
 * scrolling screen wants.
 *
 * What it does not do is re-word anything. Every label, band, status and effort phrase
 * comes from `@sensi/shared`, so the report and the screen cannot start describing the
 * same audit differently. The honesty rules travel with them: a check we could not verify
 * says so and states that its points left the denominator, and a module that could not be
 * scored is reported as unscored rather than as a zero (PRD 5.4).
 */

import {
  CHECK_STATUS_LABEL,
  CHECK_STATUS_ORDER,
  CHECK_STATUS_INDICATOR,
  DIRECTORY_BY_ID,
  EFFORT_LABEL,
  EFFORT_LEVELS,
  EFFORT_TIME_ESTIMATE,
  formatDate,
  formatPoints,
  formatRelativeDate,
  GLOSSARY,
  GROUP_BLURB,
  GROUP_ORDER,
  GROUP_TITLE,
  IMPACT_LABEL,
  INDICATOR_LABEL,
  MODULE_BY_ID,
  plural,
  SENTIMENT_INDICATOR,
  SENTIMENT_LABEL,
  domainOf,
  type AiSearchQuery,
  type AuditResult,
  type CheckResult,
  type CitationResult,
  type Indicator,
  type ModuleResult,
  type Nap,
  type Recommendation,
  type ReviewSnapshot,
} from '@sensi/shared';

import { html, raw, safeHref, sentenceList, type Html } from './html.js';
import { SENSI_LOGO_SVG } from './logo.js';
import { INDICATOR_COLOR, REPORT_COLORS, REPORT_CSS } from './styles.js';

/* -------------------------------------------------------------------------- */
/* Pieces                                                                     */
/* -------------------------------------------------------------------------- */

/** Parameters that identify the campaign that sent you, not the listing. */
const TRACKING_PARAM = /^(utm_|adjust_|mkt_|gclid|fbclid|msclkid|ref|referrer|source|campaign)/i;

/**
 * A directory URL as a human can read it.
 *
 * Directory APIs hand back listing URLs dressed in tracking parameters — Yelp's ran to two
 * wrapped lines of `?adjust_creative=…` in the printed report. Dropping the query string
 * wholesale is too blunt, though: Apple Maps puts the listing's own identity in `?q=`, so
 * that would have left every Apple row reading `maps.apple.com/place`. Only the tracking
 * is stripped. The link keeps the URL exactly as given, so a click still lands on the
 * right listing whatever we chose to print.
 */
function listingLabel(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }

  for (const name of [...parsed.searchParams.keys()]) {
    if (TRACKING_PARAM.test(name)) parsed.searchParams.delete(name);
  }

  const query = parsed.searchParams.toString();
  const path = parsed.pathname.replace(/\/$/, '');
  return `${parsed.host}${path}${query ? `?${query}` : ''}`;
}

function pill(indicator: Indicator, label: string): Html {
  const { fg, bg } = INDICATOR_COLOR[indicator] ?? INDICATOR_COLOR.grey!;
  return html`<span class="pill" style="color: ${fg}; background: ${bg}">${label}</span>`;
}

function bar(percent: number, indicator: Indicator): Html {
  const width = Math.max(0, Math.min(100, Math.round(percent)));
  const { fg } = INDICATOR_COLOR[indicator] ?? INDICATOR_COLOR.grey!;
  return html`<div class="bar">
    <div class="bar-fill" style="width: ${width}%; background: ${fg}"></div>
  </div>`;
}

/**
 * The score dial, as inline SVG.
 *
 * Rotated a quarter turn so it fills clockwise from the top, which is the only direction
 * anyone reads a dial. The arc is drawn with a dash the length of the score because that
 * needs no JavaScript — the renderer sets this HTML with scripting irrelevant.
 */
function dial(score: number, max: number, indicator: Indicator): Html {
  const radius = 48;
  const circumference = 2 * Math.PI * radius;
  const fraction = max > 0 ? Math.max(0, Math.min(1, score / max)) : 0;
  const { fg } = INDICATOR_COLOR[indicator] ?? INDICATOR_COLOR.grey!;

  return html`<svg width="118" height="118" viewBox="0 0 120 120" role="img"
    aria-label="${Math.round(score)} out of ${max}">
    <circle cx="60" cy="60" r="${radius}" fill="none" stroke="${REPORT_COLORS.line}"
      stroke-width="10" />
    <circle cx="60" cy="60" r="${radius}" fill="none" stroke="${fg}" stroke-width="10"
      stroke-linecap="round" stroke-dasharray="${circumference.toFixed(1)}"
      stroke-dashoffset="${(circumference * (1 - fraction)).toFixed(1)}"
      transform="rotate(-90 60 60)" />
    <text x="60" y="58" text-anchor="middle" font-size="30" font-weight="700"
      fill="${REPORT_COLORS.ink}">${Math.round(score)}</text>
    <text x="60" y="76" text-anchor="middle" font-size="11"
      fill="${REPORT_COLORS.inkMuted}">out of ${max}</text>
  </svg>`;
}

function sectionHead(title: string, blurb?: string): Html {
  return html`<div class="section-head">
    <h2>${title}</h2>
    ${blurb && html`<p class="blurb">${blurb}</p>`}
  </div>`;
}

function napLine(nap: Nap): string | undefined {
  if (nap.formattedAddress) return nap.formattedAddress;
  return (
    sentenceList(
      [nap.street, sentenceList([nap.city, nap.state, nap.zipCode].filter(Boolean), ' ')],
      ', ',
    ) || undefined
  );
}

/* -------------------------------------------------------------------------- */
/* Cover                                                                      */
/* -------------------------------------------------------------------------- */

function coverPage(result: AuditResult): Html {
  const { business } = result;
  const indicator = indicatorForBand(result);
  const notScored = result.modulesNotScored;

  return html`<div class="cover">
    <div class="cover-brand">
      <div class="cover-logo">${raw(SENSI_LOGO_SVG)}</div>
      <div class="muted small" style="margin-left: auto">Local search &amp; AI visibility</div>
    </div>

    <p class="cover-kicker">Local search &amp; AI visibility report</p>
    <h1 style="margin-top: 6pt">${business.name}</h1>
    <div class="cover-meta">
      ${napLine(business.nap) ?? `Zip ${business.zipCode}`}<br />
      ${domainOf(business.websiteUrl)} &middot; ${formatDate(result.completedAt)}
    </div>

    <div class="cover-score">
      ${dial(result.totalScore, result.maxScore, indicator)}
      <div>
        ${pill(indicator, INDICATOR_LABEL[indicator])}
        <div class="cover-band" style="margin-top: 5pt">${result.bandLabel}</div>
        <p class="cover-summary">${result.bandSummary}</p>
      </div>
    </div>

    <div>
      <p class="upper muted" style="margin-bottom: 5pt">The five areas we scored</p>
      ${moduleStrip(result.modules)}
    </div>

    <div class="cover-note">
      <p>
        <strong>How to read this.</strong> Your score is out of
        ${result.maxScore} points across five areas. Everything we found is in here, but
        the only page you have to act on is
        <strong>“What to do next”</strong> — the fixes are in the order that gets you the
        most for the least effort.
      </p>
      ${notScored.length > 0 &&
      html`<p style="margin-top: 5pt">
        We could not check
        ${notScored.map((moduleId) => MODULE_BY_ID[moduleId].label).join(' or ')}, so
        ${notScored.length === 1 ? 'that area is' : 'those areas are'} left out of the
        score rather than counted as zero. Your score is a share of what we could verify.
        The last pages list everything we could not see and why.
      </p>`}
      ${result.recommendations.length > 0 &&
      html`<p style="margin-top: 5pt">
        ${plural(result.recommendations.length, 'thing')} to fix, worth about
        ${formatPoints(
          result.recommendations.reduce((sum, item) => sum + item.estimatedPointGain, 0),
        )}
        points in total.
      </p>`}
    </div>
  </div>`;
}

/** The band's own colour, so the cover dial and the band label always agree. */
function indicatorForBand(result: AuditResult): Indicator {
  const band = { strong: 'green', good: 'yellow', needs_work: 'orange', critical: 'red' } as const;
  return band[result.band];
}

/** A one-line-per-module summary for the cover, so page one carries the whole shape. */
function moduleStrip(modules: ModuleResult[]): Html {
  return html`<table>
    <tbody>
      ${modules.map(
        (module) => html`<tr>
          <td style="width: 130pt">${module.label}</td>
          <td style="width: 60pt" class="right nums muted">
            ${module.indicator === 'grey'
              ? 'Not scored'
              : `${formatPoints(module.points)} / ${module.maxPoints}`}
          </td>
          <td style="padding-left: 8pt">
            ${bar(module.indicator === 'grey' ? 0 : module.percent, module.indicator)}
          </td>
          <td style="width: 62pt; padding-left: 8pt">
            ${pill(module.indicator, INDICATOR_LABEL[module.indicator])}
          </td>
        </tr>`,
      )}
    </tbody>
  </table>`;
}

/* -------------------------------------------------------------------------- */
/* What to do next                                                            */
/* -------------------------------------------------------------------------- */

function recommendationsSection(recommendations: Recommendation[]): Html {
  if (!recommendations.length) {
    return html`<div class="section">
      ${sectionHead(
        'What to do next',
        'Nothing needs fixing. Everything we could check is already in good shape — keep the reviews and the posts coming.',
      )}
    </div>`;
  }

  const groups = GROUP_ORDER.map((group) => ({
    group,
    items: recommendations.filter((item) => item.group === group),
  })).filter((entry) => entry.items.length > 0);

  // Numbering runs across the whole list rather than per group, so "number 4" means the
  // same thing here as it does on screen and in a phone call about it.
  const ordered = groups.flatMap((entry) => entry.items);
  const positionOf = new Map(ordered.map((item, index) => [item.id, index + 1]));

  return html`<div class="section">
    ${sectionHead(
      'What to do next',
      'In order of what each one is worth. Every step is written so you or your marketing person can do it without help.',
    )}
    <p class="tiny muted" style="margin-top: -4pt; margin-bottom: 8pt">
      ${sentenceList(
        EFFORT_LEVELS.map(
          (effort) => `${EFFORT_LABEL[effort]} = ${EFFORT_TIME_ESTIMATE[effort]}`,
        ),
        '  ·  ',
      )}
    </p>
    ${groups.map(
      ({ group, items }) => html`<div class="group-head">
          <h3 style="color: ${REPORT_COLORS.brand}" class="upper">${GROUP_TITLE[group]}</h3>
          <p class="muted small" style="margin-top: 2pt">${GROUP_BLURB[group]}</p>
        </div>
        <div>
          ${items.map((item) => recommendationBlock(item, positionOf.get(item.id) ?? 0))}
        </div>`,
    )}
  </div>`;
}

function recommendationBlock(recommendation: Recommendation, position: number): Html {
  return html`<div class="rec">
    <div class="rec-title">
      <span class="rec-num">${position}.</span>
      <h4>${recommendation.title}</h4>
    </div>
    <div class="chips" style="margin: 3pt 0 4pt">
      <span class="badge">${MODULE_BY_ID[recommendation.moduleId].label}</span>
      <span class="badge">${EFFORT_LABEL[recommendation.effort]}</span>
      ${recommendation.group !== 'nice_to_have' &&
      html`<span class="badge">${IMPACT_LABEL[recommendation.impact]}</span>
        ${recommendation.estimatedPointGain > 0 &&
        html`<span class="badge"
          >worth about ${formatPoints(recommendation.estimatedPointGain)} points</span
        >`}`}
    </div>
    <p class="muted">${recommendation.whyItMatters}</p>
    <ul class="rec-steps">
      ${recommendation.steps.map(
        (step, index) => html`<li>
          <span class="step-num">${index + 1}</span><span>${step}</span>
        </li>`,
      )}
    </ul>
  </div>`;
}

/* -------------------------------------------------------------------------- */
/* Score, area by area                                                        */
/* -------------------------------------------------------------------------- */

function modulesSection(modules: ModuleResult[]): Html {
  return html`<div class="section">
    ${sectionHead(
      'Your score, area by area',
      'Every check behind every number. A number you cannot inspect is a number you should not have to trust.',
    )}
    ${modules.map(moduleCard)}
  </div>`;
}

function moduleCard(module: ModuleResult): Html {
  const checks = [...module.checks].sort(
    (a, b) =>
      CHECK_STATUS_ORDER[a.status] - CHECK_STATUS_ORDER[b.status] || b.maxPoints - a.maxPoints,
  );
  const unverifiable = checks.filter((check) => check.status === 'unavailable').length;

  return html`<div class="card" style="break-inside: auto">
    <div class="card-title">
      <h3>${module.label}</h3>
      <div class="row">
        <span class="nums muted small">
          ${module.indicator === 'grey'
            ? 'Not scored'
            : `${formatPoints(module.points)} of ${module.maxPoints} points`}
        </span>
        ${pill(module.indicator, INDICATOR_LABEL[module.indicator])}
      </div>
    </div>
    <p class="muted small" style="margin: 3pt 0 5pt">${module.statusLine}</p>
    ${bar(module.indicator === 'grey' ? 0 : module.percent, module.indicator)}
    ${module.unavailableReason &&
    html`<p class="small muted" style="margin-top: 5pt">
      <strong>Couldn’t check this area.</strong> ${module.unavailableReason}
    </p>`}
    <div style="margin-top: 6pt">
      ${unverifiable > 0 &&
      html`<p class="tiny muted" style="margin-bottom: 3pt">
        ${plural(unverifiable, 'check')} here could not be verified. Those points left the
        total rather than counting against you.
      </p>`}
      ${checks.map(checkRow)}
    </div>
  </div>`;
}

function checkRow(check: CheckResult): Html {
  const indicator = CHECK_STATUS_INDICATOR[check.status];
  return html`<div class="check">
    <div class="check-status">${pill(indicator, CHECK_STATUS_LABEL[check.status])}</div>
    <div class="check-body">
      <div>${check.label}</div>
      <p class="small muted" style="margin: 1pt 0 0">${check.detail}</p>
      ${check.status === 'unavailable' &&
      check.unavailableReason &&
      html`<p class="tiny muted" style="margin: 1pt 0 0">${check.unavailableReason}</p>`}
    </div>
    <div class="check-points nums">
      ${check.status === 'unavailable'
        ? `${formatPoints(check.maxPoints)} set aside`
        : `${formatPoints(check.points)} / ${formatPoints(check.maxPoints)}`}
    </div>
  </div>`;
}

/* -------------------------------------------------------------------------- */
/* Reviews                                                                    */
/* -------------------------------------------------------------------------- */

const REVIEW_SOURCE_LABEL: Record<ReviewSnapshot['source'], string> = {
  google: 'Google',
  yelp: 'Yelp',
  a_place_for_mom: 'A Place for Mom',
};

function reviewsSection(result: AuditResult): Html {
  const { reviews, reviewThemes } = result;

  return html`<div class="section">
    ${sectionHead(
      'What families are saying',
      'The numbers first, then the words. A rating tells you what you already knew; the themes are what you can take to a department head on Monday.',
    )}

    <div class="grid-2">
      ${reviews.map(
        (snapshot) => html`<div class="card">
          <div class="card-title">
            <h3>${REVIEW_SOURCE_LABEL[snapshot.source]}</h3>
            ${snapshot.rating !== undefined &&
            html`<span class="nums" style="font-size: 13pt; font-weight: 700"
              >${snapshot.rating.toFixed(1)}</span
            >`}
          </div>
          ${snapshot.unavailableReason
            ? html`<p class="small muted" style="margin-top: 4pt">
                ${snapshot.unavailableReason}
              </p>`
            : html`<div class="small muted" style="margin-top: 4pt">
                ${sentenceList(
                  [
                    snapshot.reviewCount === undefined
                      ? undefined
                      : plural(snapshot.reviewCount, 'review'),
                    snapshot.reviewsInLast90Days === undefined
                      ? undefined
                      : `${snapshot.reviewsInLast90Days} in the last 90 days`,
                    snapshot.ownerResponseRate === undefined
                      ? undefined
                      : `${Math.round(snapshot.ownerResponseRate * 100)}% answered by you`,
                    snapshot.mostRecentReviewAt
                      ? `latest ${formatRelativeDate(snapshot.mostRecentReviewAt)}`
                      : undefined,
                  ],
                  ' · ',
                ) || 'No review detail available.'}
              </div>`}
        </div>`,
      )}
    </div>

    ${reviewThemes &&
    html`<div style="margin-top: 8pt">
      ${reviewThemes.overallSentiment &&
      html`<p>
        Overall tone of the reviews:
        ${pill(
          SENTIMENT_INDICATOR[reviewThemes.overallSentiment],
          SENTIMENT_LABEL[reviewThemes.overallSentiment],
        )}
      </p>`}
      ${reviewThemes.topics.length > 0 &&
      html`<div class="card">
        <h3>What comes up most</h3>
        ${reviewThemes.topics.map(
          (topic) => html`<div class="check">
            <div class="check-status">
              ${pill(SENTIMENT_INDICATOR[topic.sentiment], SENTIMENT_LABEL[topic.sentiment])}
            </div>
            <div class="check-body">
              <div>${topic.label} <span class="muted small">— ${plural(topic.mentions, 'mention')}</span></div>
              ${topic.exampleQuote && html`<p class="quote small">“${topic.exampleQuote}”</p>`}
            </div>
          </div>`,
        )}
      </div>`}
      ${reviewThemes.keywords.length > 0 &&
      html`<div class="card">
        <h3>Words families use about you</h3>
        <p class="tiny muted" style="margin: 2pt 0 5pt">
          These are worth working into your own website copy — they are the words families
          are already typing.
        </p>
        <div class="chips">
          ${reviewThemes.keywords.map(
            (keyword) => html`<span class="badge"
              >${keyword.phrase} <span class="nums">${keyword.mentions}</span></span
            >`,
          )}
        </div>
      </div>`}
    </div>`}
  </div>`;
}

/* -------------------------------------------------------------------------- */
/* Citations                                                                  */
/* -------------------------------------------------------------------------- */

const NAP_FIELD_LABEL: Record<keyof Nap, string> = {
  name: 'Name',
  street: 'Street',
  city: 'City',
  state: 'State',
  zipCode: 'Zip code',
  phone: 'Phone',
  formattedAddress: 'Address',
};

function citationStatus(citation: CitationResult): { indicator: Indicator; label: string } {
  if (citation.listingFound === null) return { indicator: 'grey', label: 'Couldn’t check' };
  if (!citation.listingFound) return { indicator: 'red', label: 'Not listed' };
  if (citation.napMatches === false) return { indicator: 'yellow', label: 'Details differ' };
  return { indicator: 'green', label: 'Listed' };
}

function citationsSection(citations: CitationResult[]): Html {
  return html`<div class="section">
    ${sectionHead(
      'Where families find your local listings',
      'Every directory we could check, and whether your name, address and phone number match your website exactly.',
    )}
    ${citations.map((citation) => {
      const status = citationStatus(citation);
      const tier = DIRECTORY_BY_ID[citation.directoryId]?.tier;
      const href = safeHref(citation.listingUrl);
      const mismatches = citation.napMismatches ?? [];

      return html`<div class="card">
        <div class="card-title">
          <h3>${citation.label}</h3>
          ${pill(status.indicator, status.label)}
        </div>
        <p class="tiny muted" style="margin: 2pt 0 0">
          ${tier === 1
            ? 'A directory families and search engines both lean on. Worth getting exactly right.'
            : 'A secondary listing. It helps confirm your details rather than bring visitors directly.'}
        </p>
        ${citation.unavailableReason &&
        html`<p class="small muted" style="margin-top: 4pt">${citation.unavailableReason}</p>`}
        ${mismatches.length > 0 &&
        html`<div style="margin-top: 4pt">
          ${mismatches.map(
            (mismatch) => html`<p class="small" style="margin-bottom: 2pt">
              <strong>${NAP_FIELD_LABEL[mismatch.field] ?? mismatch.field}</strong> reads
              “${mismatch.onListing ?? 'nothing'}” here but “${mismatch.onWebsite ??
              'nothing'}” on your website.
            </p>`,
          )}
        </div>`}
        ${citation.duplicateListingsFound
          ? html`<p class="small" style="margin-top: 4pt">
              We found ${plural(citation.duplicateListingsFound, 'other listing')} for you
              here. Duplicates split your reviews and confuse search engines — ask the
              directory to merge them.
            </p>`
          : ''}
        ${href &&
        html`<p class="tiny muted" style="margin-top: 4pt">
          <a href="${href}">${listingLabel(href)}</a>
        </p>`}
      </div>`;
    })}
  </div>`;
}

/* -------------------------------------------------------------------------- */
/* AI visibility                                                              */
/* -------------------------------------------------------------------------- */

const ANSWER_NOTE: Record<NonNullable<AiSearchQuery['generatedAnswer']>, string> = {
  mentions_you:
    'Google wrote its own answer above the results for this search, and it named you.',
  no_mention:
    'Google wrote its own answer above the results for this search and did not name you. That answer is what many families now read instead of the results.',
  not_shared:
    'Google’s own answer was not something we were allowed to read for this search, so we are not guessing at it.',
};

function aiSearchStatus(search: AiSearchQuery): { indicator: Indicator; label: string } {
  if (search.unavailableReason) return { indicator: 'grey', label: 'Couldn’t check' };
  if (search.websiteRank !== undefined) {
    return {
      indicator: search.websiteRank <= 3 ? 'green' : 'yellow',
      label: `Your site is #${search.websiteRank}`,
    };
  }
  if (search.mentionRank !== undefined) {
    return { indicator: 'orange', label: `Mentioned at #${search.mentionRank}` };
  }
  return { indicator: 'red', label: 'Not on page one' };
}

function aiSection(searches: AiSearchQuery[]): Html {
  return html`<div class="section">
    ${sectionHead(
      'Whether AI assistants can find you',
      'These are the searches a family actually types. What comes back is what ChatGPT, Gemini and Google’s own answers are reading before they reply, so where you sit in them is the closest thing to a measure of whether an assistant will mention you.',
    )}
    ${searches.map((search) => {
      const status = aiSearchStatus(search);
      const aheadOfYou = search.aheadOfYou ?? [];
      const peopleAlsoAsk = search.peopleAlsoAsk ?? [];
      return html`<div class="card">
        <div class="card-title">
          <h3>“${search.query}”</h3>
          ${pill(status.indicator, status.label)}
        </div>
        ${search.unavailableReason &&
        html`<p class="small muted" style="margin-top: 4pt">${search.unavailableReason}</p>`}
        ${search.generatedAnswer &&
        html`<p class="small muted" style="margin-top: 4pt">
          ${ANSWER_NOTE[search.generatedAnswer]}
        </p>`}
        ${aheadOfYou.length > 0 &&
        html`<p class="small muted" style="margin-top: 4pt">
          Ahead of you: ${aheadOfYou.slice(0, 6).join(', ')}
        </p>`}
        ${peopleAlsoAsk.length > 0 &&
        html`<div style="margin-top: 5pt">
          <p class="tiny upper muted">Questions families ask on this search</p>
          <ul class="small muted" style="margin-top: 2pt">
            ${peopleAlsoAsk.map((question) => html`<li>${question}</li>`)}
          </ul>
          <p class="tiny muted">
            Answering these in plain words on your own website is how an assistant ends up
            quoting you.
          </p>
        </div>`}
      </div>`;
    })}
  </div>`;
}

/* -------------------------------------------------------------------------- */
/* Honesty pages                                                              */
/* -------------------------------------------------------------------------- */

function honestySection(result: AuditResult): Html {
  const { unavailableChecks, warnings } = result;
  if (!unavailableChecks.length && !warnings.length) return html``;

  return html`<div class="section">
    ${sectionHead(
      'What we could not check',
      'Every audit has blind spots and a report that hides them is worse than one that admits them. None of the below counted against your score — the points left the total instead.',
    )}
    ${warnings.length > 0 &&
    html`<div class="card">
      <h3>Worth knowing</h3>
      <ul class="small" style="margin-top: 4pt">
        ${warnings.map((warning) => html`<li>${warning}</li>`)}
      </ul>
    </div>`}
    ${unavailableChecks.map(
      (check) => html`<div class="card">
        <h4>${check.label}</h4>
        <p class="small muted" style="margin-top: 2pt">${check.reason}</p>
      </div>`,
    )}
  </div>`;
}

function glossarySection(): Html {
  return html`<div class="section">
    ${sectionHead(
      'Jargon, explained',
      'Every technical word in this report, in plain English. Nobody should need a marketing background to read their own audit.',
    )}
    <table>
      <tbody>
        ${GLOSSARY.map(
          (entry) => html`<tr>
            <td style="width: 130pt"><strong>${entry.term}</strong></td>
            <td class="muted">${entry.definition}</td>
          </tr>`,
        )}
      </tbody>
    </table>
  </div>`;
}

/* -------------------------------------------------------------------------- */
/* Document                                                                   */
/* -------------------------------------------------------------------------- */

/** Title used for the document and the running footer. */
export function reportTitle(result: AuditResult): string {
  return `${result.business.name} — Local search report`;
}

export function renderReportHtml(result: AuditResult): string {
  const sections: Html[] = [
    recommendationsSection(result.recommendations),
    modulesSection(result.modules),
    ...(result.reviews.length || result.reviewThemes ? [reviewsSection(result)] : []),
    ...(result.citations.length ? [citationsSection(result.citations)] : []),
    ...(result.aiSearches?.length ? [aiSection(result.aiSearches)] : []),
    honestySection(result),
    glossarySection(),
  ];

  const document = html`<!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <title>${reportTitle(result)}</title>
        <style>
          ${raw(REPORT_CSS)}
        </style>
      </head>
      <body>
        ${coverPage(result)}${sections}
      </body>
    </html>`;

  return document.value;
}
