import React, { useEffect, useState } from 'react'
import { ScrollView, Text, View } from 'react-native'
import { useStackBackTitle } from '../../../../hooks/useStackBackTitle'
import { supabase } from '../../../../lib/supabase'
import { EventCard } from '../../../../components/EventCard'
import { shared } from '../../../../constants'
import type { EventWithDetails } from '../../../../types'

export default function ProfileHostedEventsScreen() {
  useStackBackTitle('Hosted events')
  const [events, setEvents] = useState<EventWithDetails[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    void load()
  }, [])

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setLoading(false)
      return
    }
    const now = new Date().toISOString()
    const { data, error } = await supabase
      .from('events')
      .select(`*, profiles!events_created_by_fkey (id, username, avatar_url), event_attendees (event_id, user_id, joined_at)`)
      .eq('created_by', user.id)
      .gte('event_date', now)
      .order('event_date', { ascending: true })

    if (!error) setEvents((data ?? []) as EventWithDetails[])
    setLoading(false)
  }

  if (loading) return null

  return (
    <View style={shared.screen}>
      <ScrollView contentContainerStyle={shared.scrollContentSubpage}>
        <View style={shared.card}>
          {events.length === 0 ? (
            <Text style={shared.caption}>No upcoming hosted events.</Text>
          ) : (
            events.map(event => <EventCard key={event.id} event={event} />)
          )}
        </View>
      </ScrollView>
    </View>
  )
}
