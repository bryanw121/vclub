/**
 * Usage-metric event names (lib/analytics `track`). Rows land in the
 * `app_events` table; names must be short snake_case (the table checks it).
 * Props stay small: ids, a step index, a source.
 */
export const ANALYTICS_EVENTS = {
  /** A one-time banner appeared. props: { banner } */
  bannerShown: 'banner_shown',
  /** Its action link was tapped. props: { banner, action } */
  bannerAction: 'banner_action',
  /** Its close button was tapped. props: { banner } */
  bannerDismissed: 'banner_dismissed',
  /** props: { tour, source } */
  tourStarted: 'tour_started',
  /** A step was shown. props: { tour, step (0-based index), target } */
  tourStepViewed: 'tour_step_viewed',
  /** Done on the last step (or no further step could be shown). props: { tour, step } */
  tourCompleted: 'tour_completed',
  /** Skip / Esc. props: { tour, step, target } (the step it was on) */
  tourSkipped: 'tour_skipped',
} as const
