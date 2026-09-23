# Senior Care Local SEO & GEO Evaluation Tool

Audits a senior living community's local search and AI-answer visibility, scores it
out of 100 against nearby competitors, and exports a plain-language PDF report.

Built for non-technical operators: no jargon without an explanation, traffic-light
indicators, and step-by-step fixes.

## Stack

| Layer          | Choice                                                       |
| -------------- | ------------------------------------------------------------ |
| Frontend       | Next.js 16 (App Router) + Tailwind CSS 4 + Recharts           |
| Backend        | Node 24 + Express 5 + TypeScript                              |
| Scraping       | Playwright (Chromium)                                         |
| PDF            | Playwright Chromium `page.pdf()` — reuses the scraping browser |
| Shared domain  | `@sensi/shared` workspace package                              |

One language across the stack: Playwright is Node-native, and reusing its Chromium
for PDF rendering avoids a second browser download.

## Layout

```
packages/shared/   Types, scoring model, care-type keywords, directories, glossary
apps/api/          Express API: collectors, scoring engine, PDF export
apps/web/          Operator-facing UI
docs/PHASES.md     Build plan, phase by phase
```

## Getting started

```bash
npm install
npm run playwright:install     # one-time Chromium download (~95 MB)
cp .env.example .env           # then fill in API keys
npm run dev                    # API on :4000, web on :3000
```

Open http://localhost:3000 — the home page reports whether the API is reachable and
which API keys are still missing.

Other commands:

```bash
npm run build        # shared -> api -> web
npm run typecheck
npm run test
npm run lint
```

## API keys

All free. Total monthly cost at expected volume: $0. Every key is optional — a
missing key marks the affected checks "unable to verify" instead of breaking the
audit — but the score is only complete with all three.

| Key                     | Powers                                              | Where                                  | Free tier              |
| ----------------------- | --------------------------------------------------- | -------------------------------------- | ---------------------- |
| `GOOGLE_PLACES_API_KEY` | Google Business Profile, reviews, competitors        | console.cloud.google.com → Places API  | $200 credit/mo         |
| `SERPER_API_KEY`        | Google SERP results, AI Overview, citation fallbacks | serper.dev                             | 2,500 searches/mo      |
| `YELP_API_KEY`          | Yelp listing and reviews                             | yelp.com/developers                    | 5,000 calls/day        |
| `PAGESPEED_API_KEY`     | Core Web Vitals and mobile checks                    | Same Cloud project                     | Free                   |

**Do this right after creating the Google key:** set a **$0 budget alert** in Google
Cloud Console. It emails you before any charge could occur.

Two things that are easy to miss in the Cloud Console:

- **Enable "Places API (New)"**, not the legacy "Places API". The new one is a
  separate service (`places.googleapis.com`); with only the old one enabled every
  Google listing call returns `403 SERVICE_DISABLED` and Modules A and D come back
  "unable to verify".
- **Enable "PageSpeed Insights API"** in the same project. PageSpeed nominally works
  without a key, but the shared keyless quota is exhausted in practice, so the speed
  and mobile checks need one.

Yelp's free access level covers business search — star rating and review count — but
answers the reviews endpoint with `404` for every business, so review *wording* comes
from Google only. The audit says so rather than showing an empty themes panel.

## Scoring

| Module                     | Points |
| -------------------------- | -----: |
| Google Business Profile    |     25 |
| Local Listings (citations) |     20 |
| Website Location Signals   |     25 |
| Reviews                    |     15 |
| AI Search Visibility (GEO) |     15 |
| **Total**                  |**100** |

Bands: 80–100 Strong · 60–79 Good · 40–59 Needs work · 0–39 Critical.

## Notes

- Scraped results are cached 24h (`CACHE_TTL_SECONDS`) to avoid redundant requests.
- robots.txt is respected by default (`RESPECT_ROBOTS_TXT=true`).
- If `npm install` fails with `EACCES` in `~/.npm/_cacache`, the npm cache has
  root-owned directories from a past `sudo npm` run. Fix once with
  `sudo chown -R $(whoami) ~/.npm`.
