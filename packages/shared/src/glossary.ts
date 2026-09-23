/**
 * Plain-English definitions, used for UI tooltips and the PDF glossary page.
 * Any technical term that reaches the operator must have an entry here.
 */

export interface GlossaryEntry {
  term: string;
  definition: string;
}

export const GLOSSARY: readonly GlossaryEntry[] = [
  {
    term: 'GBP (Google Business Profile)',
    definition: 'Your free business listing on Google Maps and Google Search.',
  },
  {
    term: 'NAP Consistency',
    definition:
      'Whether your name, address, and phone number are identical across all listings online.',
  },
  {
    term: 'Local Citations',
    definition:
      'Any place your business name and address appear online (directories, review sites).',
  },
  {
    term: 'Schema Markup',
    definition:
      'Hidden code on your website that helps Google understand what your business does.',
  },
  {
    term: 'Core Web Vitals',
    definition: "Google's measure of how fast and smooth your website loads.",
  },
  {
    term: 'GEO',
    definition:
      'How well your website is positioned to appear in AI-generated answers (ChatGPT, Perplexity, Google AI Overviews).',
  },
  {
    term: 'AI Overview',
    definition: 'The AI-written summary Google sometimes shows at the top of search results.',
  },
  {
    term: 'Geo Signals',
    definition:
      "Words and information on your website that tell search engines where you're located.",
  },
];

export const GLOSSARY_BY_TERM: Record<string, string> = Object.fromEntries(
  GLOSSARY.map((entry) => [entry.term, entry.definition]),
);
