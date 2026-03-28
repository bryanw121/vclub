import { useEffect, useState, useRef, useCallback, useMemo } from 'react'
import { Platform, View, Text, ScrollView, Alert, Share, Pressable, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native'
import { GestureDetector, Gesture } from 'react-native-gesture-handler'
import Animated, { useSharedValue, useAnimatedStyle, withSpring, runOnJS } from 'react-native-reanimated'
import { Ionicons } from '@expo/vector-icons'
import { useLocalSearchParams, useRouter, Stack } from 'expo-router'
import * as Linking from 'expo-linking'
import { supabase } from '../../../lib/supabase'
import { Button } from '../../../components/Button'
import { shared, theme, formatEventDate } from '../../../constants'
import { EventWithDetails, Profile, AttendanceStatus } from '../../../types'

const TEAM_COLORS      = ['#6C47FF', '#E85D5D', '#2DA265', '#E07B00', '#1A8FD1', '#9C27B0']
const TEAM_COLOR_NAMES = ['Purple',  'Red',     'Green',   'Orange',  'Blue',    'Violet']

function playerDisplayName(profile: Profile): string {
  if (profile.first_name && profile.last_name) {
    return `${profile.first_name} ${profile.last_name.charAt(0)}.`
  }
  return profile.username
}

function playerInitial(profile: Profile): string {
  if (profile.first_name && profile.last_name) {
    return profile.first_name.charAt(0).toUpperCase() + profile.last_name.charAt(0).toUpperCase()
  }
  return profile.username.charAt(0).toUpperCase()
}

type TeamAssignment = { team: number | null; pinned: boolean }

function ShareMenuItem({ icon, label, onPress, active }: { icon: string; label: string; onPress: () => void; active?: boolean }) {
  const [hovered, setHovered] = useState(false)
  return (
    <Pressable
      onPress={onPress}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      style={[
        styles.shareMenuItem,
        hovered && { backgroundColor: theme.colors.background },
      ]}
    >
      <Ionicons
        name={icon as any}
        size={16}
        color={active ? theme.colors.success : theme.colors.text}
      />
      <Text style={[styles.shareMenuText, active && { color: theme.colors.success }]}>
        {label}
      </Text>
    </Pressable>
  )
}

type DraggableCardProps = {
  profile: Profile
  teamColor: string | null
  isPinned: boolean
  isOwner: boolean
  onDragStart: (x: number, y: number) => void
  onDragMove: (x: number, y: number) => void
  onDragEnd: (x: number, y: number) => void
  onRemove: () => void
  onTogglePin: () => void
}

function DraggablePlayerCard({ profile, teamColor, isPinned, isOwner, onDragStart, onDragMove, onDragEnd, onRemove, onTogglePin }: DraggableCardProps) {
  const scale = useSharedValue(1)
  const opacity = useSharedValue(1)

  // Stable wrappers so the gesture closure never captures stale callbacks
  const cbRef = useRef({ onDragStart, onDragMove, onDragEnd, onTogglePin })
  cbRef.current = { onDragStart, onDragMove, onDragEnd, onTogglePin }
  const stableStart     = useCallback((x: number, y: number) => cbRef.current.onDragStart(x, y), [])
  const stableMove      = useCallback((x: number, y: number) => cbRef.current.onDragMove(x, y), [])
  const stableEnd       = useCallback((x: number, y: number) => cbRef.current.onDragEnd(x, y), [])
  const stableCancel    = useCallback(() => cbRef.current.onDragEnd(-1, -1), [])
  const stableTogglePin = useCallback(() => cbRef.current.onTogglePin(), [])

  const gesture = useMemo(() => {
    const pan = Gesture.Pan()
      .onStart((e) => {
        'worklet'
        scale.value = withSpring(1.06, { damping: 12 })
        opacity.value = withSpring(0.35)
        runOnJS(stableStart)(e.absoluteX, e.absoluteY)
      })
      .onUpdate((e) => {
        'worklet'
        runOnJS(stableMove)(e.absoluteX, e.absoluteY)
      })
      .onEnd((e) => {
        'worklet'
        scale.value = withSpring(1)
        opacity.value = withSpring(1)
        runOnJS(stableEnd)(e.absoluteX, e.absoluteY)
      })
      .onFinalize((_e, success) => {
        'worklet'
        scale.value = withSpring(1)
        opacity.value = withSpring(1)
        if (!success) runOnJS(stableCancel)()
      })
      .enabled(isOwner)

    const tap = Gesture.Tap()
      .onEnd(() => { 'worklet'; runOnJS(stableTogglePin)() })
      .enabled(isOwner)

    // Web: activate on click-drag (standard mouse UX)
    // Mobile: require a long press first so normal scrolling isn't broken
    const configuredPan = Platform.OS === 'web'
      ? pan.minDistance(5)
      : pan.activateAfterLongPress(500)

    // Pan takes priority; tap fires only if pan doesn't activate
    return Gesture.Exclusive(configuredPan, tap)
  }, [isOwner])

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }))

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View style={[styles.playerCard, animStyle]}>
        <View style={[
          styles.avatar,
          {
            borderColor: teamColor ?? theme.colors.border,
            backgroundColor: teamColor ? teamColor + '18' : theme.colors.background,
            borderWidth: teamColor ? 2 : 1.5,
          }
        ]}>
          <Text style={[styles.avatarInitial, { color: teamColor ?? theme.colors.subtext }]}>{playerInitial(profile)}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.playerName} numberOfLines={1}>{playerDisplayName(profile)}</Text>
        </View>
        {isOwner && isPinned && teamColor && (
          <Ionicons name="lock-closed" size={13} color={theme.colors.subtext} />
        )}
        {isOwner && (
          <TouchableOpacity onPress={onRemove} style={styles.removeBtn} hitSlop={8}>
            <Ionicons name="close" size={15} color={theme.colors.subtext} />
          </TouchableOpacity>
        )}
      </Animated.View>
    </GestureDetector>
  )
}

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
  const [shareMenuVisible, setShareMenuVisible] = useState(false)
  const [linkCopied, setLinkCopied] = useState(false)

  const [numTeams, setNumTeams] = useState(2)
  const [assignments, setAssignments] = useState<Record<string, TeamAssignment>>({})
  const [savingTeams, setSavingTeams] = useState(false)

  // Drag-and-drop
  const [draggingPlayerId, setDraggingPlayerId] = useState<string | null>(null)
  const [hoveredTeamKey, setHoveredTeamKey] = useState<string | null>(null)
  const ghostX = useSharedValue(-500)
  const ghostY = useSharedValue(-500)
  const containerOffsetX = useSharedValue(0)
  const containerOffsetY = useSharedValue(0)
  const draggingPlayerIdRef = useRef<string | null>(null)
  const containerRef = useRef<View>(null)
  const teamZoneRefs = useRef<Record<string, View | null>>({})
  const teamZoneLayouts = useRef<Record<string, { top: number; bottom: number }>>({})

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
        .select(`*, profiles!events_created_by_fkey (id, username, first_name, last_name, avatar_url), event_attendees (event_id, user_id, joined_at, team_number, team_pinned), event_tags (tag_id, tags (id, name, category, display_order))`)
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

  async function handleShare() {
    if (Platform.OS === 'web') {
      setShareMenuVisible(v => !v)
      return
    }
    const url = Linking.createURL(`/event/${id}`)
    await Share.share({ message: `Check out "${event?.title ?? 'Event'}" on vclub:\n${url}`, url })
  }

  async function handleCopyLink() {
    await (navigator as any).clipboard.writeText(window.location.href)
    setLinkCopied(true)
    setTimeout(() => setLinkCopied(false), 2000)
  }

  async function handleWebShare() {
    await (navigator as any).share({ title: event?.title ?? 'Event', url: window.location.href })
    setShareMenuVisible(false)
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

  function togglePin(userId: string) {
    setAssignments(prev => ({
      ...prev,
      [userId]: { ...prev[userId], pinned: !prev[userId]?.pinned },
    }))
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

  function measureContainerOffset() {
    if (Platform.OS === 'web') {
      const el = containerRef.current as any
      const rect = el?.getBoundingClientRect?.()
      if (rect) {
        containerOffsetX.value = rect.left
        containerOffsetY.value = rect.top
      }
    } else {
      ;(containerRef.current as any)?.measure(
        (_x: number, _y: number, _w: number, _h: number, px: number, py: number) => {
          containerOffsetX.value = px
          containerOffsetY.value = py
        }
      )
    }
  }

  function handleDragStart(playerId: string, x: number, y: number) {
    measureContainerOffset()
    draggingPlayerIdRef.current = playerId
    ghostX.value = x
    ghostY.value = y
    setDraggingPlayerId(playerId)
    // Snapshot layout of every team drop zone
    Object.entries(teamZoneRefs.current).forEach(([key, ref]) => {
      ;(ref as any)?.measure((_x: number, _y: number, _w: number, h: number, _px: number, py: number) => {
        teamZoneLayouts.current[key] = { top: py - 24, bottom: py + h + 24 }
      })
    })
  }

  function handleDragMove(x: number, y: number) {
    ghostX.value = x
    ghostY.value = y
    let hovered: string | null = null
    for (const [key, zone] of Object.entries(teamZoneLayouts.current)) {
      if (y >= zone.top && y <= zone.bottom) { hovered = key; break }
    }
    setHoveredTeamKey(hovered)
  }

  function handleDragEnd(_x: number, y: number) {
    const playerId = draggingPlayerIdRef.current
    if (playerId) {
      let targetKey: string | null = null
      for (const [key, zone] of Object.entries(teamZoneLayouts.current)) {
        if (y >= zone.top && y <= zone.bottom) { targetKey = key; break }
      }
      if (targetKey !== null) {
        const teamNum = targetKey === 'unassigned' ? null : parseInt(targetKey, 10)
        setAssignments(prev => ({ ...prev, [playerId]: { team: teamNum, pinned: teamNum !== null } }))
      }
    }
    draggingPlayerIdRef.current = null
    setDraggingPlayerId(null)
    setHoveredTeamKey(null)
    ghostX.value = -500
    ghostY.value = -500
  }

  // Web: ghost is position:fixed (viewport coords) so no container offset needed
  // Mobile: ghost is position:absolute inside container so subtract container offset
  const ghostOverlayStyle = useAnimatedStyle(() => ({
    left: Platform.OS === 'web'
      ? ghostX.value - 80
      : ghostX.value - containerOffsetX.value - 80,
    top: Platform.OS === 'web'
      ? ghostY.value - 28
      : ghostY.value - containerOffsetY.value - 28,
  }))

  function goBack() {
    if (router.canGoBack()) router.back()
    else router.replace('/(app)/(tabs)')
  }

  const isOwner = event?.created_by === userId
  const hasTeams = isOwner
    ? attendees.length > 0  // owners always see team layout so they can drag
    : Object.values(assignments).some(a => a.team !== null)  // non-owners only see teams when assigned

  return (
    <View
      ref={containerRef}
      style={{ flex: 1 }}
      onLayout={() => { measureContainerOffset() }}
    >
      <Stack.Screen options={{
        headerShown: Platform.OS !== 'web',
        title: event?.title ?? '',
        headerStyle: { backgroundColor: theme.colors.background },
        headerTintColor: theme.colors.primary,
        gestureEnabled: true,
        headerLeft: () => (
          <TouchableOpacity onPress={goBack} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingRight: 8 }}>
            <Ionicons name="chevron-back" size={22} color={theme.colors.primary} />
            <Text style={{ color: theme.colors.primary, fontSize: theme.font.size.md }}>Events</Text>
          </TouchableOpacity>
        ),
        headerRight: () => (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
            <TouchableOpacity onPress={handleShare} style={{ padding: 8 }} hitSlop={8}>
              <Ionicons name="share-outline" size={22} color={theme.colors.primary} />
            </TouchableOpacity>
            {isOwner && (<>
              <TouchableOpacity onPress={() => router.push(`/host?edit=${id}` as any)} style={{ padding: 8 }} hitSlop={8}>
                <Ionicons name="create-outline" size={22} color={theme.colors.primary} />
              </TouchableOpacity>
              <TouchableOpacity onPress={handleDelete} style={{ padding: 8 }} hitSlop={8}>
                {deleting
                  ? <ActivityIndicator size="small" color={theme.colors.error} />
                  : <Ionicons name="trash-outline" size={22} color={theme.colors.error} />
                }
              </TouchableOpacity>
            </>)}
          </View>
        ),
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
          zIndex: 10,
          backgroundColor: theme.colors.background,
          gap: theme.spacing.sm,
        }}>
          <TouchableOpacity
            onPress={goBack}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginRight: theme.spacing.sm }}
          >
            <Ionicons name="chevron-back" size={20} color={theme.colors.primary} />
            <Text style={{ color: theme.colors.primary, fontSize: theme.font.size.sm }}>Events</Text>
          </TouchableOpacity>
          <Text style={{ flex: 1, fontSize: theme.font.size.lg, fontWeight: theme.font.weight.semibold, color: theme.colors.primary }} numberOfLines={1}>
            {event?.title ?? ''}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
            <View>
              <TouchableOpacity onPress={handleShare} style={{ padding: 4 }} hitSlop={8}>
                <Ionicons name="share-outline" size={20} color={theme.colors.primary} />
              </TouchableOpacity>
              {shareMenuVisible && (
                <>
                  <TouchableOpacity
                    style={{ position: 'fixed' as any, top: 0, left: 0, right: 0, bottom: 0 }}
                    onPress={() => setShareMenuVisible(false)}
                  />
                  <View style={styles.shareMenu}>
                    {!!(navigator as any).share && (
                      <ShareMenuItem icon="share-social-outline" label="Share…" onPress={handleWebShare} />
                    )}
                    <ShareMenuItem
                      icon={linkCopied ? 'checkmark' : 'link-outline'}
                      label={linkCopied ? 'Copied!' : 'Copy link'}
                      onPress={handleCopyLink}
                      active={linkCopied}
                    />
                  </View>
                </>
              )}
            </View>
            {isOwner && (<>
              <TouchableOpacity onPress={() => router.push(`/host?edit=${id}` as any)} style={{ padding: 4 }} hitSlop={8}>
                <Ionicons name="create-outline" size={20} color={theme.colors.primary} />
              </TouchableOpacity>
              <TouchableOpacity onPress={handleDelete} style={{ padding: 4 }} hitSlop={8}>
                {deleting
                  ? <ActivityIndicator size="small" color={theme.colors.error} />
                  : <Ionicons name="trash-outline" size={20} color={theme.colors.error} />
                }
              </TouchableOpacity>
            </>)}
          </View>
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
                {(event.event_tags?.length ?? 0) > 0 && (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: theme.spacing.sm }}>
                    {[...(event.event_tags ?? [])].sort((a, b) => a.tags.display_order - b.tags.display_order).map(et => (
                      <View key={et.tag_id} style={shared.tag}>
                        <Text style={shared.tagText}>{et.tags.name}</Text>
                      </View>
                    ))}
                  </View>
                )}
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
                  <Text style={shared.body}>{event.profiles ? playerDisplayName(event.profiles) : ''}</Text>
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
                  : (() => {
                    function renderCard(profile: Profile) {
                      const a = assignments[profile.id]
                      const teamNum = a?.team ?? null
                      const teamColor = teamNum !== null ? TEAM_COLORS[(teamNum - 1) % TEAM_COLORS.length] : null
                      return (
                        <View key={profile.id} style={styles.playerCell}>
                          <DraggablePlayerCard
                            profile={profile}
                            teamColor={teamColor}
                            isPinned={a?.pinned ?? false}
                            isOwner={status.isOwner}
                            onDragStart={(x, y) => handleDragStart(profile.id, x, y)}
                            onDragMove={handleDragMove}
                            onDragEnd={handleDragEnd}
                            onRemove={() => handleRemoveAttendee(profile.id, profile.username)}
                            onTogglePin={() => togglePin(profile.id)}
                          />
                        </View>
                      )
                    }

                    if (!hasTeams) {
                      return (
                        <View
                          ref={(r) => { teamZoneRefs.current['unassigned'] = r as View | null }}
                          style={[styles.dropZone, hoveredTeamKey === 'unassigned' && styles.dropZoneActive]}
                        >
                          <View style={styles.playerGrid}>{attendees.map(renderCard)}</View>
                        </View>
                      )
                    }

                    const unassigned = attendees.filter(p => !assignments[p.id]?.team)
                    return (
                      <View style={{ gap: theme.spacing.sm }}>
                        {Array.from({ length: numTeams }, (_, i) => i + 1).map(teamNum => {
                          const teamPlayers = attendees.filter(p => assignments[p.id]?.team === teamNum)
                          const teamColor = TEAM_COLORS[(teamNum - 1) % TEAM_COLORS.length]
                          const isHovered = hoveredTeamKey === String(teamNum)
                          return (
                            <View
                              key={teamNum}
                              ref={(r) => { teamZoneRefs.current[String(teamNum)] = r as View | null }}
                              style={[styles.dropZone, isHovered && { backgroundColor: teamColor + '14', borderColor: teamColor + '60' }]}
                            >
                              <View style={styles.teamHeader}>
                                <View style={[styles.teamDot, { backgroundColor: teamColor }]} />
                                <Text style={[styles.teamHeading, { color: teamColor }]}>{TEAM_COLOR_NAMES[(teamNum - 1) % TEAM_COLOR_NAMES.length]} Team</Text>
                              </View>
                              {teamPlayers.length === 0
                                ? <Text style={[shared.caption, { paddingHorizontal: theme.spacing.xs, paddingBottom: theme.spacing.xs }]}>No players</Text>
                                : <View style={styles.playerGrid}>{teamPlayers.map(renderCard)}</View>
                              }
                            </View>
                          )
                        })}
                        {unassigned.length > 0 && (
                          <View
                            ref={(r) => { teamZoneRefs.current['unassigned'] = r as View | null }}
                            style={[styles.dropZone, hoveredTeamKey === 'unassigned' && styles.dropZoneActive]}
                          >
                            <View style={styles.teamHeader}>
                              <View style={[styles.teamDot, { backgroundColor: theme.colors.subtext }]} />
                              <Text style={[styles.teamHeading, { color: theme.colors.subtext }]}>Unassigned</Text>
                            </View>
                            <View style={styles.playerGrid}>{unassigned.map(renderCard)}</View>
                          </View>
                        )}
                      </View>
                    )
                  })()
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

      {/* Drag ghost — floats above everything */}
      {draggingPlayerId && (() => {
        const profile = attendees.find(p => p.id === draggingPlayerId)
        if (!profile) return null
        const a = assignments[draggingPlayerId]
        const teamNum = a?.team ?? null
        const teamColor = teamNum !== null ? TEAM_COLORS[(teamNum - 1) % TEAM_COLORS.length] : null
        return (
          <Animated.View
            style={[styles.ghostCard, ghostOverlayStyle, Platform.OS === 'web' ? { position: 'fixed' as any } : null]}
            pointerEvents="none"
          >
            <View style={[styles.avatar, {
              borderColor: teamColor ?? theme.colors.border,
              backgroundColor: teamColor ? teamColor + '18' : theme.colors.card,
              borderWidth: teamColor ? 2 : 1.5,
            }]}>
              <Text style={[styles.avatarInitial, { color: teamColor ?? theme.colors.subtext }]}>{playerInitial(profile)}</Text>
            </View>
            <Text style={[styles.playerName, { flex: 1 }]} numberOfLines={1}>{playerDisplayName(profile)}</Text>
          </Animated.View>
        )
      })()}
    </View>
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
  playerGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  playerCell: {
    width: Platform.OS === 'web' ? '33.33%' : '50%',
    padding: 3,
  },
  playerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.sm,
    gap: theme.spacing.xs,
  },
  dropZone: {
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: 'transparent',
    padding: theme.spacing.xs,
  },
  dropZoneActive: {
    backgroundColor: theme.colors.subtext + '12',
    borderColor: theme.colors.subtext + '40',
  },
  ghostCard: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    width: 160,
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.sm,
    gap: theme.spacing.xs,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 10,
    zIndex: 1000,
  },
  teamHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    marginBottom: theme.spacing.xs,
  },
  teamDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  teamHeading: {
    fontSize: theme.font.size.sm,
    fontWeight: theme.font.weight.semibold,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontSize: 13,
    fontWeight: theme.font.weight.bold,
    letterSpacing: 0.5,
  },
  removeBtn: {
    padding: 4,
  },
  playerName: {
    fontSize: theme.font.size.md,
    fontWeight: theme.font.weight.medium,
    color: theme.colors.text,
  },
  teamLabel: {
    fontSize: theme.font.size.xs,
    fontWeight: theme.font.weight.medium,
    marginTop: 1,
  },
  shareMenu: {
    position: 'absolute',
    top: 32,
    right: 0,
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 8,
    zIndex: 100,
    minWidth: 148,
    overflow: 'hidden',
  },
  shareMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
  },
  shareMenuText: {
    fontSize: theme.font.size.md,
    color: theme.colors.text,
  },
})
