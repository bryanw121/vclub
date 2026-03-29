import { useEffect, useState, useRef, useCallback, useMemo } from 'react'
import { Platform, View, Text, ScrollView, Alert, Share, Pressable, TouchableOpacity, ActivityIndicator, StyleSheet, useWindowDimensions, Modal } from 'react-native'
import { GestureDetector, Gesture, TouchableOpacity as GHTouchableOpacity } from 'react-native-gesture-handler'
import Animated, { useSharedValue, useAnimatedStyle, withSpring, runOnJS } from 'react-native-reanimated'
import { Ionicons } from '@expo/vector-icons'
import { useLocalSearchParams, useRouter, Stack } from 'expo-router'
import * as Linking from 'expo-linking'
import { supabase } from '../../../lib/supabase'
import { Button } from '../../../components/Button'
import { Input } from '../../../components/Input'
import { EventCommentRow } from '../../../components/EventCommentRow'
import { shared, theme, formatEventDate } from '../../../constants'
import { EventWithDetails, Profile, AttendanceStatus, EventGuest, EventCommentWithAuthor } from '../../../types'
import { profileDisplayName, profileInitial, eventAttendeeRows } from '../../../utils'

const EVENT_COMMENT_MAX_LEN = 2000

type RemoveModalState =
  | null
  | {
      kind: 'attendee'
      userId: string
      firstName: string | null
      lastName: string | null
      username: string
    }
  | {
      kind: 'guest'
      guestId: string
      firstName: string
      lastName: string
    }

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

const TEAM_COLORS      = ['#6C47FF', '#E85D5D', '#2DA265', '#E07B00', '#1A8FD1', '#9C27B0']
const TEAM_COLOR_NAMES = ['Purple',  'Red',     'Green',   'Orange',  'Blue',    'Violet']

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

  const panGesture = useMemo(() => {
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

    // Web: activate on click-drag (standard mouse UX)
    // Mobile: require a long press first so normal scrolling isn't broken
    return Platform.OS === 'web' ? pan.minDistance(5) : pan.activateAfterLongPress(500)
  }, [isOwner])

  const tapGesture = useMemo(() => Gesture.Tap()
    .onEnd(() => { 'worklet'; runOnJS(stableTogglePin)() })
    .enabled(isOwner),
  [isOwner])

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }))

  // X stays outside the pan gesture so taps work; shell keeps the original single-card look.
  return (
    <View style={styles.playerCardShell}>
      <GestureDetector gesture={panGesture}>
        <Animated.View style={[{ flex: 1, minWidth: 0 }, animStyle]}>
          <GestureDetector gesture={tapGesture}>
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
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
            </View>
          </GestureDetector>
        </Animated.View>
      </GestureDetector>
      {isOwner && (() => {
        const handleRemove = () => { onRemove() }
        return Platform.OS === 'web' ? (
          <View
            onStartShouldSetResponder={() => true}
            onResponderRelease={handleRemove}
            style={[styles.removeBtn, styles.removeBtnHit]}
            accessibilityRole="button"
            accessibilityLabel={`Remove ${playerDisplayName(profile)}`}
          >
            <Ionicons name="close" size={15} color={theme.colors.subtext} />
          </View>
        ) : (
          <GHTouchableOpacity
            onPress={handleRemove}
            style={[styles.removeBtn, styles.removeBtnHit]}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={`Remove ${playerDisplayName(profile)}`}
          >
            <Ionicons name="close" size={15} color={theme.colors.subtext} />
          </GHTouchableOpacity>
        )
      })()}
    </View>
  )
}

type DraggableGuestCardProps = {
  guest: EventGuest
  adderUsername: string
  teamColor: string | null
  isPinned: boolean
  isOwner: boolean
  onDragStart: (x: number, y: number) => void
  onDragMove: (x: number, y: number) => void
  onDragEnd: (x: number, y: number) => void
  onRemove: () => void
  onTogglePin: () => void
}

function DraggableGuestCard({ guest, adderUsername, teamColor, isPinned, isOwner, onDragStart, onDragMove, onDragEnd, onRemove, onTogglePin }: DraggableGuestCardProps) {
  const scale = useSharedValue(1)
  const opacity = useSharedValue(1)

  const cbRef = useRef({ onDragStart, onDragMove, onDragEnd, onTogglePin })
  cbRef.current = { onDragStart, onDragMove, onDragEnd, onTogglePin }
  const stableStart     = useCallback((x: number, y: number) => cbRef.current.onDragStart(x, y), [])
  const stableMove      = useCallback((x: number, y: number) => cbRef.current.onDragMove(x, y), [])
  const stableEnd       = useCallback((x: number, y: number) => cbRef.current.onDragEnd(x, y), [])
  const stableCancel    = useCallback(() => cbRef.current.onDragEnd(-1, -1), [])
  const stableTogglePin = useCallback(() => cbRef.current.onTogglePin(), [])

  const panGesture = useMemo(() => {
    const pan = Gesture.Pan()
      .onStart((e) => { 'worklet'; scale.value = withSpring(1.06, { damping: 12 }); opacity.value = withSpring(0.35); runOnJS(stableStart)(e.absoluteX, e.absoluteY) })
      .onUpdate((e) => { 'worklet'; runOnJS(stableMove)(e.absoluteX, e.absoluteY) })
      .onEnd((e) => { 'worklet'; scale.value = withSpring(1); opacity.value = withSpring(1); runOnJS(stableEnd)(e.absoluteX, e.absoluteY) })
      .onFinalize((_e, success) => { 'worklet'; scale.value = withSpring(1); opacity.value = withSpring(1); if (!success) runOnJS(stableCancel)() })
      .enabled(isOwner)
    return Platform.OS === 'web' ? pan.minDistance(5) : pan.activateAfterLongPress(500)
  }, [isOwner])

  const tapGesture = useMemo(() => Gesture.Tap()
    .onEnd(() => { 'worklet'; runOnJS(stableTogglePin)() })
    .enabled(isOwner),
  [isOwner])

  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }], opacity: opacity.value }))
  const initials = guest.first_name.charAt(0).toUpperCase() + guest.last_name.charAt(0).toUpperCase()

  return (
    <View style={styles.playerCardShell}>
      <GestureDetector gesture={panGesture}>
        <Animated.View style={[{ flex: 1, minWidth: 0 }, animStyle]}>
          <GestureDetector gesture={tapGesture}>
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
              <View style={[styles.avatar, { borderColor: teamColor ?? theme.colors.border, backgroundColor: teamColor ? teamColor + '18' : theme.colors.background, borderWidth: teamColor ? 2 : 1.5 }]}>
                <Text style={[styles.avatarInitial, { color: teamColor ?? theme.colors.subtext }]}>{initials}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.playerName} numberOfLines={1}>{guest.first_name} {guest.last_name.charAt(0)}.</Text>
                <Text style={{ fontSize: theme.font.size.xs, color: theme.colors.subtext, lineHeight: 14 }} numberOfLines={1}>{adderUsername}'s +1</Text>
              </View>
              {isOwner && isPinned && teamColor && (
                <Ionicons name="lock-closed" size={13} color={theme.colors.subtext} />
              )}
            </View>
          </GestureDetector>
        </Animated.View>
      </GestureDetector>
      {isOwner && (() => {
        const handleRemove = () => { onRemove() }
        return Platform.OS === 'web' ? (
          <View
            onStartShouldSetResponder={() => true}
            onResponderRelease={handleRemove}
            style={[styles.removeBtn, styles.removeBtnHit]}
            accessibilityRole="button"
            accessibilityLabel={`Remove guest ${guest.first_name} ${guest.last_name}`}
          >
            <Ionicons name="close" size={15} color={theme.colors.subtext} />
          </View>
        ) : (
          <GHTouchableOpacity
            onPress={handleRemove}
            style={[styles.removeBtn, styles.removeBtnHit]}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={`Remove guest ${guest.first_name} ${guest.last_name}`}
          >
            <Ionicons name="close" size={15} color={theme.colors.subtext} />
          </GHTouchableOpacity>
        )
      })()}
    </View>
  )
}

export default function EventDetail() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const { width: windowWidth } = useWindowDimensions()
  const isMobileWeb = Platform.OS === 'web' && windowWidth < 768

  const [event, setEvent] = useState<EventWithDetails | null>(null)
  const [attendees, setAttendees] = useState<Profile[]>([])
  const [waitlistProfiles, setWaitlistProfiles] = useState<Profile[]>([])
  const [userId, setUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [joining, setJoining] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [shareMenuVisible, setShareMenuVisible] = useState(false)
  const [linkCopied, setLinkCopied] = useState(false)
  const [deleteConfirmVisible, setDeleteConfirmVisible] = useState(false)
  const [comments, setComments] = useState<EventCommentWithAuthor[]>([])
  const [commentDraft, setCommentDraft] = useState('')
  const [postingComment, setPostingComment] = useState(false)

  const [removeModal, setRemoveModal] = useState<RemoveModalState>(null)
  const [removingAttendee, setRemovingAttendee] = useState(false)
  const [removeModalButtonsReady, setRemoveModalButtonsReady] = useState(false)



  const [guests, setGuests] = useState<EventGuest[]>([])
  const [waitlistGuests, setWaitlistGuests] = useState<EventGuest[]>([])
  const [adderUsernames, setAdderUsernames] = useState<Record<string, string>>({})
  const [guestModalVisible, setGuestModalVisible] = useState(false)
  const [guestFirstName, setGuestFirstName] = useState('')
  const [guestLastName, setGuestLastName] = useState('')
  const [addingGuest, setAddingGuest] = useState(false)

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
  }, [id])

  // After the remove modal renders, allow interaction after a short delay so the
  // ghost mouseup/pointerup from the X button click can't immediately dismiss it.
  useEffect(() => {
    if (removeModal === null) { setRemoveModalButtonsReady(false); return }
    const t = setTimeout(() => setRemoveModalButtonsReady(true), 250)
    return () => clearTimeout(t)
  }, [removeModal])

  async function fetchEvent() {
    try {
      setLoading(true)
      setLoadError(null)

      const { data, error } = await supabase
        .from('events')
        .select(`*, profiles!events_created_by_fkey (id, username, first_name, last_name, avatar_url), event_attendees (event_id, user_id, joined_at, team_number, team_pinned, status), event_tags (tag_id, tags (id, name, category, display_order))`)
        .eq('id', id)
        .single()

      if (error) throw error
      setEvent(data as EventWithDetails)

      const attendeeRows = eventAttendeeRows({ event_attendees: data.event_attendees })
      const attendingEntries = attendeeRows.filter((a: any) => a.status !== 'waitlisted')
      const waitlistEntries = [...attendeeRows.filter((a: any) => a.status === 'waitlisted')]
        .sort((a: any, b: any) => new Date(a.joined_at).getTime() - new Date(b.joined_at).getTime())

      const attendeeIds = attendingEntries.map((a: any) => a.user_id)
      if (attendeeIds.length > 0) {
        const { data: profiles, error: profilesError } = await supabase.from('profiles').select('*').in('id', attendeeIds)
        if (profilesError) throw profilesError
        setAttendees((profiles ?? []) as Profile[])
      } else {
        setAttendees([])
      }

      const waitlistIds = waitlistEntries.map((a: any) => a.user_id)
      if (waitlistIds.length > 0) {
        const { data: wProfiles } = await supabase.from('profiles').select('*').in('id', waitlistIds)
        const profileMap = new Map(((wProfiles ?? []) as Profile[]).map(p => [p.id, p]))
        setWaitlistProfiles(waitlistIds.map(uid => profileMap.get(uid)).filter(Boolean) as Profile[])
      } else {
        setWaitlistProfiles([])
      }

      const { data: guestRows } = await supabase
        .from('event_guests')
        .select('*')
        .eq('event_id', id)
        .order('joined_at', { ascending: true })
      const allGuests = (guestRows ?? []) as EventGuest[]
      const attendingGuests = allGuests.filter(g => g.status === 'attending')
      setGuests(attendingGuests)
      setWaitlistGuests(allGuests.filter(g => g.status === 'waitlisted'))

      const adderIds = [...new Set(allGuests.map(g => g.added_by))]
      if (adderIds.length > 0) {
        const { data: adderProfiles } = await supabase.from('profiles').select('id, username').in('id', adderIds)
        const nameMap: Record<string, string> = {}
        for (const p of adderProfiles ?? []) nameMap[(p as any).id] = (p as any).username
        setAdderUsernames(nameMap)
      } else {
        setAdderUsernames({})
      }

      // Initialise team assignments from DB (attending only)
      const map: Record<string, TeamAssignment> = {}
      let maxTeam = 1
      for (const a of attendingEntries as any[]) {
        const t = a.team_number ?? null
        map[a.user_id] = { team: t, pinned: a.team_pinned ?? false }
        if (t && t > maxTeam) maxTeam = t
      }
      for (const g of attendingGuests) {
        const t = g.team_number ?? null
        map[g.id] = { team: t, pinned: g.team_pinned ?? false }
        if (t && t > maxTeam) maxTeam = t
      }
      setAssignments(map)
      if (Object.values(map).some(a => a.team !== null)) {
        setNumTeams(Math.max(2, maxTeam))
      }

      const { data: commentRows, error: commentsError } = await supabase
        .from('event_comments')
        .select(
          'id, event_id, body, created_at, user_id, profiles!event_comments_user_id_fkey (id, username, first_name, last_name, avatar_url)',
        )
        .eq('event_id', id)
        .order('created_at', { ascending: true })
      if (commentsError) throw commentsError
      setComments((commentRows ?? []) as unknown as EventCommentWithAuthor[])
    } catch (e: any) {
      setLoadError(e.message ?? 'Failed to load event')
    } finally {
      setLoading(false)
    }
  }

  async function refreshComments() {
    const { data, error } = await supabase
      .from('event_comments')
      .select(
        'id, event_id, body, created_at, user_id, profiles!event_comments_user_id_fkey (id, username, first_name, last_name, avatar_url)',
      )
      .eq('event_id', id)
      .order('created_at', { ascending: true })
    if (error) {
      Alert.alert('Error', error.message)
      return
    }
    setComments((data ?? []) as unknown as EventCommentWithAuthor[])
  }

  async function handlePostComment() {
    if (!userId) return
    const body = commentDraft.trim()
    if (!body) return
    if (body.length > EVENT_COMMENT_MAX_LEN) {
      Alert.alert('Comment too long', `Please keep comments under ${EVENT_COMMENT_MAX_LEN} characters.`)
      return
    }
    try {
      setPostingComment(true)
      const { error } = await supabase.from('event_comments').insert({
        event_id: id,
        user_id: userId,
        body,
      })
      if (error) throw error
      setCommentDraft('')
      await refreshComments()
    } catch (e: any) {
      Alert.alert('Error', e.message)
    } finally {
      setPostingComment(false)
    }
  }

  async function refreshAttendees() {
    const { data: rows, error } = await supabase
      .from('event_attendees')
      .select('event_id, user_id, joined_at, team_number, team_pinned, status')
      .eq('event_id', id)
    if (error) { Alert.alert('Error', error.message); return }

    setEvent(prev => prev ? { ...prev, event_attendees: rows ?? [] } : prev)

    const attendingRows = (rows ?? []).filter((a: any) => a.status !== 'waitlisted')
    const waitlistRows = [...(rows ?? []).filter((a: any) => a.status === 'waitlisted')]
      .sort((a: any, b: any) => new Date(a.joined_at).getTime() - new Date(b.joined_at).getTime())

    const attendeeIds = attendingRows.map((a: any) => a.user_id)
    if (attendeeIds.length > 0) {
      const { data: profiles } = await supabase.from('profiles').select('*').in('id', attendeeIds)
      setAttendees((profiles ?? []) as Profile[])
    } else {
      setAttendees([])
    }

    const waitlistIds = waitlistRows.map((a: any) => a.user_id)
    if (waitlistIds.length > 0) {
      const { data: wProfiles } = await supabase.from('profiles').select('*').in('id', waitlistIds)
      const profileMap = new Map(((wProfiles ?? []) as Profile[]).map(p => [p.id, p]))
      setWaitlistProfiles(waitlistIds.map(uid => profileMap.get(uid)).filter(Boolean) as Profile[])
    } else {
      setWaitlistProfiles([])
    }

    const map: Record<string, TeamAssignment> = {}
    let maxTeam = 1
    for (const a of attendingRows as any[]) {
      const t = a.team_number ?? null
      map[a.user_id] = { team: t, pinned: a.team_pinned ?? false }
      if (t && t > maxTeam) maxTeam = t
    }
    setAssignments(map)
    if (Object.values(map).some(a => a.team !== null)) {
      setNumTeams(prev => Math.max(prev, maxTeam))
    }

    const { data: guestRows } = await supabase
      .from('event_guests')
      .select('*')
      .eq('event_id', id)
      .order('joined_at', { ascending: true })
    const allGuests = (guestRows ?? []) as EventGuest[]
    const attendingGuests = allGuests.filter(g => g.status === 'attending')
    setGuests(attendingGuests)
    setWaitlistGuests(allGuests.filter(g => g.status === 'waitlisted'))

    const adderIds = [...new Set(allGuests.map(g => g.added_by))]
    if (adderIds.length > 0) {
      const { data: adderProfiles } = await supabase.from('profiles').select('id, username').in('id', adderIds)
      const nameMap: Record<string, string> = {}
      for (const p of adderProfiles ?? []) nameMap[(p as any).id] = (p as any).username
      setAdderUsernames(nameMap)
    } else {
      setAdderUsernames({})
    }

    setAssignments(prev => {
      const next = { ...prev }
      for (const g of attendingGuests) {
        if (!next[g.id]) next[g.id] = { team: g.team_number ?? null, pinned: g.team_pinned ?? false }
      }
      return next
    })
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
      await refreshAttendees()
    } catch (e: any) {
      Alert.alert('Error', e.message)
    } finally {
      setJoining(false)
    }
  }

  async function handleJoinWaitlist() {
    if (!userId) return
    try {
      setJoining(true)
      const { error } = await supabase.from('event_attendees').insert({ event_id: id, user_id: userId, status: 'waitlisted' })
      if (error) throw error
      await refreshAttendees()
    } catch (e: any) {
      Alert.alert('Error', e.message)
    } finally {
      setJoining(false)
    }
  }

  async function handleLeaveWaitlist() {
    if (!userId) return
    try {
      setJoining(true)
      const { error } = await supabase.from('event_attendees').delete().eq('event_id', id).eq('user_id', userId)
      if (error) throw error
      await refreshAttendees()
    } catch (e: any) {
      Alert.alert('Error', e.message)
    } finally {
      setJoining(false)
    }
  }

  async function handleAddGuest() {
    if (!userId || !guestFirstName.trim() || !guestLastName.trim()) return
    try {
      setAddingGuest(true)
      const attendingCount = (event?.event_attendees?.filter(a => a.status !== 'waitlisted').length ?? 0) + guests.length
      const isFull = event?.max_attendees ? attendingCount >= event.max_attendees : false
      const { error } = await supabase.from('event_guests').insert({
        event_id: id,
        added_by: userId,
        first_name: guestFirstName.trim(),
        last_name: guestLastName.trim(),
        status: isFull ? 'waitlisted' : 'attending',
      })
      if (error) throw error
      setGuestFirstName('')
      setGuestLastName('')
      setGuestModalVisible(false)
      await refreshAttendees()
    } catch (e: any) {
      Alert.alert('Error', e.message)
    } finally {
      setAddingGuest(false)
    }
  }

  function openRemoveGuestModal(g: EventGuest) {
    if (removeModal !== null) return
    setRemoveModal({ kind: 'guest', guestId: g.id, firstName: g.first_name, lastName: g.last_name })
  }

  function openRemoveAttendeeModal(profile: Profile) {
    if (removeModal !== null) return
    setRemoveModal({
      kind: 'attendee',
      userId: profile.id,
      firstName: profile.first_name,
      lastName: profile.last_name,
      username: profile.username,
    })
  }

  async function confirmRemoveFromModal() {
    // confirmRemoveFromModal start
    if (!removeModal) return
    try {
      setRemovingAttendee(true)
      if (removeModal.kind === 'guest') {
        const { data, error } = await supabase.from('event_guests').delete().eq('id', removeModal.guestId).select()
        if (error) {
          Alert.alert('Error', error.message)
          return
        }
        if (!data?.length) {
          Alert.alert(
            'Could not remove',
            'Nothing was deleted. As host, ensure the Supabase delete policy for event_guests is installed (see supabase/event_host_remove_attendees.sql).'
          )
          return
        }
      } else {
        const { data, error } = await supabase
          .from('event_attendees')
          .delete()
          .eq('event_id', id)
          .eq('user_id', removeModal.userId)
          .select()
        if (error) {
          Alert.alert('Error', error.message)
          return
        }
        if (!data?.length) {
          Alert.alert(
            'Could not remove',
            'Nothing was deleted. As host, add the Supabase policy so hosts can remove other attendees — run supabase/event_host_remove_attendees.sql in the SQL editor.'
          )
          return
        }
      }
      setRemoveModal(null)
      await refreshAttendees()
    } finally {
      setRemovingAttendee(false)
    }
  }

  async function handleApproveFromWaitlist(waitlistUserId: string) {
    const attendingCount = eventAttendeeRows(event ?? { event_attendees: [] }).filter(a => a.status !== 'waitlisted').length
    if (event?.max_attendees && attendingCount >= event.max_attendees) {
      Alert.alert('Event full', 'The event is still full. Remove an attendee first or increase the capacity.')
      return
    }
    try {
      const { error } = await supabase
        .from('event_attendees')
        .update({ status: 'attending' })
        .eq('event_id', id)
        .eq('user_id', waitlistUserId)
      if (error) throw error
      await refreshAttendees()
    } catch (e: any) {
      Alert.alert('Error', e.message)
    }
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
    setDeleteConfirmVisible(true)
  }

  async function confirmDelete() {
    setDeleteConfirmVisible(false)
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

  function cycleTeam(userId: string) {
    setAssignments(prev => {
      const current = prev[userId]?.team ?? null
      // null → 1 → 2 → ... → numTeams → null
      const next = current === null ? 1 : current >= numTeams ? null : current + 1
      return {
        ...prev,
        [userId]: { team: next, pinned: prev[userId]?.pinned ?? false },
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
    const totalPlayers = attendees.length + guests.length
    if (totalPlayers % numTeams !== 0) {
      Alert.alert('Unequal teams', `${totalPlayers} players can't be split into ${numTeams} equal teams. Adjust the team count so it divides evenly.`)
      return
    }
    const target = totalPlayers / numTeams

    const pinnedCount: Record<number, number> = {}
    for (let t = 1; t <= numTeams; t++) pinnedCount[t] = 0
    for (const p of attendees) { const a = assignments[p.id]; if (a?.pinned && a.team !== null) pinnedCount[a.team]++ }
    for (const g of guests)    { const a = assignments[g.id];  if (a?.pinned && a.team !== null) pinnedCount[a.team]++ }

    for (let t = 1; t <= numTeams; t++) {
      if (pinnedCount[t] > target) {
        Alert.alert('Too many pinned', `Team ${t} already has ${pinnedCount[t]} pinned players but can only hold ${target}.`)
        return
      }
    }

    const slots: number[] = []
    for (let t = 1; t <= numTeams; t++) {
      for (let i = 0; i < target - pinnedCount[t]; i++) slots.push(t)
    }

    const unpinned = [
      ...attendees.filter(p => !assignments[p.id]?.pinned).map(p => p.id),
      ...guests.filter(g => !assignments[g.id]?.pinned).map(g => g.id),
    ]
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
      const guestIds = new Set(guests.map(g => g.id))
      const attendeeEntries = Object.entries(assignments).filter(([id]) => !guestIds.has(id))
      const guestEntries    = Object.entries(assignments).filter(([id]) => guestIds.has(id))

      const attendeeResults = await Promise.all(
        attendeeEntries.map(([uid, { team, pinned }]) =>
          supabase.from('event_attendees').update({ team_number: team, team_pinned: pinned }).eq('event_id', id).eq('user_id', uid).select()
        )
      )
      const failed = attendeeResults.find(r => r.error)
      if (failed?.error) throw failed.error
      const blocked = attendeeResults.find(r => !r.data || r.data.length === 0)
      if (blocked) throw new Error('Update blocked — add an RLS UPDATE policy for event_attendees')

      await Promise.all(
        guestEntries.map(([gid, { team, pinned }]) =>
          supabase.from('event_guests').update({ team_number: team, team_pinned: pinned }).eq('id', gid)
        )
      )

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
        setAssignments(prev => ({ ...prev, [playerId]: { team: teamNum, pinned: prev[playerId]?.pinned ?? false } }))
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
  const totalPlayers = attendees.length + guests.length
  const hasTeams = isOwner
    ? totalPlayers > 0
    : Object.values(assignments).some(a => a.team !== null)

  return (
    <View
      ref={containerRef}
      style={{ flex: 1 }}
      pointerEvents={removeModal !== null ? 'none' : 'auto'}
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
            const attendeeRows = eventAttendeeRows(event)
            const attendingEntries = attendeeRows.filter(a => a.status !== 'waitlisted')
            const waitlistEntries = [...attendeeRows.filter(a => a.status === 'waitlisted')]
              .sort((a, b) => new Date(a.joined_at).getTime() - new Date(b.joined_at).getTime())
            const waitlistIdx = waitlistEntries.findIndex(a => a.user_id === userId)
            const totalAttending = attendingEntries.length + guests.length
            const status: AttendanceStatus = {
              count: totalAttending,
              spotsLeft: event.max_attendees ? event.max_attendees - totalAttending : null,
              isFull: event.max_attendees ? totalAttending >= event.max_attendees : false,
              isAttending: attendingEntries.some(a => a.user_id === userId),
              isOwner: event.created_by === userId,
              isWaitlisted: waitlistIdx !== -1,
              waitlistPosition: waitlistIdx !== -1 ? waitlistIdx + 1 : null,
              waitlistCount: waitlistEntries.length,
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

                {/* Join / Leave / Waitlist */}
                <View style={[shared.mb_lg, { flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing.sm }]}>
                  <View style={{ flex: 1 }}>
                    {status.isAttending ? (
                      <Button label="Leave event" onPress={() => handleToggleAttendance('leave')} loading={joining} variant="secondary" />
                    ) : status.isWaitlisted ? (
                      <View style={{ gap: theme.spacing.xs }}>
                        <Button label="Leave Waitlist" onPress={handleLeaveWaitlist} loading={joining} variant="secondary" />
                        <Text style={[shared.caption, { textAlign: 'center' }]}>
                          You are #{status.waitlistPosition} on the waitlist
                        </Text>
                      </View>
                    ) : status.isFull ? (
                      <Button label="Join Waitlist" onPress={handleJoinWaitlist} loading={joining} />
                    ) : (
                      <Button label="Join event" onPress={() => handleToggleAttendance('join')} loading={joining} />
                    )}
                  </View>
                  {(status.isAttending || status.isOwner) && (
                    <TouchableOpacity
                      onPress={() => setGuestModalVisible(true)}
                      hitSlop={8}
                      accessibilityLabel="Add a +1 guest"
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: theme.radius.md,
                        borderWidth: 1,
                        borderColor: theme.colors.border,
                        backgroundColor: theme.colors.card,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Ionicons name="person-add-outline" size={20} color={theme.colors.primary} />
                    </TouchableOpacity>
                  )}
                </View>

                {/* Host */}
                <View style={shared.divider} />
                <Text style={[shared.subheading, shared.mb_sm]}>Host</Text>
                <View style={[shared.card, shared.mb_lg]}>
                  <Text style={shared.body}>{event.profiles ? profileDisplayName(event.profiles) : ''}</Text>
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
                          disabled={numTeams >= Math.min(6, attendees.length + guests.length)}
                        >
                          <Text style={styles.stepBtnText}>+</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                </View>

                {attendees.length === 0 && guests.length === 0
                  ? <Text style={shared.caption}>no one yet — be the first!</Text>
                  : (() => {
                    function renderCard(profile: Profile) {
                      const a = assignments[profile.id]
                      const teamNum = a?.team ?? null
                      const teamColor = teamNum !== null ? TEAM_COLORS[(teamNum - 1) % TEAM_COLORS.length] : null
                      const card = (
                        <DraggablePlayerCard
                          profile={profile}
                          teamColor={teamColor}
                          isPinned={a?.pinned ?? false}
                          isOwner={status.isOwner}
                          onDragStart={(x, y) => handleDragStart(profile.id, x, y)}
                          onDragMove={handleDragMove}
                          onDragEnd={handleDragEnd}
                          onRemove={() => openRemoveAttendeeModal(profile)}
                          onTogglePin={() => togglePin(profile.id)}
                        />
                      )
                      if (status.isOwner) {
                        return <View key={profile.id} style={[styles.playerCell, isMobileWeb && { width: '50%' }]}>{card}</View>
                      }
                      return (
                        <TouchableOpacity key={profile.id} style={[styles.playerCell, isMobileWeb && { width: '50%' }]} onPress={() => router.push(`/profile/${profile.id}` as any)}>
                          {card}
                        </TouchableOpacity>
                      )
                    }

                    function renderGuestCard(g: EventGuest) {
                      const a = assignments[g.id]
                      const teamNum = a?.team ?? null
                      const teamColor = teamNum !== null ? TEAM_COLORS[(teamNum - 1) % TEAM_COLORS.length] : null
                      return (
                        <View key={g.id} style={[styles.playerCell, isMobileWeb && { width: '50%' }]}>
                          <DraggableGuestCard
                            guest={g}
                            adderUsername={adderUsernames[g.added_by] ?? '?'}
                            teamColor={teamColor}
                            isPinned={a?.pinned ?? false}
                            isOwner={status.isOwner}
                            onDragStart={(x, y) => handleDragStart(g.id, x, y)}
                            onDragMove={handleDragMove}
                            onDragEnd={handleDragEnd}
                            onRemove={() => openRemoveGuestModal(g)}
                            onTogglePin={() => togglePin(g.id)}
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
                          <View style={styles.playerGrid}>
                            {attendees.map(renderCard)}
                            {guests.map(renderGuestCard)}
                          </View>
                        </View>
                      )
                    }

                    const unassigned = attendees.filter(p => !assignments[p.id]?.team)
                    const unassignedGuests = guests.filter(g => !assignments[g.id]?.team)
                    return (
                      <View style={{ gap: theme.spacing.sm }}>
                        {Array.from({ length: numTeams }, (_, i) => i + 1).map(teamNum => {
                          const teamPlayers = attendees.filter(p => assignments[p.id]?.team === teamNum)
                          const teamGuests  = guests.filter(g => assignments[g.id]?.team === teamNum)
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
                              {teamPlayers.length === 0 && teamGuests.length === 0
                                ? <Text style={[shared.caption, { paddingHorizontal: theme.spacing.xs, paddingBottom: theme.spacing.xs }]}>No players</Text>
                                : <View style={styles.playerGrid}>{teamPlayers.map(renderCard)}{teamGuests.map(renderGuestCard)}</View>
                              }
                            </View>
                          )
                        })}
                        {(unassigned.length > 0 || unassignedGuests.length > 0) && (
                          <View
                            ref={(r) => { teamZoneRefs.current['unassigned'] = r as View | null }}
                            style={[styles.dropZone, hoveredTeamKey === 'unassigned' && styles.dropZoneActive]}
                          >
                            <View style={styles.teamHeader}>
                              <View style={[styles.teamDot, { backgroundColor: theme.colors.subtext }]} />
                              <Text style={[styles.teamHeading, { color: theme.colors.subtext }]}>Unassigned</Text>
                            </View>
                            <View style={styles.playerGrid}>
                              {unassigned.map(renderCard)}
                              {unassignedGuests.map(renderGuestCard)}
                            </View>
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

                {/* Waitlist section */}
                {(status.waitlistCount > 0 || waitlistGuests.length > 0 || (status.isFull && !status.isAttending && !status.isWaitlisted)) && (
                  <>
                    <View style={shared.divider} />
                    <View style={[shared.rowBetween, shared.mb_sm]}>
                      <Text style={shared.subheading}>Waitlist</Text>
                      <Text style={shared.caption}>{status.waitlistCount + waitlistGuests.length} waiting</Text>
                    </View>
                    {waitlistProfiles.length === 0 && waitlistGuests.length === 0 ? (
                      <Text style={shared.caption}>No one on the waitlist yet</Text>
                    ) : (
                      <View style={{ gap: theme.spacing.xs }}>
                        {waitlistProfiles.map((profile, idx) => (
                          <View key={profile.id} style={[shared.card, { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }]}>
                            <Text style={[shared.caption, { minWidth: 20, fontWeight: theme.font.weight.semibold, color: theme.colors.primary }]}>#{idx + 1}</Text>
                            <Text style={[shared.body, { flex: 1 }]}>{profileDisplayName(profile)}</Text>
                            {status.isOwner && (
                              <TouchableOpacity
                                onPress={() => handleApproveFromWaitlist(profile.id)}
                                style={{ paddingVertical: theme.spacing.xs, paddingHorizontal: theme.spacing.sm, backgroundColor: theme.colors.primary, borderRadius: theme.radius.md }}
                              >
                                <Text style={{ color: theme.colors.white, fontSize: theme.font.size.sm, fontWeight: theme.font.weight.medium }}>Approve</Text>
                              </TouchableOpacity>
                            )}
                          </View>
                        ))}
                        {waitlistGuests.map((g, idx) => (
                          <View key={g.id} style={[shared.card, { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }]}>
                            <Text style={[shared.caption, { minWidth: 20, fontWeight: theme.font.weight.semibold, color: theme.colors.primary }]}>#{waitlistProfiles.length + idx + 1}</Text>
                            <Text style={[shared.body, { flex: 1 }]}>{g.first_name} {g.last_name}</Text>
                            <View style={shared.tag}><Text style={shared.tagText}>Guest</Text></View>
                            {status.isOwner && (
                              <TouchableOpacity
                                onPress={() => openRemoveGuestModal(g)}
                                hitSlop={8}
                              >
                                <Ionicons name="close" size={16} color={theme.colors.subtext} />
                              </TouchableOpacity>
                            )}
                          </View>
                        ))}
                      </View>
                    )}
                  </>
                )}

                <View style={shared.divider} />
                <Text style={[shared.subheading, shared.mb_sm]}>Discussion</Text>
                {comments.length === 0 ? (
                  <Text style={[shared.caption, shared.mb_md]}>No messages yet. Be the first to comment.</Text>
                ) : (
                  <View style={{ gap: theme.spacing.xs, marginBottom: theme.spacing.lg }}>
                    {comments.map(c => (
                      <EventCommentRow key={c.id} comment={c} />
                    ))}
                  </View>
                )}
                {userId ? (
                  <View style={{ gap: theme.spacing.sm, marginBottom: theme.spacing.lg }}>
                    <Input
                      label="Add a comment"
                      value={commentDraft}
                      onChangeText={setCommentDraft}
                      placeholder="Write a message…"
                      multiline
                      numberOfLines={3}
                    />
                    <Button
                      label="Post"
                      onPress={handlePostComment}
                      loading={postingComment}
                      disabled={!commentDraft.trim()}
                    />
                  </View>
                ) : (
                  <Text style={[shared.caption, shared.mb_lg]}>Sign in to join the discussion.</Text>
                )}
              </>
            )
          })()}
        </ScrollView>
      )}

      {/* Add guest modal */}
      <Modal visible={guestModalVisible} transparent animationType="fade" onRequestClose={() => setGuestModalVisible(false)}>
        <TouchableOpacity
          style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.45)' }}
          activeOpacity={1}
          onPress={() => setGuestModalVisible(false)}
        >
          <TouchableOpacity activeOpacity={1} onPress={() => {}}>
            <View style={{ backgroundColor: theme.colors.card, borderRadius: theme.radius.lg, padding: theme.spacing.xl, width: 300, gap: theme.spacing.md }}>
              <Text style={{ fontSize: theme.font.size.lg, fontWeight: theme.font.weight.semibold, color: theme.colors.text }}>Add a +1</Text>
              <Input
                placeholder="First name"
                value={guestFirstName}
                onChangeText={setGuestFirstName}
                autoCapitalize="words"
              />
              <Input
                placeholder="Last name"
                value={guestLastName}
                onChangeText={setGuestLastName}
                autoCapitalize="words"
              />
              <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
                <View style={{ flex: 1 }}>
                  <Button label="Cancel" onPress={() => { setGuestModalVisible(false); setGuestFirstName(''); setGuestLastName('') }} variant="secondary" />
                </View>
                <View style={{ flex: 1 }}>
                  <Button
                    label="Add"
                    onPress={handleAddGuest}
                    loading={addingGuest}
                    disabled={!guestFirstName.trim() || !guestLastName.trim()}
                  />
                </View>
              </View>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Remove attendee / guest — host confirmation
          Use backdrop Pressable + card as siblings (not nested TouchableOpacity). Nested touchables
          let Cancel bubble to the backdrop and cause a double-close / flash. */}
      <Modal visible={removeModal !== null} transparent animationType="fade" onRequestClose={() => { if (!removingAttendee && removeModalButtonsReady) setRemoveModal(null) }}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <Pressable
            style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(0,0,0,0.45)' }]}
            onPress={() => { if (!removingAttendee && removeModalButtonsReady) setRemoveModal(null) }}
          />
          <TouchableOpacity activeOpacity={1} onPress={() => {}}
            style={{
              backgroundColor: theme.colors.card,
              borderRadius: theme.radius.lg,
              padding: theme.spacing.xl,
              width: 320,
              maxWidth: '92%',
              gap: theme.spacing.md,
              zIndex: 1,
            }}
          >
            <Text style={{ fontSize: theme.font.size.lg, fontWeight: theme.font.weight.semibold, color: theme.colors.text }}>
              {removeModal?.kind === 'guest' ? 'Remove guest?' : 'Remove attendee?'}
            </Text>
            <Text style={{ fontSize: theme.font.size.sm, color: theme.colors.subtext }}>
              This person will be removed from the event. They can rejoin if there is space.
            </Text>
                <View style={{ flexDirection: 'row', gap: theme.spacing.sm, marginTop: theme.spacing.xs }}>
                <View style={{ flex: 1 }}>
                <Button label="Cancel" onPress={() => setRemoveModal(null)} variant="secondary" disabled={removingAttendee || !removeModalButtonsReady} />
                </View>
              <View style={{ flex: 1 }}>
                <Button
                  label="Remove"
                  onPress={() => { void confirmRemoveFromModal() }}
                  loading={removingAttendee}
                  disabled={removingAttendee || !removeModalButtonsReady}
                  variant="danger"
                />
              </View>
            </View>
          </TouchableOpacity>
        </View>
      </Modal>

      {/* Delete confirmation modal */}
      <Modal visible={deleteConfirmVisible} transparent animationType="fade" onRequestClose={() => setDeleteConfirmVisible(false)}>
        <TouchableOpacity
          style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.45)' }}
          activeOpacity={1}
          onPress={() => setDeleteConfirmVisible(false)}
        >
          <View style={{ backgroundColor: theme.colors.card, borderRadius: theme.radius.lg, padding: theme.spacing.xl, width: 300, gap: theme.spacing.md }}>
            <Text style={{ fontSize: theme.font.size.lg, fontWeight: theme.font.weight.semibold, color: theme.colors.text }}>Delete event</Text>
            <Text style={{ fontSize: theme.font.size.md, color: theme.colors.subtext }}>Are you sure? This cannot be undone.</Text>
            <View style={{ flexDirection: 'row', gap: theme.spacing.sm, justifyContent: 'flex-end' }}>
              <TouchableOpacity
                onPress={() => setDeleteConfirmVisible(false)}
                style={{ paddingVertical: theme.spacing.sm, paddingHorizontal: theme.spacing.md, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border }}
              >
                <Text style={{ color: theme.colors.text, fontSize: theme.font.size.md }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={confirmDelete}
                style={{ paddingVertical: theme.spacing.sm, paddingHorizontal: theme.spacing.md, borderRadius: theme.radius.md, backgroundColor: theme.colors.error }}
              >
                <Text style={{ color: '#fff', fontSize: theme.font.size.md, fontWeight: theme.font.weight.semibold }}>Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

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
              <Text style={[styles.avatarInitial, { color: teamColor ?? theme.colors.subtext }]}>{profileInitial(profile)}</Text>
            </View>
            <Text style={[styles.playerName, { flex: 1 }]} numberOfLines={1}>{profileDisplayName(profile)}</Text>
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
  /** One bordered row: draggable name area + remove X (X outside pan gesture, same look as before). */
  playerCardShell: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
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
  removeBtnHit: {
    zIndex: 2,
    elevation: 2,
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
