/**
 * AI search visibility (PRD 4.7, 6.3).
 *
 * These are the searches a family types, and where the community placed in them. That
 * placement is the honest proxy for whether an assistant will name you: AI assistants
 * read these results before they answer.
 *
 * Where Google's AI Overview is concerned the panel says "not shared" and means it.
 * Google's robots.txt disallows `/search` and we respect robots.txt, so we do not have
 * that answer and will not imply we do.
 */

import type { AiSearchQuery } from '@sensi/shared';

import { GlossaryTooltip } from './GlossaryTooltip';
import { Card, EmptyNote, IndicatorPill, SectionHeading } from './ui';

function rankStatus(search: AiSearchQuery) {
  if (search.unavailableReason) return { indicator: 'grey' as const, label: 'Couldn’t check' };
  if (search.websiteRank !== undefined && search.websiteRank <= 3) {
    return { indicator: 'green' as const, label: `Your site is #${search.websiteRank}` };
  }
  if (search.websiteRank !== undefined) {
    return { indicator: 'yellow' as const, label: `Your site is #${search.websiteRank}` };
  }
  if (search.mentionRank !== undefined) {
    return { indicator: 'orange' as const, label: `Mentioned at #${search.mentionRank}` };
  }
  return { indicator: 'red' as const, label: 'Not on page one' };
}

const ANSWER_NOTE: Record<NonNullable<AiSearchQuery['generatedAnswer']>, string> = {
  mentions_you: 'The AI-written answer on this search named your community.',
  no_mention: 'An AI-written answer appeared on this search and did not name you.',
  not_shared:
    'Google does not let tools read its AI Overview, and we do not scrape search pages, so we cannot tell you whether one named you here.',
};

function SearchRow({ search }: { search: AiSearchQuery }) {
  const status = rankStatus(search);

  return (
    <li className="border-t border-(--color-line) py-3 first:border-t-0">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1.5">
        <p className="min-w-0 font-medium text-(--color-ink)">“{search.query}”</p>
        <IndicatorPill indicator={status.indicator} label={status.label} />
      </div>

      {search.unavailableReason && (
        <p className="mt-1.5 text-sm text-(--color-ink-muted)">{search.unavailableReason}</p>
      )}

      {search.aheadOfYou && search.aheadOfYou.length > 0 && (
        <p className="mt-1.5 text-sm text-(--color-ink-muted)">
          Ranking above you: {search.aheadOfYou.join(', ')}.
        </p>
      )}

      {search.generatedAnswer && (
        <p className="mt-1.5 text-sm text-(--color-ink-muted)">
          {ANSWER_NOTE[search.generatedAnswer]}
        </p>
      )}

      {search.peopleAlsoAsk && search.peopleAlsoAsk.length > 0 && (
        <div className="mt-2">
          <p className="text-sm font-medium text-(--color-ink)">
            Questions families also ask here
          </p>
          <p className="mt-0.5 text-sm text-(--color-ink-muted)">
            Answering these on your own site, in full sentences, is what gets you quoted.
          </p>
          <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-sm text-(--color-ink)">
            {search.peopleAlsoAsk.map((question) => (
              <li key={question}>{question}</li>
            ))}
          </ul>
        </div>
      )}
    </li>
  );
}

export function AiVisibilityPanel({ searches }: { searches?: AiSearchQuery[] }) {
  return (
    <Card className="p-5 sm:p-6">
      <SectionHeading
        title={
          <>
            Whether AI assistants can find you (
            <GlossaryTooltip term="GEO">GEO</GlossaryTooltip>)
          </>
        }
        blurb="The searches a family would actually type, and where you placed. AI assistants read these results before they answer."
      />

      {searches && searches.length > 0 ? (
        <ul className="mt-4">
          {searches.map((search) => (
            <SearchRow key={search.query} search={search} />
          ))}
        </ul>
      ) : (
        <div className="mt-4">
          <EmptyNote>We could not run these searches this time.</EmptyNote>
        </div>
      )}
    </Card>
  );
}
