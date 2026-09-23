/**
 * A very small HTML builder for the PDF report.
 *
 * Almost every string in the report comes from somewhere we do not control — the
 * community's own website title, a competitor's name from Google, a review quote, a
 * directory URL. Escaping those by hand means writing `escapeHtml(...)` correctly forty
 * times in a row, and the one time it is forgotten a stray `<` silently eats the rest of
 * the document. So interpolation escapes by default and anything already-built HTML has
 * to say so with `raw()`. Forgetting `raw()` is visible immediately; forgetting to escape
 * would not be.
 */

/** Pre-rendered markup. The only thing `html` will interpolate without escaping. */
export class Html {
  constructor(readonly value: string) {}
  toString(): string {
    return this.value;
  }
}

export type HtmlValue = Html | string | number | null | undefined | false | HtmlValue[];

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ESCAPES[char] ?? char);
}

/** Trusts `value` verbatim. Only for markup this module produced. */
export function raw(value: string): Html {
  return new Html(value);
}

function render(value: HtmlValue): string {
  /*
   * `false` and nullish render to nothing so `condition && html`…`` reads like JSX — and
   * it inherits JSX's trap with it. A guard of `items.length && html`…`` renders a bare
   * "0" when the list is empty, because 0 is a number and numbers are content here. Guards
   * are written `length > 0` for that reason; do not "fix" it by swallowing zero, or every
   * genuine count of nothing disappears from the report.
   */
  if (value === null || value === undefined || value === false) return '';
  if (value instanceof Html) return value.value;
  if (Array.isArray(value)) return value.map(render).join('');
  return escapeHtml(String(value));
}

export function html(strings: TemplateStringsArray, ...values: HtmlValue[]): Html {
  let out = strings[0] ?? '';
  for (let index = 0; index < values.length; index += 1) {
    out += render(values[index]) + (strings[index + 1] ?? '');
  }
  return new Html(out);
}

/**
 * A link target we are willing to put in a document, or nothing.
 *
 * The URLs in the report come from third-party listings, and a `javascript:` href does
 * not belong in a file an operator will email to their owner. Anything that is not plain
 * web or contact scheme is dropped, and the caller renders the text without a link.
 */
const SAFE_SCHEMES = new Set(['http:', 'https:', 'mailto:', 'tel:']);

export function safeHref(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    return SAFE_SCHEMES.has(parsed.protocol) ? parsed.toString() : undefined;
  } catch {
    return undefined;
  }
}

/** Joins the parts of a one-line summary, dropping the ones we do not have. */
export function sentenceList(parts: Array<string | undefined | false>, separator = ' · '): string {
  return parts.filter((part): part is string => Boolean(part)).join(separator);
}
