# Build plan

The tool is built in phases. Each phase leaves the app runnable, and every module
degrades gracefully — a blocked scraper or a missing API key marks a check
"unable to verify" instead of failing the audit (PRD 5.4).

## Phase 1 — Project structure and dependencies ✅

- npm workspaces monorepo: `packages/shared`, `apps/api`, `apps/web`
- `@sensi/shared`: audit types, 100-point scoring model, score bands, care-type
  keyword vocabulary, citation directory registry, glossary, input validation,
  loading-screen steps
- `apps/api`: Express 5 app, validated env config, structured logger, operator-safe
  error types, `/health` readiness endpoint, audit routes stubbed at 501
- `apps/web`: Next.js app shell with Tailwind tokens and a setup-status home page
- Tests for the scoring bands, validation and keyword detection

## Phase 2 — Website fetch and on-page analysis (Module C, 25 pts) ✅

- Playwright page fetcher with robots.txt respect, 24h disk cache, retry/backoff
- Crawl homepage + contact page + care-type pages; extract title, meta, headings,
  body text, JSON-LD, embedded maps, NAP in text
- PageSpeed Insights client for Core Web Vitals and mobile-friendliness
- Module C checks and scoring; care-type auto-detection from page content

## Phase 3 — Google Business Profile and reviews (Modules A + D, 40 pts) ✅

- Google Places client (place lookup by name/website + zip, place details)
- Module A checks: claimed listing, NAP match vs. website, categories, hours,
  photos, services, Q&A, recent posts, description keywords
- Yelp Fusion client; Module D checks: ratings, volume, recency, owner responses
- Review theme + sentiment extraction and the customer-language keyword panel

Built and unit-tested. Two live limits, both reported to the operator rather than
hidden: Module A needs **Places API (New)** enabled on the Google Cloud project
before it can be verified end to end, and Yelp answers the reviews endpoint with
`404` at our access level, so review *wording* comes from Google alone.

Verified live once Places was enabled, and the review panel is where the first run
gave the least usable output. What it earned:

- The Business Profile *description* cannot be checked at all. Google publishes only
  its own editorial blurb; the field the operator writes is not exposed. So a blurb we
  can read is evidence and one we cannot is none — the check reports "unable to verify"
  instead of docking two points for an invisible field.
- The keyword panel drops the community's own name. "Cloverland Park" topping the list
  of words families use is not language an operator can act on.
- It drops bare verdicts too ("great", "amazing", "everyone", "loved"). Only single
  words are filtered, so "great staff" — which does tell them what to write — survives.
- A word families mostly used inside a longer phrase is a fragment of it: two of the
  three "front"s were "front desk". Singular and plural are one keyword.
- Phrases are ranked by how many *families* used them, not filtered on it. Filtering
  emptied the panel to five rows the moment a plural merge nudged the count.
- Each topic gets its own example quote. One sentence about activities that promote
  resident health is a fair example of "Quality of care" and of "Activities and
  engagement" alike, but printed under both it reads as a bug.

## Phase 4 — Citations (Module B, 20 pts) ✅

- Per-directory checkers: `api` (Yelp) → `serp` (a `site:` search locates the
  listing) → `scrape` (that one page, robots respected). Directory search pages are
  never crawled.
- NAP comparison, care-type keyword presence, duplicate detection
- "Unable to verify" everywhere a check cannot be proved — those points leave the
  denominator instead of scoring zero

Verified live against a real community, which is where the matching rules were
earned. Every one of them exists because the first run gave bad advice:

- Only *identifying* words can match a name. Senior living names are built from a
  dozen shared words, so "Exceptional Senior Living" matched "Brookdale Senior
  Living" on overlap alone.
- Landscape words (Park, Village, Meadows) identify nobody either: on "park" we
  offered a Healthgrades listing for an urgent care clinic.
- Page text can *confirm* a listing's details, never *contradict* them. Only the
  directory's own structured record may disagree — the first address on an A Place
  for Mom page belongs to a community three miles away.
- The website's other phone numbers and addresses count as the website's. Operators
  publish a sales line and a main line; whichever we picked as primary is arbitrary.

## Phase 5 — AI visibility (Module E, 15 pts) ✅

- Serper.dev SERP queries for "[care type] in [city]", plus one brand search
- Content-structure GEO readiness scoring: question sections answered in full
  sentences or FAQ markup, one plain sentence saying what the place is and where,
  each care type headed and described, third-party mentions
- `POST /api/analyze/geo`

**The AI Overview check reports "unavailable", and stays that way.** The plan above
said "Playwright AI Overview extraction". We cannot do that honestly: Google's
robots.txt disallows `/search`, and respecting robots.txt is a binding constraint on
this tool (PRD 5.2) — one we are not going to keep for other people's sites and break
for Google's. Serper is a licensed SERP API and does not pass the AI Overview through.
So `geo.ai_answer` reports "unable to verify" with a reason the operator can read, its
3 points leave the denominator (PRD 5.4), and the other 12 measure the ingredients an
AI answer is assembled from — which is the part the operator can actually change. When
Serper does return an answer box, that check scores for real.

Verified live, and as in Phase 4 the first run produced findings that did not hold up:

- `bodyText` joins block elements with a space, so a nav menu, a list of `utm_`
  parameters and a headline ran together into a 50-word "sentence" naming the
  community and its town. Pages now also keep `textBlocks`, and anything judging how a
  page *reads* works from those — a sentence never spans two blocks.
- A question section now requires a question mark. "WHAT MAKES US DIFFERENT AND
  BETTER" starts with a question word and is a banner; telling an operator to answer
  it in full sentences is advice they would rightly ignore.
- An answer is looked for outside the heading's own wrapper too. Page builders wrap
  headings in their own `div`, which read as "you asked this and answered nothing".
- Google's "people also ask" is filtered to questions about care. For "memory care in
  Brentwood, TN" it included "What is one celebrity who lives in Brentwood, TN?".
- Job boards do not count as sites that talk about you. `indeed.com` ranks for the
  community's name because of its open shifts and says nothing about its care.

## Phase 6 — Competitors, scoring engine, recommendations ✅

- Competitor discovery via Places within a widening radius of the target's coordinates
- Comparison table, radar data, plain-language standing insights
- Total score assembly and the ranked recommendation engine
  (quick wins / strategic / ongoing, with effort and impact labels)
- `POST /api/audits` and `GET /api/audits/:auditId` — the whole audit end to end

**Radius, not a list of zip codes.** The plan said "the target zip + 2 neighbouring
zips". There is no such thing as a neighbouring zip code you can compute: 37027 and
37028 are 80 miles apart. Discovery searches a circle around the listing's real
coordinates, widening 5 → 10 → 20 miles until it has at least three communities, and
reports back the zips it actually reached.

**The comparison is narrower than the audit, and says so.** Only two of the five
modules are measurable from what Google publishes about a business — the listing and
the reviews. We are not going to crawl a competitor's website to grade it. So the
comparison carries its own `basis` sentence, re-scores the operator's own community on
that same restricted basis, and names the modules it compared. Ranking a 100-point
audit against a 40-point one would be flattering and meaningless.

**A module nothing could be verified in leaves the denominator too.** The rule Phase 3
set for checks now applies between modules: an entirely unscorable module is reported
in `modulesNotScored` rather than dragging the total down as a phantom zero.

Verified live, and again the first runs produced findings worth keeping:

- Text Search takes a circle as `locationBias`, a hint — its `locationRestriction`
  accepts only a rectangle. Sending a circle there is a 400. "Within five miles" has to
  be our arithmetic, not Google's promise, so the radius is enforced after the fact.
- **Failures must not be cached.** That 400 kept coming back for two runs after it was
  fixed, because the 24-hour cache had stored it. `withCache` now takes `shouldCache`:
  "no listing exists" is an answer worth keeping, "Google would not talk to us this
  minute" is not.
- A referral franchise is not a competitor. "Assisted Living Locators South Nashville"
  has no building, scored 88 on listing completeness and pulled the market average up.
  Placement agencies, advisors and medical centres are vetoed by name.
- Rank alone misleads in both directions. A community scoring 80 against an average of
  84 came fifth of six, and "four of five are ahead of you" read as a contradiction of
  "you are in the middle of the pack". The headline now states the score and the
  average, then the count.
- **Google does not publish the category for senior living listings at this access
  level.** Every community in the test market — five operators, two national brands —
  comes back as `primaryType: 'health'`. The check was failing the entire industry for
  a field it cannot read, at 3 points each. It now reports "unable to verify" with the
  advice still attached, which moved the target's own listing from 84% to 100%.
- Lowercasing a module label for mid-sentence use produced "your google business
  profile". Proper nouns get written out.

## Phase 7 — UI screens ✅

- Screen 1 input (`app/page.tsx` + `AuditForm`), Screen 2 progress (`ProgressView`),
  Screen 3 results (`ResultsDashboard`) — screens 2 and 3 share one shareable URL,
  `/audit/[auditId]`, and `AuditView` swaps one for the other when the result lands
- Score dial, per-module cards, comparison chart and table, expandable
  recommendations, glossary tooltips, review/citation/AI panels, honesty panels
- `lib/indicators.ts` and `lib/format.ts` hold every colour and every label, so
  "grey means we could not check" is stated in one place instead of per component

**Server-rendered except where it cannot be.** Three client components — the tooltip,
the form, the poller — plus the chart. Everything else is a server component, which
keeps recharts and the panel code out of the browser bundle entirely.

**Expandables are `<details>`, not React state.** Native disclosure gives keyboard and
screen-reader behaviour for free, needs no hydration, and — the reason it matters for
what comes next — Phase 8 can force every section open with two lines of print CSS. A
`useState` version would print as a page of collapsed headings.

Verified live against a real audit, at 390×844 and 1280×900, and the run turned up
three defects worth recording:

- **Hover-to-open and click-to-toggle fight each other.** One `open` flag set by hover
  and toggled by click means the mouse arrives, hover opens the tooltip, and the click
  the user came to make closes it. `pinned` and `hovered` are now separate and `open`
  is their union. Found because Playwright reported `tipVisible: false`, but it was
  every desktop user's bug, not the harness's.
- **`react-hooks/set-state-in-effect` was right about the mounted flag.** The usual
  `useEffect(() => setMounted(true), [])` trick for a DOM-measuring chart is a render
  wasted on every page. Recharts moved into `ComparisonChartImpl` and loads through
  `next/dynamic(..., { ssr: false })` — no state, no effect, and it never reaches the
  server bundle.
- **Counting during render is not allowed to be counted on.** Numbering the
  recommendations with `position += 1` inside `.map` breaks the moment React renders
  twice. The positions are precomputed into a `Map` keyed by recommendation id.
- `websiteUrl` was missing from the progress envelope, so reloading the progress page
  or opening the link on a phone showed a percentage with no community attached. It now
  comes from the job, not the browser's history state.
- The chart is `aria-hidden` and the table below it carries the same numbers. Announcing
  both would read every score twice.
- Dynamic indicator colours are literal class maps. Tailwind ships the classes it can
  see in the source; a computed `text-${colour}-600` ships nothing.

## Phase 8 — PDF export ✅

- `report/html.ts` — an auto-escaping `html` tagged template; `report/styles.ts` — the
  print stylesheet; `report/template.ts` — the document; `report/pdf.ts` — the render
- `GET|POST /api/audits/:auditId/pdf` streams `application/pdf` as an attachment named
  after the community and the audit date. 404 for an unknown id, 409 while an audit is
  still running or when it failed with no report to download
- A cover, then the fix list, then the evidence: recommendations → module findings →
  comparison → reviews → citations → AI visibility → what we could not check → glossary
- `?branding=false` (or `{"branding": false}`) drops the Sensi mark for an agency
  sending the report under its own name
- "Download the PDF" on the results hero is a plain `<a href>`, so it survives being
  right-clicked or forwarded and needs no JavaScript on the page

**A separate print template, not a print stylesheet over the dashboard.** The API must
be able to produce the file with the web app switched off, and a paginated document
needs a cover, page breaks between findings, and page numbers — none of which a
scrolling screen wants. `page.setContent()` with no external resources also means the
render cannot hang on the network.

**One vocabulary, two renderers.** Every label, band, status and effort phrase moved
from `apps/web/src/lib/` into `packages/shared/src/labels.ts`. Colours stay with
whoever paints them — Tailwind classes in the app, hex in the print stylesheet — but two
copies of "Couldn't check" would have drifted apart the first time either was reworded.

Two rules in the stylesheet are load-bearing and easy to lose: `print-color-adjust:
exact`, because Chromium strips background colours when printing and a report whose
entire visual language is colour would arrive with none of it; and no external
resources, so system fonts and inline SVG only.

Verified by rasterising all 15 pages of a real audit and reading them, which is the only
reason the following were found — none of them were visible in the markup:

- **The status column was 46pt and the pills are `nowrap`.** "Couldn't check" overran
  into the check label beside it: `Couldn't cheYour listing category says…`. The column
  now fits the widest pill it has to hold, and a test asserts the width rather than the
  rendering, since the rendering is what nobody looks at.
- **"Bigger projects" was orphaned at the foot of a page** with its first item overleaf.
  The generic `h1,h2,h3,h4 { break-after: avoid }` cannot reach it — the break falls
  after the div wrapping the heading and its blurb, so the wrapper needs the rule.
- **The operator's own row in the comparison table had no rating.** Every competitor
  showed "4.6 stars, 44 reviews" while the one row the reader came for was blank,
  directly beneath an insight reading "Your 4.4-star rating is in line with the 4.6
  average near you." The row now fills from the same Google snapshot the reviews module
  collected, so the column compares like with like.
- **Directory URLs arrive dressed in tracking parameters.** Yelp's ran to two wrapped
  lines of `?adjust_creative=…`. Only the tracking is stripped, not the whole query:
  Apple Maps keeps the listing's identity in `?place-id=`, and dropping it printed every
  Apple row as a bare `maps.apple.com/place`. The link keeps the URL exactly as given.

Caught before rendering, both worth remembering:

- **`cond && html\`…\`` inherits JSX's zero trap.** `items.length && html\`…\`` prints a
  bare "0" into the document. Guards are written `length > 0` for that reason, and a test
  pins `html\`${0}\`` rendering as `"0"` so nobody "fixes" the renderer instead.
- **`.section:first-of-type` can never match.** `first-of-type` counts div siblings and
  the cover is the first div, so the cover's `break-after: page` plus `.section`'s
  `break-before: page` would have put a blank page two in every report. One rule owns
  the boundary now, and a test asserts no `break-after: page` survives anywhere.

`page.pdf()` only works in headless Chromium, so `PLAYWRIGHT_HEADLESS=false` — a
scrape-debugging switch — would otherwise break every download. `getRenderBrowser()`
launches a second, always-headless browser in that case. Letter, not A4, and the page
geometry lives in the `page.pdf()` call rather than in `@page` so there is one place to
look.

Live: 200 with `application/pdf`, ~779KB, 15 pages, `Content-Disposition` naming the
community; 409 with "That audit is still running" for a PDF requested mid-audit; 409 for
an audit that failed on an unreachable website; 404 for an unknown id;
`?branding=false` produces the same 15 pages with no Sensi mark; and the results-page
button downloads `cloverland-park-local-search-report-2026-08-18.pdf` in a real browser.

## Phase 9 — Brand guide compliance ✅

Brought the app and the PDF in line with sensi.ai/brand-guide, which the app predated:

- Colour tokens (`apps/web/src/app/globals.css`, mirrored in `apps/api/src/report/styles.ts`)
  replaced with the guide's palette — Gray 500 for text, Blue 600 for the brand colour, Blue
  50 for its soft tint. The pass/warn/attention/fail traffic lights are functional, not
  brand colours, and are unchanged.
- Open Sans replaces the system-font stack: `next/font/google` on the web app, an embedded
  variable-weight woff2 (`report/fonts.ts`) on the PDF, since the PDF renderer has no
  network to fetch a webfont from.
- The real Sensi wordmark (`apps/web/public/sensi-logo.svg`, inlined for the PDF as
  `report/logo.ts`) replaces the placeholder "S" square + "Sensi" text drawn in CSS, and now
  sits in a header on every screen — nothing had named Sensi anywhere in the web app before.

**The white-label option from Phase 8 is removed, not just unused.** `?branding=false` used
to drop the Sensi mark from the PDF for an agency sending it under its own name, following
the PRD's "Sensi branding optional" (4.6). The brand guide says the opposite — "No white
labeling; Sensi name must always be identified" — and asked to follow it strictly overrides
the PRD here. `ReportOptions`, `PdfExportRequest.branding` and the query/body parsing for it
are gone from `@sensi/shared` and `apps/api`, not just disconnected from the UI; the cover
now renders the mark unconditionally.
