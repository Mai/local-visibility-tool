'use client';

/**
 * The comparison chart (PRD 6.3), as a sized box the real chart drops into.
 *
 * Recharts is loaded client-only and out of the server bundle. The box keeps its height
 * either way, so the page does not jump when the chart arrives, and the chart is marked
 * `aria-hidden` because the table below it carries the identical numbers in a form a
 * screen reader can read.
 */

import dynamic from 'next/dynamic';

export interface ComparisonBar {
  label: string;
  score: number;
  isTarget: boolean;
}

const ComparisonChartImpl = dynamic(() => import('./ComparisonChartImpl'), { ssr: false });

export function ComparisonChart({ bars }: { bars: ComparisonBar[] }) {
  const height = Math.max(160, bars.length * 44);

  return (
    <div style={{ height }} aria-hidden>
      <ComparisonChartImpl bars={bars} />
    </div>
  );
}
