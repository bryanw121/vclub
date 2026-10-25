/** User-facing copy shared across screens. */

/** Alert body for a failed write when there is nothing more specific to say. */
export const GENERIC_ERROR_MESSAGE = 'Something went wrong. Please try again.'

/** Shown when a join raced the last spot and the database saved it as waitlisted. */
export const EVENT_JUST_FILLED_TITLE = 'Event just filled up'
export const EVENT_JUST_FILLED_BODY =
  "The last spot was taken a moment before you. You're on the waitlist and will be notified if you get in."

/** Alert body for a failed write that is almost certainly a connectivity problem. */
export const NETWORK_ERROR_MESSAGE = 'Check your connection and try again.'

/** Display label per skill tier, lowest to highest (insertion order is the display order). `open` is tournament-only. */
export const SKILL_LEVEL_LABELS: Record<string, string> = {
  d: 'D', c: 'C', b: 'B', bb: 'BB', a: 'A', aa_plus: 'AA+', open: 'Open',
}
