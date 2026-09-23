/**
 * The prioritised fix list (PRD 4.5, 6.3).
 *
 * This is the part of the report an operator actually uses, so it comes before the
 * detail panels on the page and each item opens straight onto numbered steps they can
 * follow without calling anyone.
 *
 * Ordering is the API's — quick wins, then bigger projects, then habits, each by points
 * recoverable. The UI does not re-rank it; the scoring engine knows what a fix is worth
 * and the screen would only be guessing.
 */

import { MODULE_BY_ID, type Recommendation } from '@sensi/shared';

import {
  EFFORT_LABEL,
  EFFORT_LEVELS,
  EFFORT_TIME_ESTIMATE,
  formatPoints,
  GROUP_BLURB,
  GROUP_ORDER,
  GROUP_TITLE,
  IMPACT_LABEL,
} from '@/lib/format';
import { INDICATOR_TEXT } from '@/lib/indicators';

import { Badge, Card, Expandable, SectionHeading } from './ui';

const IMPACT_COLOR = {
  high: INDICATOR_TEXT.red,
  medium: INDICATOR_TEXT.orange,
  low: INDICATOR_TEXT.grey,
} as const;

function RecommendationItem({
  recommendation,
  position,
  defaultOpen,
}: {
  recommendation: Recommendation;
  position: number;
  defaultOpen: boolean;
}) {
  return (
    <li className="border-t border-(--color-line) first:border-t-0">
      <Expandable
        defaultOpen={defaultOpen}
        summary={
          <span className="block">
            <span className="flex flex-wrap items-baseline gap-x-2">
              <span className="text-sm font-semibold text-(--color-ink-muted) tabular-nums">
                {position}.
              </span>
              <span className="font-semibold text-(--color-ink)">{recommendation.title}</span>
            </span>
            <span className="mt-1.5 flex flex-wrap items-center gap-2">
              <Badge>{MODULE_BY_ID[recommendation.moduleId].label}</Badge>
              <Badge>{EFFORT_LABEL[recommendation.effort]}</Badge>
              {recommendation.group !== 'nice_to_have' && (
                <>
                  <span className={`text-xs font-semibold ${IMPACT_COLOR[recommendation.impact]}`}>
                    {IMPACT_LABEL[recommendation.impact]}
                  </span>
                  {recommendation.estimatedPointGain > 0 && (
                    <span className="text-xs text-(--color-ink-muted)">
                      worth about {formatPoints(recommendation.estimatedPointGain)} points
                    </span>
                  )}
                </>
              )}
            </span>
          </span>
        }
      >
        <p className="text-sm text-(--color-ink-muted)">{recommendation.whyItMatters}</p>
        <p className="mt-3 text-sm font-medium text-(--color-ink)">How to do it</p>
        <ol className="mt-1.5 space-y-1.5 text-sm text-(--color-ink)">
          {recommendation.steps.map((step, index) => (
            <li key={step} className="flex gap-2.5">
              <span
                aria-hidden
                className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-(--color-brand-soft) text-xs font-semibold text-(--color-brand)"
              >
                {index + 1}
              </span>
              <span className="min-w-0">{step}</span>
            </li>
          ))}
        </ol>
      </Expandable>
    </li>
  );
}

export function RecommendationsSection({
  recommendations,
}: {
  recommendations: Recommendation[];
}) {
  if (!recommendations.length) {
    return (
      <Card className="p-5 sm:p-6">
        <SectionHeading
          title="What to do next"
          blurb="Nothing needs fixing. Everything we could check is already in good shape — keep the reviews and posts coming."
        />
      </Card>
    );
  }

  const groups = GROUP_ORDER.map((group) => ({
    group,
    items: recommendations.filter((recommendation) => recommendation.group === group),
  })).filter((entry) => entry.items.length > 0);

  // Numbering runs across the whole list, not per group, so "number 4" means the same
  // thing wherever it is quoted. Worked out up front rather than by counting during
  // render, which React is entitled to do more than once.
  const positionOf = new Map(
    groups.flatMap((entry) => entry.items).map((recommendation, index) => [recommendation.id, index + 1]),
  );

  return (
    <Card className="p-5 sm:p-6">
      <SectionHeading
        title="What to do next"
        blurb="Ordered by how much each one is worth. Open any of them for the steps."
        aside={<Badge>{recommendations.length} things to fix</Badge>}
      />

      <p className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-(--color-ink-muted)">
        {EFFORT_LEVELS.map((effort) => (
          <span key={effort}>
            <span className="font-semibold text-(--color-ink)">{EFFORT_LABEL[effort]}</span>{' '}
            = {EFFORT_TIME_ESTIMATE[effort]}
          </span>
        ))}
      </p>

      <div className="mt-5 space-y-7">
        {groups.map(({ group, items }) => (
          <div key={group}>
            <h3 className="text-sm font-semibold tracking-wide text-(--color-brand) uppercase">
              {GROUP_TITLE[group]}
            </h3>
            <p className="mt-1 text-sm text-(--color-ink-muted)">{GROUP_BLURB[group]}</p>
            <ul className="mt-2">
              {items.map((recommendation) => {
                const position = positionOf.get(recommendation.id) ?? 0;
                return (
                  <RecommendationItem
                    key={recommendation.id}
                    recommendation={recommendation}
                    position={position}
                    // The top three open on arrival. Somebody scanning the page should
                    // see what a recommendation actually contains without hunting for
                    // the control that reveals it.
                    defaultOpen={position <= 3}
                  />
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </Card>
  );
}
