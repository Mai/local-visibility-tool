/**
 * The print stylesheet.
 *
 * This is a paginated document, not a screenshot of the dashboard, so it is styled from
 * scratch rather than by reusing the app's CSS: it needs a cover page, page breaks that
 * fall between findings instead of through them, and type sized in points.
 *
 * Two things here are load-bearing and easy to lose:
 *
 * 1. `print-color-adjust: exact`. Chromium strips background colours when printing by
 *    default, which would turn every traffic-light pill and every score bar white — a
 *    report whose entire visual language is colour would arrive with none of it.
 * 2. No external resources. The renderer sets this HTML directly with no base URL and no
 *    network, so a webfont or a remote image would hang the render or silently vanish.
 *    Everything is a system font, a data-URI'd font file, or inline SVG.
 */

import { OPEN_SANS_WOFF2_BASE64 } from './fonts.js';

/** Mirrors the `@theme` tokens in `apps/web/src/app/globals.css`. */
export const REPORT_COLORS = {
  ink: '#1c2538',
  inkMuted: '#5b6472',
  surface: '#ffffff',
  surfaceSunken: '#f4f6f8',
  line: '#e1e7ed',
  brand: '#005799',
  brandSoft: '#e0f2ff',
  green: '#1a7f4b',
  greenSoft: '#e6f4ec',
  yellow: '#b7791f',
  yellowSoft: '#fdf3e0',
  orange: '#c4600f',
  orangeSoft: '#fdeee0',
  red: '#b42318',
  redSoft: '#fdeceb',
} as const;

/** Indicator name → the pair of colours it is drawn with. */
export const INDICATOR_COLOR: Record<string, { fg: string; bg: string }> = {
  green: { fg: REPORT_COLORS.green, bg: REPORT_COLORS.greenSoft },
  yellow: { fg: REPORT_COLORS.yellow, bg: REPORT_COLORS.yellowSoft },
  orange: { fg: REPORT_COLORS.orange, bg: REPORT_COLORS.orangeSoft },
  red: { fg: REPORT_COLORS.red, bg: REPORT_COLORS.redSoft },
  grey: { fg: REPORT_COLORS.inkMuted, bg: REPORT_COLORS.surfaceSunken },
};

export const REPORT_CSS = `
@font-face {
  font-family: 'Open Sans';
  font-weight: 300 800;
  font-style: normal;
  src: url(data:font/woff2;base64,${OPEN_SANS_WOFF2_BASE64}) format('woff2-variations');
}

:root {
  --ink: ${REPORT_COLORS.ink};
  --muted: ${REPORT_COLORS.inkMuted};
  --surface: ${REPORT_COLORS.surface};
  --sunken: ${REPORT_COLORS.surfaceSunken};
  --line: ${REPORT_COLORS.line};
  --brand: ${REPORT_COLORS.brand};
  --brand-soft: ${REPORT_COLORS.brandSoft};
}

* {
  box-sizing: border-box;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}

html, body {
  margin: 0;
  padding: 0;
  color: var(--ink);
  background: var(--surface);
  font-family: 'Open Sans', system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial,
    sans-serif;
  font-size: 9.5pt;
  line-height: 1.45;
}

p { margin: 0 0 6pt; orphans: 3; widows: 3; }
p:last-child { margin-bottom: 0; }
ul, ol { margin: 0 0 6pt; padding-left: 14pt; }
li { margin-bottom: 3pt; }
li:last-child { margin-bottom: 0; }
strong { font-weight: 600; }
a { color: var(--brand); text-decoration: none; word-break: break-word; }

/* Headings pull their section with them rather than sitting alone at a page foot. */
h1, h2, h3, h4 { margin: 0; break-after: avoid; }
h1 { font-size: 22pt; line-height: 1.15; letter-spacing: -0.3pt; }
h2 { font-size: 14pt; letter-spacing: -0.2pt; }
h3 { font-size: 10.5pt; }
h4 { font-size: 9.5pt; }

.muted { color: var(--muted); }
.small { font-size: 8pt; }
.tiny { font-size: 7pt; }
.nums { font-variant-numeric: tabular-nums; }
.right { text-align: right; }
.center { text-align: center; }
.upper { text-transform: uppercase; letter-spacing: 0.5pt; font-size: 7.5pt; font-weight: 700; }

/* ---------------------------------------------------------------- layout */

/*
 * Every section starts a page, and only this rule says so. The cover used to carry a
 * break-after of its own and the pair produced a blank page two. A :first-of-type on
 * .section cannot cancel that, because first-of-type counts div siblings and the cover is
 * the first div. One owner for the boundary, no arithmetic.
 *
 * (No backticks in this stylesheet: it lives in a JS template literal.)
 */
.section { break-before: page; }
.section-head { margin-bottom: 8pt; padding-bottom: 5pt; border-bottom: 1pt solid var(--line); }
.section-head .blurb { margin: 3pt 0 0; color: var(--muted); font-size: 8.5pt; }

.card {
  border: 0.75pt solid var(--line);
  border-radius: 5pt;
  padding: 8pt 9pt;
  margin-bottom: 7pt;
  break-inside: avoid;
}
.card:last-child { margin-bottom: 0; }
.card-title { display: flex; justify-content: space-between; gap: 8pt; align-items: baseline; }

.grid-2 { display: flex; flex-wrap: wrap; gap: 7pt; }
.grid-2 > * { width: calc(50% - 3.5pt); margin-bottom: 0; }

.row { display: flex; gap: 8pt; align-items: baseline; }
.chips { display: flex; flex-wrap: wrap; gap: 3pt; }

/* ---------------------------------------------------------------- cover */

.cover { padding-top: 6pt; }
.cover-brand {
  display: flex; align-items: center; gap: 5pt;
  padding-bottom: 10pt; margin-bottom: 22pt;
  border-bottom: 1.5pt solid var(--brand);
}
.cover-logo { height: 11pt; width: auto; display: block; }
.cover-logo svg { height: 100%; width: auto; display: block; }
.cover-kicker { color: var(--brand); font-weight: 700; text-transform: uppercase; letter-spacing: 0.8pt; font-size: 8pt; }
.cover-meta { margin-top: 10pt; color: var(--muted); font-size: 9pt; }
.cover-score { display: flex; align-items: center; gap: 20pt; margin: 26pt 0 22pt; }
.cover-band { font-size: 13pt; font-weight: 600; }
.cover-summary { margin-top: 4pt; color: var(--muted); max-width: 300pt; }
.cover-note {
  margin-top: 20pt; padding: 8pt 9pt;
  background: var(--sunken); border-radius: 5pt;
  font-size: 8.5pt; color: var(--muted);
}

/* ---------------------------------------------------------------- pills & bars */

.pill {
  display: inline-block; padding: 1.5pt 5pt; border-radius: 20pt;
  font-size: 7.5pt; font-weight: 600; white-space: nowrap;
}
.badge {
  display: inline-block; padding: 1.5pt 5pt; border-radius: 3pt;
  border: 0.75pt solid var(--line); background: var(--sunken);
  font-size: 7.5pt; color: var(--muted); white-space: nowrap;
}

.bar { height: 5pt; border-radius: 3pt; background: var(--sunken); overflow: hidden; }
.bar-fill { height: 100%; border-radius: 3pt; }

/* ---------------------------------------------------------------- checks */

.check {
  display: flex; gap: 7pt; align-items: flex-start;
  padding: 4pt 0; border-top: 0.5pt solid var(--line);
  break-inside: avoid;
}
/*
 * Wide enough for the longest status pill. The pills are nowrap by design — "Couldn't
 * check" broken over two lines reads as two separate words — so this column has to fit
 * the widest of them or the pill overruns into the check label beside it. It did.
 */
.check-status { width: 72pt; flex: none; }
.check-body { flex: 1; }
.check-points { width: 44pt; flex: none; text-align: right; color: var(--muted); font-size: 7.5pt; }

/* ---------------------------------------------------------------- recommendations */

.rec { padding: 7pt 0; border-top: 0.75pt solid var(--line); break-inside: avoid; }
.rec:first-child { border-top: 0; padding-top: 0; }
.rec-title { display: flex; gap: 5pt; align-items: baseline; }
.rec-num { color: var(--muted); font-weight: 600; font-variant-numeric: tabular-nums; }
.rec-steps { margin: 4pt 0 0; padding-left: 0; list-style: none; counter-reset: step; }
.rec-steps li { display: flex; gap: 5pt; margin-bottom: 2.5pt; }
.rec-steps .step-num {
  flex: none; width: 11pt; height: 11pt; border-radius: 11pt;
  background: var(--brand-soft); color: var(--brand);
  font-size: 7pt; font-weight: 700; line-height: 11pt; text-align: center;
}
/*
 * break-after on the div, not just on the h3 inside it. The generic heading rule cannot
 * help here: the break falls after the wrapper that holds the heading and its blurb, so
 * "Bigger projects" was landing alone at the foot of a page with its first item overleaf.
 */
.group-head { margin: 12pt 0 5pt; break-after: avoid; break-inside: avoid; }
.group-head:first-child { margin-top: 0; }

/* ---------------------------------------------------------------- tables */

table { width: 100%; border-collapse: collapse; }
th {
  text-align: left; padding: 0 5pt 4pt 0;
  border-bottom: 0.75pt solid var(--line);
  color: var(--muted); font-size: 7.5pt; text-transform: uppercase; letter-spacing: 0.4pt;
}
td { padding: 4pt 5pt 4pt 0; border-bottom: 0.5pt solid var(--line); vertical-align: top; }
tr { break-inside: avoid; }

.quote {
  margin: 3pt 0 0; padding-left: 6pt;
  border-left: 1.5pt solid var(--line);
  color: var(--muted); font-style: italic;
}
`;
