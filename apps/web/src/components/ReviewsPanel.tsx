/**
 * Reviews: the numbers, then what families actually said (PRD 4.6, 6.3).
 *
 * The themes and keywords are the part operators read twice. A rating tells them
 * something they already knew; "five reviewers mentioned the dining room, and not
 * kindly" is a thing they can take to a department head on Monday.
 */

import type { ReviewSnapshot, ReviewThemes } from '@sensi/shared';

import { formatRelativeDate, plural } from '@/lib/format';
import {
  INDICATOR_SOFT_BG,
  INDICATOR_TEXT,
  SENTIMENT_INDICATOR,
  SENTIMENT_LABEL,
} from '@/lib/indicators';

import { Badge, Card, EmptyNote, SectionHeading, UnverifiableNote } from './ui';

const SOURCE_LABEL: Record<ReviewSnapshot['source'], string> = {
  google: 'Google',
  yelp: 'Yelp',
  a_place_for_mom: 'A Place for Mom',
};

function SnapshotCard({ snapshot }: { snapshot: ReviewSnapshot }) {
  return (
    <div className="rounded-lg border border-(--color-line) p-4">
      <p className="text-sm font-medium text-(--color-ink)">{SOURCE_LABEL[snapshot.source]}</p>

      {snapshot.unavailableReason ? (
        <p className="mt-1.5 text-sm text-(--color-ink-muted)">{snapshot.unavailableReason}</p>
      ) : (
        <>
          <p className="mt-1 text-2xl font-semibold text-(--color-ink) tabular-nums">
            {snapshot.rating === undefined ? '—' : `${snapshot.rating.toFixed(1)}★`}
          </p>
          <p className="text-sm text-(--color-ink-muted)">
            {snapshot.reviewCount === undefined
              ? 'No review count published'
              : plural(snapshot.reviewCount, 'review')}
          </p>
          {snapshot.mostRecentReviewAt && (
            <p className="mt-2 text-xs text-(--color-ink-muted)">
              Most recent {formatRelativeDate(snapshot.mostRecentReviewAt)}
              {snapshot.reviewsInLast90Days !== undefined &&
                ` · ${snapshot.reviewsInLast90Days} in the last 90 days`}
            </p>
          )}
          {snapshot.ownerResponseRate !== undefined && (
            <p className="mt-1 text-xs text-(--color-ink-muted)">
              You have replied to {Math.round(snapshot.ownerResponseRate * 100)}% of them
            </p>
          )}
        </>
      )}
    </div>
  );
}

export function ReviewsPanel({
  reviews,
  themes,
}: {
  reviews: ReviewSnapshot[];
  themes?: ReviewThemes;
}) {
  return (
    <Card className="p-5 sm:p-6">
      <SectionHeading
        title="What families are saying"
        blurb="Your ratings, and the themes we found in the review text itself."
        aside={
          themes?.overallSentiment && (
            <span
              className={`rounded-lg px-3 py-2 text-sm font-semibold whitespace-nowrap ${
                INDICATOR_SOFT_BG[SENTIMENT_INDICATOR[themes.overallSentiment]]
              } ${INDICATOR_TEXT[SENTIMENT_INDICATOR[themes.overallSentiment]]}`}
            >
              Overall: {SENTIMENT_LABEL[themes.overallSentiment].toLowerCase()}
            </span>
          )
        }
      />

      {reviews.length > 0 ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {reviews.map((snapshot) => (
            <SnapshotCard key={snapshot.source} snapshot={snapshot} />
          ))}
        </div>
      ) : (
        <div className="mt-4">
          <EmptyNote>We could not read reviews from any source this time.</EmptyNote>
        </div>
      )}

      {themes && themes.topics.length > 0 && (
        <div className="mt-6">
          <h3 className="text-sm font-semibold text-(--color-ink)">
            What comes up most in your reviews
          </h3>
          <ul className="mt-3 space-y-3">
            {themes.topics.map((topic) => (
              <li key={topic.label} className="border-t border-(--color-line) pt-3 first:border-t-0 first:pt-0">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <p className="font-medium text-(--color-ink)">{topic.label}</p>
                  <span
                    className={`text-xs font-semibold ${
                      INDICATOR_TEXT[SENTIMENT_INDICATOR[topic.sentiment]]
                    }`}
                  >
                    {SENTIMENT_LABEL[topic.sentiment]}
                  </span>
                  <span className="text-xs text-(--color-ink-muted)">
                    {plural(topic.mentions, 'mention')}
                  </span>
                </div>
                {topic.exampleQuote && (
                  <blockquote className="mt-1.5 border-l-2 border-(--color-line) pl-3 text-sm text-(--color-ink-muted) italic">
                    “{topic.exampleQuote}”
                  </blockquote>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {themes && themes.keywords.length > 0 && (
        <div className="mt-6">
          <h3 className="text-sm font-semibold text-(--color-ink)">
            Words families use about you
          </h3>
          <p className="mt-1 text-sm text-(--color-ink-muted)">
            These are worth working into your website copy — they are the words families
            already reach for.
          </p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {themes.keywords.map((keyword) => (
              <li key={keyword.phrase}>
                <Badge>
                  {keyword.phrase}
                  <span className="ml-1.5 opacity-70 tabular-nums">{keyword.mentions}</span>
                </Badge>
              </li>
            ))}
          </ul>
        </div>
      )}

      {themes && themes.topics.length === 0 && reviews.length > 0 && (
        <UnverifiableNote>
          Google shares only a handful of review texts with outside tools, and there were not
          enough of them to pull out reliable themes.
        </UnverifiableNote>
      )}
    </Card>
  );
}
