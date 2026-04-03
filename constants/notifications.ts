import type { NotificationType } from '../types'

/** User-facing labels for notification preferences (and optional inbox grouping). */
export const NOTIFICATION_TYPE_LABELS: Record<NotificationType, string> = {
  event_announcement: 'Event announcements',
  kudos_received: 'Kudos',
  event_material_change: 'Event updates',
  waitlist_promoted: 'Waitlist',
  event_cancelled: 'Cancellations',
}
