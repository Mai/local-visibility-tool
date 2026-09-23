'use client';

/**
 * The chart itself. Loaded client-only by `ComparisonChart`, because Recharts measures
 * the DOM to size itself and has nothing to measure on the server.
 *
 * `aria-hidden` is set by the wrapper: the table beside it carries the same numbers in a
 * form a screen reader can actually read, so announcing the chart twice would be noise.
 */

import { Bar, BarChart, Cell, LabelList, ResponsiveContainer, XAxis, YAxis } from 'recharts';

import type { ComparisonBar } from './ComparisonChart';

/** Axis labels have to fit a phone; the table carries the full names. */
function shorten(label: string): string {
  return label.length <= 18 ? label : `${label.slice(0, 17)}…`;
}

export default function ComparisonChartImpl({ bars }: { bars: ComparisonBar[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={bars} layout="vertical" margin={{ top: 4, right: 44, bottom: 4, left: 0 }}>
        <XAxis type="number" domain={[0, 100]} hide />
        <YAxis
          type="category"
          dataKey="label"
          width={132}
          tickLine={false}
          axisLine={false}
          tickFormatter={shorten}
          tick={{ fontSize: 12, fill: 'var(--color-ink-muted)' }}
        />
        <Bar dataKey="score" radius={[0, 4, 4, 0]} barSize={18} isAnimationActive={false}>
          {bars.map((bar) => (
            <Cell
              key={bar.label}
              // The operator's own bar in the brand colour, everyone else in grey:
              // "where am I" is answered before a single label is read.
              fill={bar.isTarget ? 'var(--color-brand)' : 'var(--color-line)'}
            />
          ))}
          <LabelList
            dataKey="score"
            position="right"
            style={{ fontSize: 12, fill: 'var(--color-ink-muted)' }}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
