import { useEffect, useState } from 'react'
import { View, Text, ScrollView, Alert, TouchableOpacity } from 'react-native'
import { useLocalSearchParams, useRouter, Stack } from 'expo-router'
import { supabase } from '../../../lib/supabase'
import { Button } from '../../../components/Button'
import { shared, theme, formatEventDate } from '../../../constants'
import { EventWithDetails, Profile, AttendanceStatus } from '../../../types'

export default function EventDetail() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()

  const [event, setEvent] = useState<EventWithDetails | null>(null)
  const [attendees, setAttendees] = useState<Profile[]>([])
  const [userId, setUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [joining, setJoining] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    fetchEvent()
    supabase.auth.getUser().then(({ data: { user } }) => setUserId(user?.id ?? null))
  }, [])

  async function fetchEvent() {
    const { data, error } = await supabase
      .from('events')
      .select(`*, profiles!events_created_by_fkey (id, username, avatar_url), event_attendees (event_id, user_id, joined_at)`)
      .eq('id', id)
      .single()

    if (error) return
    setEvent(data as EventWithDetails)

    // Fetch full profile data for each attendee so we can show their usernames
    const attendeeIds = data.event_attendees?.map((a: any) => a.user_id) ?? []
    if (attendeeIds.length > 0) {
      const { data: profiles } = await supabase.from('profiles').select('*').in('id', attendeeIds)
      setAttendees((profiles ?? []) as Profile[])
    } else {
      setAttendees([])
    }

    setLoading(false)
  }

  // Handles both joining and leaving — inserts or deletes the event_attendees row
  async function handleToggleAttendance(action: 'join' | 'leave') {
    if (!userId) return
    try {
      setJoining(true)
      const query = action === 'join'
        ? supabase.from('event_attendees').insert({ event_id: id, user_id: userId })
        : supabase.from('event_attendees').delete().eq('event_id', id).eq('user_id', userId)
      const { error } = await query
      if (error) throw error
      fetchEvent()
    } catch (e: any) {
      Alert.alert('Error', e.message)
    } finally {
      setJoining(false)
    }
  }

  function handleRemoveAttendee(attendeeId: string, username: string) {
    Alert.alert('Remove attendee', `Remove ${username} from this event?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive', onPress: async () => {
          const { error } = await supabase.from('event_attendees').delete().eq('event_id', id).eq('user_id', attendeeId)
          if (error) Alert.alert('Error', error.message)
          else fetchEvent()
        }
      },
    ])
  }

  function handleDelete() {
    Alert.alert('Delete event', 'Are you sure? This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          try {
            setDeleting(true)
            const { error } = await supabase.from('events').delete().eq('id', id)
            if (error) throw error
            router.replace('/(app)/(tabs)')
          } catch (e: any) {
            Alert.alert('Error', e.message)
          } finally {
            setDeleting(false)
          }
        }
      },
    ])
  }

  if (loading || !event) return null

  // Compute attendance status from raw event data
  const status: AttendanceStatus = {
    count: event.event_attendees?.length ?? 0,
    spotsLeft: event.max_attendees ? event.max_attendees - (event.event_attendees?.length ?? 0) : null,
    isFull: event.max_attendees ? (event.event_attendees?.length ?? 0) >= event.max_attendees : false,
    isAttending: event.event_attendees?.some(a => a.user_id === userId) ?? false,
    isOwner: event.created_by === userId,
  }

  return (
    <>
      <Stack.Screen options={{
        title: event.title,
        headerShown: true,
        headerStyle: { backgroundColor: theme.colors.background },
        headerTintColor: theme.colors.primary,
        headerBackTitle: 'Events',
        gestureEnabled: true,
      }} />

      <ScrollView style={shared.screen} contentContainerStyle={shared.scrollContent}>

        {/* Event info */}
        <Text style={[shared.primaryText, shared.mb_xs]}>{formatEventDate(event.event_date, 'long')}</Text>
        {event.location && <Text style={[shared.caption, shared.mb_xs]}>{event.location}</Text>}
        {event.description && <Text style={[shared.body, shared.mb_lg]}>{event.description}</Text>}

        {/* Join / Leave button (hidden for the event owner) */}
        {!status.isOwner && (
          <View style={shared.mb_lg}>
            {status.isAttending
              ? <Button label="Leave event" onPress={() => handleToggleAttendance('leave')} loading={joining} variant="secondary" />
              : <Button label={status.isFull ? 'Event full' : 'Join event'} onPress={() => handleToggleAttendance('join')} loading={joining} disabled={status.isFull} />
            }
          </View>
        )}

        {/* Delete button (only for the event owner) */}
        {status.isOwner && (
          <View style={shared.mb_lg}>
            <Button label="Delete event" onPress={handleDelete} loading={deleting} variant="danger" />
          </View>
        )}

        {/* Host */}
        <View style={shared.divider} />
        <Text style={[shared.subheading, shared.mb_sm]}>Host</Text>
        <View style={[shared.card, shared.mb_lg]}>
          <Text style={shared.body}>{event.profiles?.username}</Text>
        </View>

        {/* Attendees list */}
        <View style={shared.divider} />
        <View style={[shared.rowBetween, shared.mb_sm]}>
          <Text style={shared.subheading}>Going</Text>
          <Text style={shared.caption}>
            {status.count}{event.max_attendees ? ` / ${event.max_attendees}` : ''} people
          </Text>
        </View>

        {attendees.length === 0
          ? <Text style={shared.caption}>no one yet — be the first!</Text>
          : attendees.map(profile => (
            <View key={profile.id} style={[shared.card, shared.attendeeRow]}>
              <Text style={shared.body}>{profile.username}</Text>
              {status.isOwner && (
                <TouchableOpacity
                  onPress={() => handleRemoveAttendee(profile.id, profile.username)}
                  style={shared.removeButton}
                >
                  <Text style={shared.removeText}>Remove</Text>
                </TouchableOpacity>
              )}
            </View>
          ))
        }

      </ScrollView>
    </>
  )
}
