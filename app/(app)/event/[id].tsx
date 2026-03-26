import { useEffect, useState } from 'react'
import { Platform, View, Text, ScrollView, Alert, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useLocalSearchParams, useRouter, Stack } from 'expo-router'
import { supabase } from '../../../lib/supabase'
import { Button } from '../../../components/Button'
import { shared, theme, formatEventDate } from '../../../constants'
import { EventWithDetails, Profile, AttendanceStatus } from '../../../types'

const TEAM_COLORS = ['#6C47FF', '#E85D5D', '#2DA265', '#E07B00', '#1A8FD1', '#9C27B0']

type TeamAssignment = { team: number | null; pinned: boolean }

export default function EventDetail() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()

  const [event, setEvent] = useState<EventWithDetails | null>(null)
  const [attendees, setAttendees] = useState<Profile[]>([])
  const [userId, setUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [joining, setJoining] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const [numTeams, setNumTeams] = useState(2)
  const [assignments, setAssignments] = useState<Record<string, TeamAssignment>>({})
  const [savingTeams, setSavingTeams] = useState(false)

  useEffect(() => {
    fetchEvent()
    supabase.auth.getUser().then(({ data: { user } }) => setUserId(user?.id ?? null))
  }, [])

  async function fetchEvent() {
    try {
      setLoading(true)
      setLoadError(null)

      const { data, error } = await supabase
        .from('events')
        .select(`*, profiles!events_created_by_fkey (id, username, avatar_url), event_attendees (event_id, user_id, joined_at, team_number, team_pinned)`)
        .eq('id', id)
        .single()

      if (error) throw error
      setEvent(data as EventWithDetails)

      const attendeeIds = data.event_attendees?.map((a: any) => a.user_id) ?? []
      if (attendeeIds.length > 0) {
        const { data: profiles, error: profilesError } = await supabase.from('profiles').select('*').in('id', attendeeIds)
        if (profilesError) throw profilesError
        setAttendees((profiles ?? []) as Profile[])
      } else {
        setAttendees([])
      }

      // Initialise team assignments from DB
      const map: Record<string, TeamAssignment> = {}
      let maxTeam = 1
      for (const a of (data.event_attendees ?? []) as any[]) {
        const t = a.team_number ?? null
        map[a.user_id] = { team: t, pinned: a.team_pinned ?? false }
        if (t && t > maxTeam) maxTeam = t
      }
      setAssignments(map)
      if (Object.values(map).some(a => a.team !== null)) {
        setNumTeams(Math.max(2, maxTeam))
      }
    } catch (e: any) {
      setLoadError(e.message ?? 'Failed to load event')
    } finally {
      setLoading(false)
    }
  }

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

  function cycleTeam(userId: string) {
    setAssignments(prev => {
      const current = prev[userId]?.team ?? null
      // null → 1 → 2 → ... → numTeams → null
      const next = current === null ? 1 : current >= numTeams ? null : current + 1
      return {
        ...prev,
        [userId]: { team: next, pinned: next !== null },
      }
    })
  }

  function resetTeams() {
    setAssignments(prev => {
      const next = { ...prev }
      Object.keys(next).forEach(uid => { next[uid] = { team: null, pinned: false } })
      return next
    })
  }

  function randomizeTeams() {
    if (attendees.length % numTeams !== 0) {
      Alert.alert('Unequal teams', `${attendees.length} players can't be split into ${numTeams} equal teams. Adjust the team count so it divides evenly.`)
      return
    }
    const target = attendees.length / numTeams

    // Count how many players are already pinned per team
    const pinnedCount: Record<number, number> = {}
    for (let t = 1; t <= numTeams; t++) pinnedCount[t] = 0
    for (const p of attendees) {
      const a = assignments[p.id]
      if (a?.pinned && a.team !== null) pinnedCount[a.team]++
    }

    // Validate no team is already over its target size
    for (let t = 1; t <= numTeams; t++) {
      if (pinnedCount[t] > target) {
        Alert.alert('Too many pinned', `Team ${t} already has ${pinnedCount[t]} pinned players but can only hold ${target}.`)
        return
      }
    }

    // Build a slot list: one entry per open spot on each team
    const slots: number[] = []
    for (let t = 1; t <= numTeams; t++) {
      for (let i = 0; i < target - pinnedCount[t]; i++) slots.push(t)
    }

    // Shuffle both unpinned players and slots independently
    const unpinned = attendees.filter(p => !assignments[p.id]?.pinned).map(p => p.id)
    for (let i = unpinned.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[unpinned[i], unpinned[j]] = [unpinned[j], unpinned[i]]
    }
    for (let i = slots.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[slots[i], slots[j]] = [slots[j], slots[i]]
    }

    setAssignments(prev => {
      const next = { ...prev }
      unpinned.forEach((uid, i) => { next[uid] = { team: slots[i], pinned: false } })
      return next
    })
  }

  async function saveTeams() {
    setSavingTeams(true)
    try {
      const results = await Promise.all(
        Object.entries(assignments).map(([uid, { team, pinned }]) =>
          supabase
            .from('event_attendees')
            .update({ team_number: team, team_pinned: pinned })
            .eq('event_id', id)
            .eq('user_id', uid)
            .select()
        )
      )
      const failed = results.find(r => r.error)
      if (failed?.error) throw failed.error
      const blocked = results.find(r => !r.data || r.data.length === 0)
      if (blocked) throw new Error('Update blocked — add an RLS UPDATE policy for event_attendees')
      await fetchEvent()
    } catch (e: any) {
      Alert.alert('Error saving teams', e.message)
    } finally {
      setSavingTeams(false)
    }
  }

  const isOwner = event?.created_by === userId
  const hasTeams = Object.values(assignments).some(a => a.team !== null)

  return (
    <>
      <Stack.Screen options={{
        headerShown: Platform.OS !== 'web',
        title: event?.title ?? '',
        headerStyle: { backgroundColor: theme.colors.background },
        headerTintColor: theme.colors.primary,
        gestureEnabled: true,
        headerLeft: () => (
          <TouchableOpacity onPress={() => router.back()} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingRight: 8 }}>
            <Ionicons name="chevron-back" size={22} color={theme.colors.primary} />
            <Text style={{ color: theme.colors.primary, fontSize: theme.font.size.md }}>Events</Text>
          </TouchableOpacity>
        ),
        headerRight: isOwner ? () => (
          <TouchableOpacity onPress={handleDelete} style={{ padding: 8 }} hitSlop={8}>
            {deleting
              ? <ActivityIndicator size="small" color={theme.colors.error} />
              : <Ionicons name="trash-outline" size={22} color={theme.colors.error} />
            }
          </TouchableOpacity>
        ) : undefined,
      }} />

      {/* Web-only page header: back + title + delete */}
      {Platform.OS === 'web' && (
        <View style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: theme.spacing.lg,
          paddingVertical: theme.spacing.md,
          borderBottomWidth: 1,
          borderBottomColor: theme.colors.border,
          backgroundColor: theme.colors.background,
          gap: theme.spacing.sm,
        }}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginRight: theme.spacing.sm }}
          >
            <Ionicons name="chevron-back" size={20} color={theme.colors.primary} />
            <Text style={{ color: theme.colors.primary, fontSize: theme.font.size.sm }}>Events</Text>
          </TouchableOpacity>
          <Text style={{ flex: 1, fontSize: theme.font.size.lg, fontWeight: theme.font.weight.semibold, color: theme.colors.primary }} numberOfLines={1}>
            {event?.title ?? ''}
          </Text>
          {isOwner && (
            <TouchableOpacity onPress={handleDelete} style={{ padding: 4 }} hitSlop={8}>
              {deleting
                ? <ActivityIndicator size="small" color={theme.colors.error} />
                : <Ionicons name="trash-outline" size={20} color={theme.colors.error} />
              }
            </TouchableOpacity>
          )}
        </View>
      )}

      {loading ? (
        <View style={shared.centered}>
          <ActivityIndicator color={theme.colors.primary} />
        </View>
      ) : loadError || !event ? (
        <View style={shared.centered}>
          <Text style={shared.errorText}>{loadError ?? 'Event not found'}</Text>
        </View>
      ) : (
        <ScrollView style={shared.screen} contentContainerStyle={shared.scrollContent}>
          {(() => {
            const status: AttendanceStatus = {
              count: event.event_attendees?.length ?? 0,
              spotsLeft: event.max_attendees ? event.max_attendees - (event.event_attendees?.length ?? 0) : null,
              isFull: event.max_attendees ? (event.event_attendees?.length ?? 0) >= event.max_attendees : false,
              isAttending: event.event_attendees?.some(a => a.user_id === userId) ?? false,
              isOwner: event.created_by === userId,
            }

            return (
              <>
                {/* Event info */}
                <Text style={[shared.primaryText, shared.mb_xs]}>{formatEventDate(event.event_date, 'long')}</Text>
                {event.location && <Text style={[shared.caption, shared.mb_xs]}>{event.location}</Text>}
                {event.description && <Text style={[shared.body, shared.mb_lg]}>{event.description}</Text>}

                {/* Join / Leave */}
                {!status.isOwner && (
                  <View style={shared.mb_lg}>
                    {status.isAttending
                      ? <Button label="Leave event" onPress={() => handleToggleAttendance('leave')} loading={joining} variant="secondary" />
                      : <Button label={status.isFull ? 'Event full' : 'Join event'} onPress={() => handleToggleAttendance('join')} loading={joining} disabled={status.isFull} />
                    }
                  </View>
                )}

                {/* Host */}
                <View style={shared.divider} />
                <Text style={[shared.subheading, shared.mb_sm]}>Host</Text>
                <View style={[shared.card, shared.mb_lg]}>
                  <Text style={shared.body}>{event.profiles?.username}</Text>
                </View>

                {/* ── Going + Teams (unified) ── */}
                <View style={shared.divider} />
                <View style={[shared.rowBetween, shared.mb_sm]}>
                  <Text style={shared.subheading}>Going</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
                    <Text style={shared.caption}>
                      {status.count}{event.max_attendees ? ` / ${event.max_attendees}` : ''} people
                    </Text>
                    {/* Team count stepper — host only */}
                    {status.isOwner && attendees.length > 0 && (
                      <View style={styles.stepper}>
                        <TouchableOpacity
                          style={[styles.stepBtn, numTeams <= 2 && styles.stepBtnDisabled]}
                          onPress={() => setNumTeams(t => Math.max(2, t - 1))}
                          disabled={numTeams <= 2}
                        >
                          <Text style={styles.stepBtnText}>−</Text>
                        </TouchableOpacity>
                        <Text style={styles.stepLabel}>{numTeams} teams</Text>
                        <TouchableOpacity
                          style={[styles.stepBtn, numTeams >= Math.min(6, attendees.length) && styles.stepBtnDisabled]}
                          onPress={() => setNumTeams(t => Math.min(6, attendees.length, t + 1))}
                          disabled={numTeams >= Math.min(6, attendees.length)}
                        >
                          <Text style={styles.stepBtnText}>+</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                </View>

                {attendees.length === 0
                  ? <Text style={shared.caption}>no one yet — be the first!</Text>
                  : attendees.map(profile => {
                    const a = assignments[profile.id]
                    const teamNum = a?.team ?? null
                    const badgeColor = teamNum !== null ? TEAM_COLORS[(teamNum - 1) % TEAM_COLORS.length] : theme.colors.border
                    const showBadge = status.isOwner || hasTeams
                    return (
                      <View key={profile.id} style={styles.assignRow}>
                        {showBadge && (
                          status.isOwner
                            ? (
                              <TouchableOpacity onPress={() => cycleTeam(profile.id)} style={styles.teamBadge} hitSlop={6}>
                                <View style={[styles.teamBadgeCircle, { backgroundColor: teamNum !== null ? badgeColor : 'transparent', borderColor: badgeColor }]}>
                                  {teamNum !== null && <Text style={styles.teamBadgeText}>{teamNum}</Text>}
                                </View>
                              </TouchableOpacity>
                            ) : (
                              <View style={styles.teamBadge}>
                                <View style={[styles.teamBadgeCircle, { backgroundColor: teamNum !== null ? badgeColor : 'transparent', borderColor: badgeColor }]}>
                                  {teamNum !== null && <Text style={styles.teamBadgeText}>{teamNum}</Text>}
                                </View>
                              </View>
                            )
                        )}
                        <Text style={[shared.body, { flex: 1 }]} numberOfLines={1}>{profile.username}</Text>
                        {status.isOwner && a?.pinned && teamNum !== null && (
                          <Ionicons name="lock-closed" size={11} color={theme.colors.subtext} />
                        )}
                        {status.isOwner && (
                          <TouchableOpacity onPress={() => handleRemoveAttendee(profile.id, profile.username)} hitSlop={8}>
                            <Ionicons name="close-outline" size={18} color={theme.colors.subtext} />
                          </TouchableOpacity>
                        )}
                      </View>
                    )
                  })
                }

                {/* Randomize + Save — host only */}
                {status.isOwner && attendees.length > 0 && (
                  <>
                    {attendees.length % numTeams !== 0 && (
                      <Text style={[shared.caption, { marginTop: theme.spacing.sm, color: theme.colors.error }]}>
                        {attendees.length} players can't be split into {numTeams} equal teams
                      </Text>
                    )}
                    <View style={[shared.row, { gap: theme.spacing.sm, marginTop: theme.spacing.md }]}>
                      <View style={{ flex: 1 }}>
                        <Button label="Reset" onPress={resetTeams} variant="secondary" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Button label="Randomize" onPress={randomizeTeams} variant="secondary" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Button label="Save" onPress={saveTeams} loading={savingTeams} />
                      </View>
                    </View>
                  </>
                )}
              </>
            )
          })()}
        </ScrollView>
      )}
    </>
  )
}

const styles = StyleSheet.create({
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  stepBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtnDisabled: { opacity: 0.35 },
  stepBtnText: {
    fontSize: theme.font.size.lg,
    color: theme.colors.primary,
    lineHeight: 22,
  },
  stepLabel: {
    fontSize: theme.font.size.md,
    fontWeight: theme.font.weight.medium,
    color: theme.colors.text,
    minWidth: 20,
    textAlign: 'center',
  },
  assignRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    gap: theme.spacing.sm,
  },
  teamBadge: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  teamBadgeCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  teamBadgeText: {
    fontSize: theme.font.size.xs,
    fontWeight: theme.font.weight.bold,
    color: '#fff',
  },
})
