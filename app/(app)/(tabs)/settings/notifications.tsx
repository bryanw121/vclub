import React, { useMemo, useRef, useState } from 'react'
import { RefreshControl, ScrollView, Switch, Text, View } from 'react-native'
import { useStackBackTitle } from '../../../../hooks/useStackBackTitle'
import { useMyProfile } from '../../../../hooks/useMyProfile'
import { ScreenState } from '../../../../components/ui'
import { shared, theme } from '../../../../constants'
import { NOTIFICATION_TYPE_LABELS } from '../../../../constants/notifications'
import {
  listNotificationPrefsResolved,
  patchNotificationPrefs,
} from '../../../../utils/notificationPrefs'
import type { NotificationPrefs, NotificationType } from '../../../../types'

export default function NotificationSettingsScreen() {
  useStackBackTitle('Notification settings')
  const me = useMyProfile()
  const [saveFailed, setSaveFailed] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  const raw = me.profile?.notification_prefs
  const prefs = useMemo<NotificationPrefs>(() => ({ in_app: { ...raw?.in_app }, push: { ...raw?.push } }), [raw])

  // Optimistic: the cached profile updates at once and rolls back if the write fails.
  // Each toggle sends the whole prefs object, and `updateProfile` queues a call
  // made while a save is in flight, so the latest toggle's prefs win. Only the
  // latest toggle's outcome is shown: an older failure is superseded by it.
  const toggleSeq = useRef(0)
  async function toggle(channel: keyof NotificationPrefs, type: NotificationType, enabled: boolean) {
    const seq = ++toggleSeq.current
    setSaveFailed(false)
    const saved = await me.updateProfile({ notification_prefs: patchNotificationPrefs(prefs, channel, type, enabled) })
    if (seq === toggleSeq.current) setSaveFailed(!saved)
  }

  const rows = listNotificationPrefsResolved(prefs)

  async function handleRefresh() {
    setRefreshing(true)
    try {
      await me.refetch({ force: true })
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <View style={shared.screen}>
      <ScrollView
        contentContainerStyle={shared.scrollContentSubpage}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void handleRefresh()} tintColor={theme.colors.primary} />
        }
      >
        <ScreenState
          loading={me.isLoading}
          ready={!!me.profile}
          error={me.error ? 'Could not load notification settings. Please try again.' : null}
          onRetry={() => void me.refetch({ force: true })}
        >
          <>
            <Text style={[shared.caption, { marginBottom: theme.spacing.md }]}>
              Choose which updates you want. In-app notifications always appear in your inbox when enabled. Push delivery will use the same choices when it is available.
            </Text>
            {saveFailed ? <Text style={shared.errorText}>Could not save settings. Please try again.</Text> : null}
            <View style={shared.card}>
              <Text style={[shared.label, { marginBottom: theme.spacing.sm }]}>In-app</Text>
              {rows.map(({ type, in_app }) => (
                <Row
                  key={`in_app_${type}`}
                  label={NOTIFICATION_TYPE_LABELS[type]}
                  value={in_app}
                  onValueChange={v => void toggle('in_app', type, v)}
                />
              ))}
            </View>
            <View style={[shared.card, { marginTop: theme.spacing.md }]}>
              <Text style={[shared.label, { marginBottom: theme.spacing.sm }]}>Push (coming soon)</Text>
              {rows.map(({ type, push }) => (
                <Row
                  key={`push_${type}`}
                  label={NOTIFICATION_TYPE_LABELS[type]}
                  value={push}
                  subtitle="Saved for when push is enabled"
                  onValueChange={v => void toggle('push', type, v)}
                />
              ))}
            </View>
          </>
        </ScreenState>
      </ScrollView>
    </View>
  )
}

type RowProps = {
  label: string
  subtitle?: string
  value: boolean
  disabled?: boolean
  onValueChange: (v: boolean) => void
}

function Row({ label, subtitle, value, disabled, onValueChange }: RowProps) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: theme.spacing.sm,
        gap: theme.spacing.md,
      }}
    >
      <View style={{ flex: 1 }}>
        <Text style={shared.body}>{label}</Text>
        {subtitle ? <Text style={[shared.caption, { marginTop: 2 }]}>{subtitle}</Text> : null}
      </View>
      <Switch
        value={value}
        disabled={disabled}
        onValueChange={onValueChange}
        trackColor={{ false: theme.colors.border, true: theme.colors.primary + '88' }}
        thumbColor={value ? theme.colors.primary : theme.colors.card}
      />
    </View>
  )
}
