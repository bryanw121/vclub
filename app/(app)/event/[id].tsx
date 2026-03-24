import { useEffect, useState } from 'react'
import { View, Text, ScrollView, Alert, StyleSheet } from 'react-native'
import { useLocalSearchParams, useRouter, Stack } from 'expo-router'
import { supabase } from '../../../lib/supabase'
import { Button } from '../../../components/Button'
import { shared, theme, formatEventDate } from '../../../constants'
import { EventWithDetails, Profile } from '../../../types'

export default function EventDetail() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const [event, setEvent] = useState<EventWithDetails | null>(null)
  const [attendees, setAttendees] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [joining, setJoining] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)

  useEffect(() => {
    fetchEvent()
    supabase.auth.getUser().then(({ data: { user } }) => setUserId(user?.id ?? null))
  }, [])

  async function fetchEvent() {
    const { data, error } = await supabase
      .from('events')
      .select(`
        *,
        profiles!events_created_by_fkey (id, username, avatar_url),
        event_attendees (event_id, user_id, joined_at)
      `)
      .eq('id', id)
      .single()

    if (error) return
    setEvent(data as EventWithDetails)

    if (data.event_attendees?.length > 0) {
      const userIds = data.event_attendees.map((a: any) => a.user_id)
      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .in('id', userIds)
      if (profileData) setAttendees(profileData as Profile[])
    } else {
      setAttendees([])
    }

    setLoading(false)
  }

  async function handleJoin() {
    if (!userId) return
    try {
      setJoining(true)
      const { error } = await supabase
        .from('event_attendees')
        .insert({ event_id: id, user_id: userId })
      if (error) throw error
      fetchEvent()
    } catch (e: any) {
      Alert.alert('Error', e.message)
    } finally {
      setJoining(false)
    }
  }

  async function handleLeave() {
    if (!userId) return
    try {
      setJoining(true)
      const { error } = await supabase
        .from('event_attendees')
        .delete()
        .eq('event_id', id)
        .eq('user_id', userId)
      if (error) throw error
      fetchEvent()
    } catch (e: any) {
      Alert.alert('Error', e.message)
    } finally {
      setJoining(false)
    }
  }

  if (loading || !event) return null

  const isAttending = event.event_attendees?.some(a => a.user_id === userId)
  const isOwner = event.created_by === userId
  const attendeeCount = event.event_attendees?.length ?? 0
  const isFull = event.max_attendees ? attendeeCount >= event.max_attendees : false

  return (
    <>
      <Stack.Screen
        options={{
          title: event.title,
          headerShown: true,
          headerStyle: { backgroundColor: theme.colors.background },
          headerTintColor: theme.colors.primary,
          headerBackTitle: 'Events',
          gestureEnabled: true,
        }}
      />
      <ScrollView style={shared.screen} contentContainerStyle={shared.scrollContent}>
        <Text style={[shared.primaryText, shared.mb_xs]}>{formatEventDate(event.event_date, 'long')}</Text>
        {event.location && <Text style={[shared.caption, shared.mb_xs]}>{event.location}</Text>}
        {event.description && <Text style={[shared.body, shared.mb_lg]}>{event.description}</Text>}

        {!isOwner && (
          <View style={shared.mb_lg}>
            {isAttending
              ? <Button label="Leave event" onPress={handleLeave} loading={joining} variant="secondary" />
              : <Button label={isFull ? 'Event full' : 'Join event'} onPress={handleJoin} loading={joining} disabled={isFull} />
            }
          </View>
        )}

        <View style={shared.divider} />

        <Text style={[shared.subheading, shared.mb_sm]}>Host</Text>
        <View style={[shared.card, shared.mb_lg]}>
          <Text style={shared.body}>{event.profiles?.username}</Text>
        </View>

        <View style={shared.divider} />

        <View style={[shared.rowBetween, shared.mb_sm]}>
          <Text style={shared.subheading}>Going</Text>
          <Text style={shared.caption}>
            {attendeeCount}{event.max_attendees ? ` / ${event.max_attendees}` : ''} people
          </Text>
        </View>

        {attendees.length === 0 ? (
          <Text style={shared.caption}>no one yet — be the first!</Text>
        ) : (
          attendees.map(profile => (
            <View key={profile.id} style={[shared.card, styles.attendeeRow]}>
              <Text style={shared.body}>{profile.username}</Text>
            </View>
          ))
        )}
      </ScrollView>
    </>
  )
}

const styles = StyleSheet.create({
  attendeeRow: {
    marginBottom: theme.spacing.sm,
  },
})
