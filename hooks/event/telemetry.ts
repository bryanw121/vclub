import { Sentry } from '../../lib/sentry'

/** Sentry helpers for event-detail actions: every report carries the event and user. */

export function eventBreadcrumb(
  eventId: string,
  userId: string | null,
  message: string,
  extra?: Record<string, unknown>,
): void {
  Sentry.addBreadcrumb({ category: 'event', message, level: 'info', data: { userId, eventId, ...extra } })
}

export function reportEventError(
  eventId: string,
  userId: string | null,
  context: string,
  e: unknown,
  extra?: Record<string, unknown>,
): void {
  const message = (e as { message?: string } | null)?.message
  Sentry.captureException(e instanceof Error ? e : new Error(message ?? String(e)), {
    extra: { context, userId, eventId, ...extra },
  })
}
