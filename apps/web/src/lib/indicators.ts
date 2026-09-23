/**
 * The traffic lights, as Tailwind classes.
 *
 * The PRD's audience is a senior living operator, not a marketer, so every colour
 * carries a written label beside it — colour alone is not a message, and for anyone
 * with a colour vision deficiency it is not a message at all. Those labels, and the
 * `Indicator` type itself, live in `@sensi/shared` so the PDF says the same things;
 * what stays here is the painting, which is framework-specific.
 */

export type { Indicator } from '@sensi/shared';
export {
  CHECK_STATUS_INDICATOR,
  CHECK_STATUS_LABEL,
  INDICATOR_LABEL,
  SENTIMENT_INDICATOR,
  SENTIMENT_LABEL,
  STANDING_INDICATOR,
  STANDING_LABEL,
} from '@sensi/shared';

import type { Indicator } from '@sensi/shared';

/**
 * Tailwind classes are written out per indicator rather than composed at runtime.
 * Tailwind only ships the classes it can see in the source, so a template string
 * built from a variable would compile to nothing.
 */
export const INDICATOR_TEXT: Record<Indicator, string> = {
  green: 'text-(--color-pass)',
  yellow: 'text-(--color-warn)',
  orange: 'text-(--color-attention)',
  red: 'text-(--color-fail)',
  grey: 'text-(--color-ink-muted)',
};

export const INDICATOR_SOFT_BG: Record<Indicator, string> = {
  green: 'bg-(--color-pass-soft)',
  yellow: 'bg-(--color-warn-soft)',
  orange: 'bg-(--color-attention-soft)',
  red: 'bg-(--color-fail-soft)',
  grey: 'bg-(--color-surface-sunken)',
};

export const INDICATOR_BAR: Record<Indicator, string> = {
  green: 'bg-(--color-pass)',
  yellow: 'bg-(--color-warn)',
  orange: 'bg-(--color-attention)',
  red: 'bg-(--color-fail)',
  grey: 'bg-(--color-line)',
};

export const INDICATOR_RING: Record<Indicator, string> = {
  green: 'border-(--color-pass)',
  yellow: 'border-(--color-warn)',
  orange: 'border-(--color-attention)',
  red: 'border-(--color-fail)',
  grey: 'border-(--color-line)',
};

/** Stroke colours for the score dial, which is SVG rather than a div. */
export const INDICATOR_STROKE: Record<Indicator, string> = {
  green: 'var(--color-pass)',
  yellow: 'var(--color-warn)',
  orange: 'var(--color-attention)',
  red: 'var(--color-fail)',
  grey: 'var(--color-ink-muted)',
};

