import type { NotificationType } from '../types'

/** User-facing labels for notification preferences (and optional inbox grouping). */
export const NOTIFICATION_TYPE_LABELS: Record<NotificationType, string> = {
  event_announcement: 'Event announcements',
  cheers_received: 'Cheers',
  event_material_change: 'Event updates',
  waitlist_promoted: 'Waitlist',
  event_cancelled: 'Cancellations',
  badge_earned: 'Badge achievements',
  cohost_added: 'Co-host invites',
}
