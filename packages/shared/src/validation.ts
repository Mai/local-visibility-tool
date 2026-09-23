/**
 * Input validation shared by the input screen and the API, so the operator sees
 * the same message in both places.
 */

export interface ValidationResult<T> {
  ok: boolean;
  value?: T;
  /** Operator-facing message; already plain language. */
  message?: string;
}

/**
 * Accepts what an operator would realistically type ("mycommunity.com",
 * "www.mycommunity.com/", "https://mycommunity.com") and returns a normalized
 * absolute URL. Does not check reachability — the API does that.
 */
export function normalizeWebsiteUrl(input: string): ValidationResult<string> {
  const trimmed = input.trim();
  if (!trimmed) {
    return { ok: false, message: 'Please enter your website address.' };
  }

  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  let parsed: URL;
  try {
    parsed = new URL(withScheme);
  } catch {
    return { ok: false, message: "That doesn't look like a website address. Example: yourcommunity.com" };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, message: 'Please enter a web address starting with http:// or https://' };
  }

  const hostname = parsed.hostname.toLowerCase();
  const hasValidDomain = /^(?!-)[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/.test(hostname);
  if (!hasValidDomain) {
    return { ok: false, message: "That doesn't look like a website address. Example: yourcommunity.com" };
  }

  parsed.hash = '';
  parsed.hostname = hostname;
  return { ok: true, value: parsed.toString() };
}

/** US 5-digit zip codes only; accepts ZIP+4 input and keeps the first five. */
export function normalizeZipCode(input: string): ValidationResult<string> {
  const trimmed = input.trim();
  if (!trimmed) {
    return { ok: false, message: 'Please enter your zip code.' };
  }

  const match = /^(\d{5})(?:-\d{4})?$/.exec(trimmed);
  if (!match) {
    return { ok: false, message: 'Please enter a 5-digit US zip code. Example: 30309' };
  }

  return { ok: true, value: match[1]! };
}

/** Digits-only phone comparison, so (404) 555-0100 matches 404-555-0100. */
export function normalizePhone(phone: string | undefined): string | undefined {
  if (!phone) return undefined;
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) return digits.slice(1);
  return digits.length ? digits : undefined;
}

/**
 * Normalizes a street address for exact-match NAP comparison: lowercase, common
 * abbreviations expanded, punctuation and extra whitespace removed.
 */
export function normalizeAddress(address: string | undefined): string | undefined {
  if (!address) return undefined;
  const expansions: Array<[RegExp, string]> = [
    [/\bst\b\.?/g, 'street'],
    [/\bstr\b\.?/g, 'street'],
    [/\bave\b\.?/g, 'avenue'],
    [/\bav\b\.?/g, 'avenue'],
    [/\brd\b\.?/g, 'road'],
    [/\bblvd\b\.?/g, 'boulevard'],
    [/\bdr\b\.?/g, 'drive'],
    [/\bln\b\.?/g, 'lane'],
    [/\bct\b\.?/g, 'court'],
    [/\bpkwy\b\.?/g, 'parkway'],
    [/\bhwy\b\.?/g, 'highway'],
    [/\bste\b\.?/g, 'suite'],
    [/\bapt\b\.?/g, 'apartment'],
    [/\bn\b\.?/g, 'north'],
    [/\bs\b\.?/g, 'south'],
    [/\be\b\.?/g, 'east'],
    [/\bw\b\.?/g, 'west'],
  ];

  let normalized = address.toLowerCase().replace(/[.,#]/g, ' ');
  for (const [pattern, replacement] of expansions) {
    normalized = normalized.replace(pattern, replacement);
  }
  normalized = normalized.replace(/\s+/g, ' ').trim();
  return normalized.length ? normalized : undefined;
}

/**
 * Business-name comparison that ignores legal suffixes and punctuation, since
 * directories routinely drop "LLC" or an ampersand.
 */
export function normalizeBusinessName(name: string | undefined): string | undefined {
  if (!name) return undefined;
  const normalized = name
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/&/g, 'and')
    .replace(/\b(llc|l\.l\.c|inc|incorporated|corp|corporation|ltd|lp|llp)\b\.?/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return normalized.length ? normalized : undefined;
}
