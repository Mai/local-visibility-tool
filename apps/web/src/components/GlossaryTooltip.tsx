'use client';

/**
 * A term with its plain-English definition one tap away (PRD 6.4).
 *
 * It is a real `<button>` rather than a hover-only `title`, because half the audience
 * reads this on a phone and hover does not exist there. Click toggles, focus opens,
 * Escape closes, and the definition is wired to the button with `aria-describedby` so
 * a screen reader announces it instead of announcing a bare word.
 */

import { useEffect, useId, useRef, useState } from 'react';

import { GLOSSARY_BY_TERM } from '@sensi/shared';

export interface GlossaryTooltipProps {
  /** The glossary term, when the definition should come from the shared glossary. */
  term?: string;
  /** An explicit definition, for one-off explanations that are not glossary entries. */
  definition?: string;
  /** Visible text, when it differs from the term. */
  children?: React.ReactNode;
}

export function GlossaryTooltip({ term, definition, children }: GlossaryTooltipProps) {
  const id = useId();
  /**
   * Hovering and tapping are tracked separately on purpose.
   *
   * A single `open` flag toggled by click *and* set by hover fights itself: the mouse
   * arrives, hover opens the tooltip, and the click the user came to make closes it
   * again. So pointing at it opens it, and clicking pins it open until clicked again,
   * dismissed with Escape, or clicked away from.
   */
  const [pinned, setPinned] = useState(false);
  const [hovered, setHovered] = useState(false);
  const container = useRef<HTMLSpanElement>(null);

  const open = pinned || hovered;
  const text = definition ?? (term ? GLOSSARY_BY_TERM[term] : undefined);

  useEffect(() => {
    if (!pinned) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setPinned(false);
      setHovered(false);
    };
    const onPointerDown = (event: PointerEvent) => {
      if (!container.current?.contains(event.target as Node)) setPinned(false);
    };

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [pinned]);

  // A term with no definition is a content bug; render the words rather than a
  // control that explains nothing. The hooks above run either way, as they must.
  if (!text) return <>{children ?? term}</>;

  return (
    <span className="relative inline-block" ref={container}>
      <button
        type="button"
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        onClick={() => setPinned((current) => !current)}
        onFocus={() => setHovered(true)}
        onBlur={() => setHovered(false)}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className="cursor-help rounded-sm underline decoration-dotted decoration-from-font underline-offset-2 focus:outline-2 focus:outline-offset-2 focus:outline-(--color-brand)"
      >
        {children ?? term}
        <span className="sr-only"> — what this means</span>
      </button>
      {open && (
        <span
          id={id}
          role="tooltip"
          // Left-anchored and width-capped: an anchored-to-centre tooltip on a
          // 360px screen ends up half off the edge.
          className="absolute top-full left-0 z-20 mt-2 block w-64 max-w-[min(16rem,calc(100vw-2rem))] rounded-lg border border-(--color-line) bg-(--color-surface) p-3 text-left text-sm leading-snug font-normal text-(--color-ink) shadow-lg"
        >
          {term && <span className="mb-1 block font-semibold">{term}</span>}
          {text}
        </span>
      )}
    </span>
  );
}
