import { NOTIFICATION_TYPES, type NotificationPrefs, type NotificationType } from '../types'

/** Merged view: explicit false in stored prefs turns a type off; missing keys count as enabled. */
export function isNotificationTypeEnabled(
  prefs: NotificationPrefs | null | undefined,
  channel: keyof NotificationPrefs,
  type: NotificationType,
): boolean {
  const v = prefs?.[channel]?.[type]
  if (v === false) return false
  return true
}

export function defaultNotificationPrefs(): NotificationPrefs {
  return { in_app: {}, push: {} }
}

/** Deep-merge so missing types stay omitted (server treats as true). */
export function patchNotificationPrefs(
  current: NotificationPrefs | null | undefined,
  channel: keyof NotificationPrefs,
  type: NotificationType,
  enabled: boolean,
): NotificationPrefs {
  const base: NotificationPrefs = {
    in_app: { ...current?.in_app },
    push: { ...current?.push },
  }
  const slice = { ...base[channel] }
  if (enabled) {
    delete slice[type]
  } else {
    slice[type] = false
  }
  return { ...base, [channel]: slice }
}

/** All types with resolved enabled flag for settings UI. */
export function listNotificationPrefsResolved(prefs: NotificationPrefs | null | undefined): {
  type: NotificationType
  in_app: boolean
  push: boolean
}[] {
  return NOTIFICATION_TYPES.map(type => ({
    type,
    in_app: isNotificationTypeEnabled(prefs, 'in_app', type),
    push: isNotificationTypeEnabled(prefs, 'push', type),
  }))
}
