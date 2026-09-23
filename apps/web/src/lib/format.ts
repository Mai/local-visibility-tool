/**
 * Text helpers, re-exported from `@sensi/shared`.
 *
 * These used to live here, which meant the PDF renderer in the API could not reach them
 * and would have needed its own copy of every label. They now have one home; this file
 * stays so components can keep importing from `@/lib/format`, and so anything genuinely
 * screen-only has somewhere obvious to go.
 */

export {
  domainOf,
  EFFORT_LABEL,
  EFFORT_LEVELS,
  EFFORT_TIME_ESTIMATE,
  formatDate,
  formatPoints,
  formatRelativeDate,
  GROUP_BLURB,
  GROUP_ORDER,
  GROUP_TITLE,
  IMPACT_LABEL,
  plural,
} from '@sensi/shared';
