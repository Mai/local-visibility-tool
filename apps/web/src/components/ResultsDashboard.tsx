/**
 * Screen 3 — the results dashboard (PRD 6.3).
 *
 * Reading order is deliberate: the score, then what to do about it, then the evidence.
 * An operator who reads only the first two sections has everything they need to act;
 * the panels below exist so the advice can be checked rather than believed.
 *
 * Every part of this renders on the server. The only client JavaScript on the page is
 * the glossary tooltips and the comparison chart.
 */

import type { AuditResult } from '@sensi/shared';

import { ComparisonSection } from './ComparisonSection';
import { AiVisibilityPanel } from './AiVisibilityPanel';
import { CitationsPanel } from './CitationsPanel';
import { GlossaryPanel, UnavailableChecksPanel, WarningsPanel } from './HonestyPanels';
import { ModuleCards } from './ModuleCards';
import { RecommendationsSection } from './RecommendationsSection';
import { ReviewsPanel } from './ReviewsPanel';
import { ScoreHero } from './ScoreHero';
import { SectionHeading } from './ui';

export function ResultsDashboard({ result }: { result: AuditResult }) {
  const google = result.reviews.find((snapshot) => snapshot.source === 'google');

  return (
    <div className="space-y-6">
      <ScoreHero result={result} />

      <WarningsPanel warnings={result.warnings} />

      <RecommendationsSection recommendations={result.recommendations} />

      <div>
        <SectionHeading
          title="Your score, area by area"
          blurb="Open any card to see exactly what we checked and what we found."
        />
        <div className="mt-4">
          <ModuleCards modules={result.modules} />
        </div>
      </div>

      <ComparisonSection
        comparison={result.comparison}
        businessName={result.business.name}
        {...(google?.rating === undefined ? {} : { targetRating: google.rating })}
        {...(google?.reviewCount === undefined ? {} : { targetReviewCount: google.reviewCount })}
      />

      <ReviewsPanel
        reviews={result.reviews}
        {...(result.reviewThemes ? { themes: result.reviewThemes } : {})}
      />

      <CitationsPanel citations={result.citations} />

      <AiVisibilityPanel {...(result.aiSearches ? { searches: result.aiSearches } : {})} />

      <UnavailableChecksPanel checks={result.unavailableChecks} />

      <GlossaryPanel />
    </div>
  );
}
