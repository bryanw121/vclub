import React, { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, ScrollView, Switch, Text, View } from 'react-native'
import { useStackBackTitle } from '../../../../hooks/useStackBackTitle'
import { supabase } from '../../../../lib/supabase'
import { Sentry } from '../../../../lib/sentry'
import { shared, theme } from '../../../../constants'
import { NOTIFICATION_TYPE_LABELS } from '../../../../constants/notifications'
import {
  defaultNotificationPrefs,
  listNotificationPrefsResolved,
  patchNotificationPrefs,
} from '../../../../utils/notificationPrefs'
import type { NotificationPrefs, NotificationType } from '../../../../types'

export default function NotificationSettingsScreen() {
  useStackBackTitle('Notification settings')
  const [prefs, setPrefs] = useState<NotificationPrefs>(defaultNotificationPrefs())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setLoading(false)
        return
      }
      const { data, error: qErr } = await supabase
        .from('profiles')
        .select('notification_prefs')
        .eq('id', user.id)
        .single()
      if (qErr) throw qErr
      const row = data as { notification_prefs?: NotificationPrefs | null }
      const raw = row.notification_prefs
      setPrefs({
        in_app: { ...raw?.in_app },
        push: { ...raw?.push },
      })
    } catch (e: any) {
      Sentry.captureException(e)
      setError('Could not load notification settings. Please try again.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const persist = useCallback(
    async (next: NotificationPrefs) => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setSaving(true)
      setError(null)
      try {
        const { error: uErr } = await supabase
          .from('profiles')
          .update({ notification_prefs: next })
          .eq('id', user.id)
        if (uErr) throw uErr
        setPrefs(next)
      } catch (e: any) {
        Sentry.captureException(e)
        setError('Could not save settings. Please try again.')
      } finally {
        setSaving(false)
      }
    },
    [],
  )

  const toggle = useCallback(
    (channel: keyof NotificationPrefs, type: NotificationType, enabled: boolean) => {
      const next = patchNotificationPrefs(prefs, channel, type, enabled)
      setPrefs(next)
      void persist(next)
    },
    [persist, prefs],
  )

  const rows = listNotificationPrefsResolved(prefs)

  return (
    <View style={shared.screen}>
      <ScrollView contentContainerStyle={shared.scrollContentSubpage}>
        {loading ? (
          <ActivityIndicator color={theme.colors.primary} style={{ marginTop: theme.spacing.lg }} />
        ) : (
          <>
            <Text style={[shared.caption, { marginBottom: theme.spacing.md }]}>
              Choose which updates you want. In-app notifications always appear in your inbox when enabled. Push delivery will use the same choices when it is available.
            </Text>
            {error ? <Text style={shared.errorText}>{error}</Text> : null}
            <View style={shared.card}>
              <Text style={[shared.label, { marginBottom: theme.spacing.sm }]}>In-app</Text>
              {rows.map(({ type, in_app }) => (
                <Row
                  key={`in_app_${type}`}
                  label={NOTIFICATION_TYPE_LABELS[type]}
                  value={in_app}
                  disabled={saving}
                  onValueChange={v => toggle('in_app', type, v)}
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
                  disabled={saving}
                  subtitle="Saved for when push is enabled"
                  onValueChange={v => toggle('push', type, v)}
                />
              ))}
            </View>
          </>
        )}
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
