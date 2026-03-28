import React, { useEffect, useState } from 'react'
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View } from 'react-native'
import { useStackBackTitle } from '../../../../hooks/useStackBackTitle'
import { supabase } from '../../../../lib/supabase'
import { EventCard } from '../../../../components/EventCard'
import { shared } from '../../../../constants'
import { theme } from '../../../../constants/theme'
import type { EventWithDetails } from '../../../../types'

type HistoryFilter = 'hosted' | 'attended'
const HISTORY_LIMIT = 5

export default function ProfileHistoryScreen() {
  useStackBackTitle()
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>('hosted')
  const [historyLoading, setHistoryLoading] = useState(true)
  const [historyError, setHistoryError] = useState<string | null>(null)
  const [pastHostedEvents, setPastHostedEvents] = useState<EventWithDetails[]>([])

  useEffect(() => {
    void fetchHostedHistory()
  }, [])

  async function fetchHostedHistory() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setHistoryLoading(false)
      return
    }
    const now = new Date().toISOString()
    const { data, error } = await supabase
      .from('events')
      .select(`*, profiles!events_created_by_fkey (id, username, avatar_url), event_attendees (event_id, user_id, joined_at)`)
      .eq('created_by', user.id)
      .lt('event_date', now)
      .order('event_date', { ascending: false })
      .limit(HISTORY_LIMIT + 1)

    if (error) setHistoryError(error.message)
    else setPastHostedEvents((data ?? []) as EventWithDetails[])
    setHistoryLoading(false)
  }

  const hostedVisible = pastHostedEvents.slice(0, HISTORY_LIMIT)
  const hostedOverflowCount = Math.max(0, pastHostedEvents.length - HISTORY_LIMIT)

  return (
    <View style={shared.screen}>
      <ScrollView contentContainerStyle={shared.scrollContentSubpage}>
        <View style={shared.card}>
          <Text style={shared.subheading}>History</Text>
          <View style={shared.mt_md} />

          <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
            <HistoryChip
              label="Hosted"
              active={historyFilter === 'hosted'}
              onPress={() => setHistoryFilter('hosted')}
            />
            <HistoryChip
              label="Attended"
              active={historyFilter === 'attended'}
              onPress={() => setHistoryFilter('attended')}
            />
          </View>

          <View style={shared.mt_md} />

          {historyFilter === 'hosted' ? (
            historyLoading ? (
              <ActivityIndicator />
            ) : historyError ? (
              <Text style={shared.errorText}>{historyError}</Text>
            ) : hostedVisible.length === 0 ? (
              <Text style={shared.caption}>No past hosted events found.</Text>
            ) : (
              <>
                {hostedVisible.map(event => <EventCard key={event.id} event={event} />)}
                {hostedOverflowCount > 0 && (
                  <Text style={shared.caption}>and {hostedOverflowCount} other events</Text>
                )}
              </>
            )
          ) : (
            <Text style={shared.caption}>Attended history coming soon.</Text>
          )}
        </View>
      </ScrollView>
    </View>
  )
}

function HistoryChip({
  label,
  active,
  onPress,
}: {
  label: string
  active: boolean
  onPress: () => void
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Show ${label.toLowerCase()} history`}
      style={{
        borderRadius: theme.radius.full,
        borderWidth: 1,
        borderColor: active ? theme.colors.primary : theme.colors.border,
        backgroundColor: active ? theme.colors.primary + '14' : theme.colors.card,
        paddingHorizontal: theme.spacing.md,
        paddingVertical: theme.spacing.sm,
      }}
    >
      <Text
        style={{
          fontSize: theme.font.size.md,
          lineHeight: theme.font.lineHeight.normal,
          fontWeight: active ? theme.font.weight.semibold : theme.font.weight.regular,
          color: active ? theme.colors.primary : theme.colors.text,
        }}
      >
        {label}
      </Text>
    </TouchableOpacity>
  )
}
