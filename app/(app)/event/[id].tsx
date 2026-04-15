import React, { useEffect, useLayoutEffect, useState, useRef, useCallback, useMemo } from 'react'
import { Platform, View, Text, Image, ScrollView, Alert, Share, Pressable, TouchableOpacity, ActivityIndicator, StyleSheet, useWindowDimensions, Modal, Keyboard, KeyboardEvent, Switch, RefreshControl } from 'react-native'
import { GestureDetector, Gesture, TouchableOpacity as GHTouchableOpacity } from 'react-native-gesture-handler'
import Animated, { useSharedValue, useAnimatedStyle, withSpring, withTiming, runOnJS, interpolate, Extrapolation } from 'react-native-reanimated'
import { Ionicons } from '@expo/vector-icons'
import { useLocalSearchParams, useRouter, Stack, useFocusEffect } from 'expo-router'
import * as Linking from 'expo-linking'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { supabase } from '../../../lib/supabase'
import { Sentry } from '../../../lib/sentry'
import { Button } from '../../../components/Button'
import { ProfileAvatar } from '../../../components/ProfileAvatar'
import { Input } from '../../../components/Input'
import { EventCommentRow } from '../../../components/EventCommentRow'
import { Pager } from '../../../components/Pager'
import * as Calendar from 'expo-calendar'
import { shared, theme, formatEventDate, CHEER_TYPES, CHEERS_MAX_PER_EVENT, LOCATIONS } from '../../../constants'
import { EventWithDetails, Profile, AttendanceStatus, EventGuest, EventCommentWithAuthor, EventAttendeeWithProfile, CheerType, Cheer, EventCohostWithProfile, MentionUser } from '../../../types'
import {
  profileDisplayName,
  profileInitial,
  resolveProfileAvatarUriWithError,
  resolveProfileAvatarUriSmall,
  eventAttendeeRows,
  normalizeVolleyballPositions,
  normalizeVolleyballSkillLevel,
  hostRosterSkillAndPositionsLine,
} from '../../../utils'
import { LinkedText } from '../../../components/LinkedText'

const EVENT_COMMENT_MAX_LEN = 2000

function formatDiscussionBadgeCount(count: number): string {
  if (count > 50) return '50+'
  return String(count)
}

function formatEndTime(startIso: string, durationMinutes: number): string {
  const normalized = /[Z+]/.test(startIso) ? startIso : startIso + 'Z'
  const end = new Date(new Date(normalized).getTime() + durationMinutes * 60_000)
  return end.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`
  const h = minutes / 60
  return Number.isInteger(h) ? `${h}h` : `${h}h`
}

function openInMaps(address: string) {
  const encoded = encodeURIComponent(address)
  if (Platform.OS === 'ios') {
    void Linking.openURL(`maps:?q=${encoded}`)
  } else if (Platform.OS === 'android') {
    void Linking.openURL(`geo:0,0?q=${encoded}`)
  } else {
    window.open(`https://www.google.com/maps/search/?api=1&query=${encoded}`, '_blank', 'noopener,noreferrer')
  }
}

async function addToCalendar(title: string, startIso: string, durationMinutes: number, address?: string) {
  const normalized = /[Z+]/.test(startIso) ? startIso : startIso + 'Z'
  const startDate = new Date(normalized)
  const endDate = new Date(startDate.getTime() + durationMinutes * 60_000)

  if (Platform.OS === 'web') {
    const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
    const params = new URLSearchParams({
      action: 'TEMPLATE',
      text: title,
      dates: `${fmt(startDate)}/${fmt(endDate)}`,
      ...(address ? { location: address } : {}),
    })
    window.open(`https://calendar.google.com/calendar/render?${params.toString()}`, '_blank', 'noopener,noreferrer')
    return
  }

  const { status } = await Calendar.requestCalendarPermissionsAsync()
  if (status !== 'granted') {
    Alert.alert('Permission required', 'Please allow calendar access in Settings to add this event.')
    return
  }

  const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT)
  // Prefer the default calendar; fall back to the first writable one
  const defaultCal =
    calendars.find(c => c.allowsModifications && (c as any).isDefault) ??
    calendars.find(c => c.allowsModifications)

  if (!defaultCal) {
    Alert.alert('No calendar found', 'Could not find a writable calendar on this device.')
    return
  }

  await Calendar.createEventAsync(defaultCal.id, {
    title,
    startDate,
    endDate,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    ...(address ? { location: address } : {}),
  })

  Alert.alert('Added to calendar', `"${title}" has been added to your calendar.`)
}

type CheerPersonCardProps = {
  profile: Profile
  hasGiven: boolean
  disabled: boolean
  teamColor: string | null
  onPress: () => void
}

function CheerPersonCard({ profile, hasGiven, disabled, teamColor, onPress }: CheerPersonCardProps) {
  const [avatarUri, setAvatarUri] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { uri } = await resolveProfileAvatarUriSmall(profile.avatar_url)
      if (!cancelled) setAvatarUri(uri)
    })()
    return () => { cancelled = true }
  }, [profile.avatar_url])

  const activeColor = teamColor ?? theme.colors.primary
  const initials = profileInitial(profile)
  const displayName = profileDisplayName(profile)

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      style={[
        styles.playerCardShell,
        {
          borderColor: hasGiven ? activeColor : theme.colors.border,
          backgroundColor: hasGiven ? activeColor + '12' : disabled ? theme.colors.background : theme.colors.card,
          opacity: disabled ? 0.45 : 1,
        },
      ]}
    >
      <View style={[
        styles.avatar,
        {
          borderColor: activeColor,
          backgroundColor: activeColor + '18',
          borderWidth: hasGiven ? 2 : 1.5,
          overflow: 'hidden',
        }
      ]}>
        {avatarUri ? (
          <Image source={{ uri: avatarUri }} style={{ width: 40, height: 40 }} resizeMode="cover" />
        ) : (
          <Text style={[styles.avatarInitial, { color: activeColor }]}>{initials}</Text>
        )}
      </View>
      <Text style={[styles.playerName, { color: hasGiven ? activeColor : theme.colors.text, flex: 1 }]} numberOfLines={1}>
        {displayName}
      </Text>
      {hasGiven && <Ionicons name="checkmark-circle" size={16} color={activeColor} />}
    </TouchableOpacity>
  )
}

function HostCard({ profile, isOwner, onPress, inline = false }: { profile: Profile; isOwner: boolean; onPress: () => void; inline?: boolean }) {
  const [avatarUri, setAvatarUri] = useState<string | null>(null)
  useEffect(() => {
    if (!profile.avatar_url) return
    let cancelled = false
    resolveProfileAvatarUriSmall(profile.avatar_url).then(({ uri }) => {
      if (!cancelled) setAvatarUri(uri)
    })
    return () => { cancelled = true }
  }, [profile.avatar_url])

  const displayName = profileDisplayName(profile)

  return (
    <TouchableOpacity
      style={inline
        ? { flex: 1, flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }
        : [shared.card, { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }]
      }
      onPress={onPress}
      activeOpacity={isOwner ? 1 : 0.7}
      disabled={isOwner}
    >
      <ProfileAvatar uri={avatarUri} border={profile.selected_border ?? null} size={inline ? 32 : 40} />
      <Text style={[shared.body, { flex: 1 }]}>{displayName}</Text>
      {!isOwner && !inline && <Ionicons name="chevron-forward" size={16} color={theme.colors.subtext} style={{ marginLeft: 'auto' }} />}
    </TouchableOpacity>
  )
}

/**
 * Isolated composer so local draft state doesn't re-render the whole event screen on every keystroke.
 */
type DiscussionComposerProps = {
  isOwner: boolean
  postingComment: boolean
  announcementLabel?: string
  mentionableUsers: MentionUser[]
  onPost: (body: string, isAnnouncement: boolean, mentionIds: string[]) => Promise<void>
  onFocusScroll: () => void
}
function DiscussionComposer({ isOwner, postingComment, announcementLabel = 'Post as announcement', mentionableUsers, onPost, onFocusScroll }: DiscussionComposerProps) {
  const [draft, setDraft] = useState('')
  const [isAnnouncement, setIsAnnouncement] = useState(false)
  const [activeMention, setActiveMention] = useState<{ query: string; atIndex: number } | null>(null)
  const cursorPosRef = useRef(0)

  const suggestions = useMemo(() => {
    if (!activeMention) return []
    const q = activeMention.query.toLowerCase()
    return mentionableUsers
      .filter(u => !q || u.displayName.toLowerCase().includes(q) || u.username.toLowerCase().includes(q))
      .slice(0, 6)
  }, [activeMention, mentionableUsers])

  function detectMention(text: string, cursor: number) {
    const before = text.slice(0, cursor)
    const match = before.match(/(^|\s)@(\w*)$/)
    if (match) {
      setActiveMention({ query: match[2], atIndex: before.lastIndexOf('@') })
    } else {
      setActiveMention(null)
    }
  }

  function handleDraftChange(text: string) {
    setDraft(text)
    detectMention(text, cursorPosRef.current)
  }

  function handleSelectionChange(e: any) {
    const pos: number = e.nativeEvent.selection.start
    cursorPosRef.current = pos
    detectMention(draft, pos)
  }

  function selectMention(user: MentionUser) {
    if (!activeMention) return
    const before = draft.slice(0, activeMention.atIndex)
    const after = draft.slice(cursorPosRef.current)
    const newDraft = `${before}@${user.username} ${after}`
    setDraft(newDraft)
    cursorPosRef.current = activeMention.atIndex + user.username.length + 2 // @name<space>
    setActiveMention(null)
  }

  async function handlePost() {
    const body = draft.trim()
    if (!body) return
    // Collect IDs for all @username tokens found in the final text
    const mentionIds = [...new Set(
      [...body.matchAll(/@(\w+)/g)]
        .map(m => mentionableUsers.find(u => u.username === m[1])?.id)
        .filter((id): id is string => Boolean(id))
    )]
    try {
      await onPost(body, isAnnouncement, mentionIds)
      setDraft('')
      setIsAnnouncement(false)
      setActiveMention(null)
    } catch {
      // parent already showed the alert; keep draft so user can edit
    }
  }

  return (
    <>
      {isOwner && (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: theme.spacing.sm }}>
          <Text style={[shared.caption, { flex: 1, paddingRight: theme.spacing.sm }]}>{announcementLabel}</Text>
          <Switch
            value={isAnnouncement}
            onValueChange={setIsAnnouncement}
            trackColor={{ false: theme.colors.border, true: theme.colors.primary + '99' }}
            thumbColor={isAnnouncement ? theme.colors.white : theme.colors.card}
            ios_backgroundColor={theme.colors.border}
          />
        </View>
      )}

      {/* @mention suggestion list */}
      {suggestions.length > 0 && (
        <View style={{
          borderWidth: 1,
          borderColor: theme.colors.border,
          borderRadius: theme.radius.md,
          backgroundColor: theme.colors.card,
          marginBottom: theme.spacing.xs,
          overflow: 'hidden',
          maxHeight: 220,
        }}>
          <ScrollView keyboardShouldPersistTaps="always" bounces={false}>
            {suggestions.map((u, idx) => (
              <TouchableOpacity
                key={u.id}
                onPress={() => selectMention(u)}
                accessibilityRole="button"
                accessibilityLabel={`Mention ${u.displayName}`}
                style={{
                  paddingHorizontal: theme.spacing.md,
                  paddingVertical: theme.spacing.sm,
                  borderBottomWidth: idx < suggestions.length - 1 ? 1 : 0,
                  borderBottomColor: theme.colors.border,
                  minHeight: 44,
                  justifyContent: 'center',
                }}
              >
                <Text style={{ fontSize: theme.font.size.md, fontWeight: theme.font.weight.semibold, color: theme.colors.text }}>
                  {u.displayName}
                </Text>
                <Text style={{ fontSize: theme.font.size.sm, color: theme.colors.subtext }}>
                  @{u.username}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: theme.spacing.sm }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Input
            value={draft}
            onChangeText={handleDraftChange}
            onSelectionChange={handleSelectionChange}
            placeholder="Add a comment…"
            multiline
            numberOfLines={4}
            blurOnSubmit={false}
            containerStyle={{ marginBottom: 0 }}
            inputStyle={{
              minHeight: 44,
              maxHeight: 120,
              paddingHorizontal: theme.spacing.md,
              ...Platform.select({
                ios: { paddingTop: theme.spacing.md, paddingBottom: theme.spacing.sm },
                android: { paddingTop: theme.spacing.sm, paddingBottom: theme.spacing.sm, textAlignVertical: 'bottom' },
                default: { paddingVertical: theme.spacing.sm },
              }),
            }}
            onFocus={() => { requestAnimationFrame(onFocusScroll) }}
            includeFontPadding={Platform.OS === 'android' ? false : undefined}
          />
        </View>
        <TouchableOpacity
          onPress={handlePost}
          disabled={!draft.trim() || postingComment}
          accessibilityRole="button"
          accessibilityLabel="Send comment"
          style={{
            width: 44, height: 44,
            borderRadius: theme.radius.md,
            backgroundColor: theme.colors.primary,
            alignItems: 'center', justifyContent: 'center',
            opacity: !draft.trim() || postingComment ? 0.4 : 1,
          }}
        >
          {postingComment
            ? <ActivityIndicator size="small" color={theme.colors.white} />
            : <Ionicons name="send" size={20} color={theme.colors.white} />}
        </TouchableOpacity>
      </View>
    </>
  )
}

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
  const [avatarUri, setAvatarUri] = useState<string | null>(null)
  useEffect(() => {
    if (!profile.avatar_url) return
    let cancelled = false
    resolveProfileAvatarUriSmall(profile.avatar_url).then(({ uri }) => {
      if (!cancelled) setAvatarUri(uri)
    })
    return () => { cancelled = true }
  }, [profile.avatar_url])

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
              <ProfileAvatar uri={avatarUri} border={profile.selected_border ?? null} size={34} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.playerName} numberOfLines={1}>{playerDisplayName(profile)}</Text>
                {isOwner ? (
                  <Text style={{ fontSize: theme.font.size.xs, color: theme.colors.subtext, marginTop: 1 }} numberOfLines={2}>
                    {hostRosterSkillAndPositionsLine(profile)}
                  </Text>
                ) : null}
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
  const { id, from, tab } = useLocalSearchParams<{ id: string; from?: string; tab?: string }>()
  const router = useRouter()
  const { width: windowWidth, height: windowHeight } = useWindowDimensions()
  const insets = useSafeAreaInsets()
  const isMobileWeb = Platform.OS === 'web' && windowWidth < 768

  const [event, setEvent] = useState<EventWithDetails | null>(null)
  const [attendees, setAttendees] = useState<Profile[]>([])
  const [waitlistProfiles, setWaitlistProfiles] = useState<Profile[]>([])
  const [requestedProfiles, setRequestedProfiles] = useState<Profile[]>([])
  const [denyModal, setDenyModal] = useState<{ userId: string; displayName: string } | null>(null)
  const [denyReason, setDenyReason] = useState('')
  const [processingRequest, setProcessingRequest] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const lastFetchedAt = useRef<number>(0)
  const [currentUserProfile, setCurrentUserProfile] = useState<Profile | null>(null)
  const [joining, setJoining] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [shareMenuVisible, setShareMenuVisible] = useState(false)
  const [linkCopied, setLinkCopied] = useState(false)
  const [deleteConfirmVisible, setDeleteConfirmVisible] = useState(false)
  const [comments, setComments] = useState<EventCommentWithAuthor[]>([])
  const [commentsLoading, setCommentsLoading] = useState(false)
  const [postingComment, setPostingComment] = useState(false)
  const [discussionDrawerOpen, setDiscussionDrawerOpen] = useState(false)
  const [discussionKeyboardInset, setDiscussionKeyboardInset] = useState(0)
  const [discussionTabKeyboardInset, setDiscussionTabKeyboardInset] = useState(0)
  const [discussionTabComposerHeight, setDiscussionTabComposerHeight] = useState(0)
  const discussionScrollRef = useRef<ScrollView>(null)
  const discussionTabScrollRef = useRef<ScrollView>(null)
  const discussionSheetTranslateY = useSharedValue(0)
  const discussionBackdropOpacity = useSharedValue(0)

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

  const [activeTab, setActiveTab] = useState(() => {
    const t = parseInt(tab ?? '0', 10)
    return isNaN(t) ? 0 : Math.max(0, Math.min(3, t))
  })
  const [descFooterHeight, setDescFooterHeight] = useState(80)
  const innerPagerBlocked = useRef(false)

  const [myCheersGiven, setMyCheersGiven] = useState<Cheer[]>([])
  const [pendingCheers, setPendingCheers] = useState<{ receiverId: string; cheerType: CheerType }[]>([])
  const [cheersLoading, setCheersLoading] = useState(false)
  const [submittingCheers, setSubmittingCheers] = useState(false)
  const [cheersSent, setCheersSent] = useState(false)
  const [cheerSubmitError, setCheerSubmitError] = useState<string | null>(null)
  const [selectedCheerType, setSelectedCheerType] = useState<CheerType | null>(null)

  // Cohosts
  const [cohosts, setCohosts] = useState<EventCohostWithProfile[]>([])
  const [cohostModalVisible, setCohostModalVisible] = useState(false)
  const [cohostSearchQuery, setCohostSearchQuery] = useState('')
  const [cohostSearchResults, setCohostSearchResults] = useState<Profile[]>([])
  const [cohostSearching, setCohostSearching] = useState(false)
  const [cohostAdding, setCohostAdding] = useState(false)
  const [cohostRemoving, setCohostRemoving] = useState<string | null>(null)

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
  const idRef = useRef(id)
  idRef.current = id

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return
      setUserId(user.id)
      const { data } = await supabase
        .from('profiles')
        .select('id, username, first_name, last_name, avatar_url, position, selected_border, skill_level')
        .eq('id', user.id)
        .single()
      if (data) {
        const row = data as Profile
        setCurrentUserProfile({
          ...row,
          skill_level: normalizeVolleyballSkillLevel((row as any).skill_level),
        })
      }
    })
  }, [])

  useFocusEffect(
    useCallback(() => {
      const stale = Date.now() - lastFetchedAt.current > 5_000
      if (stale) {
        setComments([])
        void fetchEvent()
      }
    }, [id]),
  )

  // After the remove modal renders, allow interaction after a short delay so the
  // ghost mouseup/pointerup from the X button click can't immediately dismiss it.
  useEffect(() => {
    if (removeModal === null) { setRemoveModalButtonsReady(false); return }
    const t = setTimeout(() => setRemoveModalButtonsReady(true), 250)
    return () => clearTimeout(t)
  }, [removeModal])

  const closeDiscussionDrawer = useCallback(() => {
    setDiscussionDrawerOpen(false)
  }, [])

  const runDiscussionDismissAnimations = useCallback(() => {
    discussionBackdropOpacity.value = withTiming(0, { duration: 220 })
    discussionSheetTranslateY.value = withTiming(windowHeight, { duration: 260 }, (finished) => {
      if (finished) runOnJS(closeDiscussionDrawer)()
    })
  }, [windowHeight, closeDiscussionDrawer])

  useLayoutEffect(() => {
    if (!discussionDrawerOpen) return
    discussionBackdropOpacity.value = 0
    discussionSheetTranslateY.value = windowHeight
    discussionBackdropOpacity.value = withTiming(1, { duration: 260 })
    discussionSheetTranslateY.value = withTiming(0, { duration: 320 })
  }, [discussionDrawerOpen, windowHeight])

  useEffect(() => {
    if (!discussionDrawerOpen) {
      setDiscussionKeyboardInset(0)
      return
    }
    if (Platform.OS === 'web') return

    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow'
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide'
    const onShow = (e: KeyboardEvent) => {
      setDiscussionKeyboardInset(e.endCoordinates.height)
    }
    const onHide = () => {
      setDiscussionKeyboardInset(0)
    }
    const subShow = Keyboard.addListener(showEvt, onShow)
    const subHide = Keyboard.addListener(hideEvt, onHide)
    return () => {
      subShow.remove()
      subHide.remove()
      setDiscussionKeyboardInset(0)
    }
  }, [discussionDrawerOpen])

  useEffect(() => {
    if (activeTab !== 2) {
      setDiscussionTabKeyboardInset(0)
      return
    }
    if (Platform.OS === 'web') return

    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow'
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide'
    const onShow = (e: KeyboardEvent) => {
      setDiscussionTabKeyboardInset(e.endCoordinates.height)
    }
    const onHide = () => {
      setDiscussionTabKeyboardInset(0)
    }
    const subShow = Keyboard.addListener(showEvt, onShow)
    const subHide = Keyboard.addListener(hideEvt, onHide)
    return () => {
      subShow.remove()
      subHide.remove()
      setDiscussionTabKeyboardInset(0)
    }
  }, [activeTab])

  useEffect(() => {
    if (discussionTabKeyboardInset <= 0) return
    const t = setTimeout(() => {
      discussionTabScrollRef.current?.scrollToEnd({ animated: true })
    }, 64)
    return () => clearTimeout(t)
  }, [discussionTabKeyboardInset])

  useEffect(() => {
    if (discussionKeyboardInset <= 0) return
    const t = setTimeout(() => {
      discussionScrollRef.current?.scrollToEnd({ animated: true })
    }, 64)
    return () => clearTimeout(t)
  }, [discussionKeyboardInset])

  const scrollDiscussionToBottom = useCallback((animated: boolean) => {
    // scrollToEnd can fail before layout; delay a frame.
    requestAnimationFrame(() => {
      discussionScrollRef.current?.scrollToEnd({ animated })
      discussionTabScrollRef.current?.scrollToEnd({ animated })
    })
  }, [])

  useEffect(() => {
    if (!discussionDrawerOpen) return
    const t = setTimeout(() => scrollDiscussionToBottom(false), 0)
    return () => clearTimeout(t)
  }, [discussionDrawerOpen, scrollDiscussionToBottom])

  useEffect(() => {
    // When entering discussion or when comments update, keep the view pinned to the bottom (chat UX).
    if (activeTab !== 2 && !discussionDrawerOpen) return
    scrollDiscussionToBottom(false)
  }, [activeTab, discussionDrawerOpen, comments.length, discussionTabComposerHeight, scrollDiscussionToBottom])

  useEffect(() => {
    if (activeTab !== 3 || !isEventOver || !userId) return
    fetchMyCheers()
  }, [activeTab, userId])

  const discussionSheetAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: discussionSheetTranslateY.value }],
  }))

  const discussionBackdropAnimStyle = useAnimatedStyle(() => ({
    backgroundColor: `rgba(0,0,0,${discussionBackdropOpacity.value * 0.45})`,
  }))

  const discussionSheetPanGesture = useMemo(() => {
    const sheetH = Math.round(windowHeight * 0.88)
    const dismissThreshold = Math.min(110, sheetH * 0.22)
    const flingVy = 650

    const pan = Gesture.Pan()
      .activeOffsetY(10)
      .failOffsetX([-36, 36])
      .onUpdate((e) => {
        'worklet'
        const t = e.translationY
        const y = t > 0 ? t : t * 0.22
        discussionSheetTranslateY.value = y
        discussionBackdropOpacity.value = interpolate(y, [0, sheetH * 0.9], [1, 0], Extrapolation.CLAMP)
      })
      .onEnd((e) => {
        'worklet'
        const y = discussionSheetTranslateY.value
        const vy = e.velocityY
        if (y > dismissThreshold || vy > flingVy) {
          runOnJS(runDiscussionDismissAnimations)()
        } else {
          discussionBackdropOpacity.value = withTiming(1, { duration: 180 })
          discussionSheetTranslateY.value = withSpring(0, { damping: 26, stiffness: 320 })
        }
      })
      .onFinalize((_e, success) => {
        'worklet'
        if (!success) {
          discussionBackdropOpacity.value = withTiming(1, { duration: 160 })
          discussionSheetTranslateY.value = withSpring(0, { damping: 26, stiffness: 320 })
        }
      })

    return Platform.OS === 'web' ? pan.minDistance(4) : pan
  }, [windowHeight, runDiscussionDismissAnimations])

  useEffect(() => {
    innerPagerBlocked.current = draggingPlayerId !== null
  }, [draggingPlayerId])

  function attendeeRowsWithProfiles(eventAttendees: EventWithDetails['event_attendees']): EventAttendeeWithProfile[] {
    const ea = eventAttendees
    if (!ea || ea.length === 0) return []
    const first = ea[0] as EventAttendeeWithProfile | { count: number }
    if ('count' in first && !('user_id' in first)) return []
    return ea as EventAttendeeWithProfile[]
  }

  function profileFromAttendeeEmbed(a: EventAttendeeWithProfile): Profile | null {
    const p = a.profiles
    if (!p) return null
    return {
      id: p.id,
      username: p.username,
      first_name: p.first_name,
      last_name: p.last_name,
      avatar_url: p.avatar_url,
      selected_border: (p as any).selected_border ?? null,
      position: normalizeVolleyballPositions(p.position),
      skill_level: normalizeVolleyballSkillLevel((p as any).skill_level),
      created_at: '',
    }
  }

  async function fetchEvent(opts?: { silent?: boolean }) {
    const fetchId = id
    try {
      if (!opts?.silent) setLoading(true)
      setLoadError(null)
      setCommentsLoading(true)

      const { data, error } = await supabase
        .from('events')
        .select(
          `*, profiles!events_created_by_fkey (id, username, first_name, last_name, avatar_url, selected_border), event_attendees (event_id, user_id, joined_at, team_number, team_pinned, status, profiles!event_attendees_user_id_fkey (id, username, first_name, last_name, avatar_url, position, selected_border, skill_level)), event_tags (tag_id, tags (id, name, category, display_order))`,
        )
        .eq('id', fetchId)
        .single()

      if (error) throw error
      setEvent(data as EventWithDetails)

      const attendeeRows = attendeeRowsWithProfiles(data.event_attendees)
      const attendingEntries = attendeeRows.filter(a => a.status === 'attending')
      const waitlistEntries = [...attendeeRows.filter(a => a.status === 'waitlisted')].sort(
        (a, b) => new Date(a.joined_at).getTime() - new Date(b.joined_at).getTime(),
      )
      const requestedEntries = [...attendeeRows.filter(a => a.status === 'requested')].sort(
        (a, b) => new Date(a.joined_at).getTime() - new Date(b.joined_at).getTime(),
      )

      setAttendees(attendingEntries.map(profileFromAttendeeEmbed).filter(Boolean) as Profile[])
      setWaitlistProfiles(waitlistEntries.map(profileFromAttendeeEmbed).filter(Boolean) as Profile[])
      setRequestedProfiles(requestedEntries.map(profileFromAttendeeEmbed).filter(Boolean) as Profile[])

      // Comments load in parallel with guests; do not block the main shell.
      void supabase
        .from('event_comments')
        .select(
          'id, event_id, body, is_announcement, created_at, user_id, profiles!event_comments_user_id_fkey (id, username, first_name, last_name, avatar_url, selected_border)',
        )
        .eq('event_id', fetchId)
        .order('created_at', { ascending: true })
        .then(({ data: commentRows, error: commentsError }) => {
          if (fetchId !== idRef.current) return
          if (commentsError) {
            setComments([])
          } else {
            setComments((commentRows ?? []) as unknown as EventCommentWithAuthor[])
          }
          setCommentsLoading(false)
        })

      const { data: guestRows, error: guestsError } = await supabase
        .from('event_guests')
        .select('*')
        .eq('event_id', fetchId)
        .order('joined_at', { ascending: true })
      if (guestsError) throw guestsError

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

      const { data: cohostRows } = await supabase
        .from('event_cohosts')
        .select('event_id, user_id, added_by, added_at, profiles!event_cohosts_user_id_fkey (id, username, first_name, last_name, avatar_url, selected_border)')
        .eq('event_id', fetchId)
        .order('added_at', { ascending: true })
      setCohosts((cohostRows ?? []) as unknown as EventCohostWithProfile[])

      const map: Record<string, TeamAssignment> = {}
      let maxTeam = 1
      for (const a of attendingEntries) {
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
    } catch (e: any) {
      setLoadError(e.message ?? 'Failed to load event')
      setCommentsLoading(false)
    } finally {
      setLoading(false)
      lastFetchedAt.current = Date.now()
    }
  }

  async function handleRefresh() {
    setRefreshing(true)
    setComments([])
    await fetchEvent({ silent: true })
    setRefreshing(false)
  }

  async function searchCohostCandidates(query: string) {
    const q = query.trim()
    if (q.length < 2) { setCohostSearchResults([]); return }
    setCohostSearching(true)
    const { data } = await supabase
      .from('profiles')
      .select('id, username, first_name, last_name, avatar_url, selected_border, position, created_at')
      .or(`username.ilike.%${q}%,first_name.ilike.%${q}%,last_name.ilike.%${q}%`)
      .neq('id', userId ?? '')
      .neq('id', event?.created_by ?? '')
      .limit(10)
    const existing = new Set(cohosts.map(c => c.user_id))
    setCohostSearchResults(((data ?? []) as Profile[]).filter(p => !existing.has(p.id)))
    setCohostSearching(false)
  }

  async function addCohost(candidate: Profile) {
    if (!event || cohosts.length >= 3) return
    setCohostAdding(true)
    try {
      const { error } = await supabase.from('event_cohosts').insert({
        event_id: event.id,
        user_id: candidate.id,
        added_by: userId,
      })
      if (error) throw error
      const newCohost: EventCohostWithProfile = {
        event_id: event.id,
        user_id: candidate.id,
        added_by: userId!,
        added_at: new Date().toISOString(),
        profiles: {
          id: candidate.id,
          username: candidate.username,
          first_name: candidate.first_name,
          last_name: candidate.last_name,
          avatar_url: candidate.avatar_url,
          selected_border: candidate.selected_border ?? null,
        },
      }
      setCohosts(prev => [...prev, newCohost])
      setCohostSearchResults([])
      setCohostSearchQuery('')
      // Notify the new cohost
      await supabase.from('notifications').insert({
        user_id: candidate.id,
        notification_type: 'cohost_added',
        title: 'You\'ve been added as a co-host',
        body: `You are now a co-host for "${event.title}".`,
        data: { event_id: event.id },
      })
    } catch (e: any) {
      sentryError('addCohost', e)
      Alert.alert('Error', 'Something went wrong. Please try again.')
    } finally {
      setCohostAdding(false)
    }
  }

  async function removeCohost(cohostUserId: string) {
    if (!event) return
    setCohostRemoving(cohostUserId)
    try {
      const { error } = await supabase.from('event_cohosts')
        .delete()
        .eq('event_id', event.id)
        .eq('user_id', cohostUserId)
      if (error) throw error
      setCohosts(prev => prev.filter(c => c.user_id !== cohostUserId))
    } catch (e: any) {
      sentryError('removeCohost', e)
      Alert.alert('Error', 'Something went wrong. Please try again.')
    } finally {
      setCohostRemoving(null)
    }
  }

  async function fetchMyCheers() {
    if (!userId) return
    setCheersLoading(true)
    const { data } = await supabase
      .from('cheers')
      .select('*')
      .eq('event_id', id)
      .eq('giver_id', userId)
    setMyCheersGiven((data ?? []) as Cheer[])
    setCheersLoading(false)
  }

  /** Toggle a cheer: if already pending → unstage; if already submitted → remove from DB; else → stage. */
  function toggleCheer(receiverId: string, cheerType: CheerType) {
    const totalGiven = myCheersGiven.length + pendingCheers.length
    const isPending = pendingCheers.some(p => p.receiverId === receiverId && p.cheerType === cheerType)
    const isSubmitted = myCheersGiven.some(k => k.receiver_id === receiverId && k.cheer_type === cheerType)

    if (isPending) {
      setPendingCheers(prev => prev.filter(p => !(p.receiverId === receiverId && p.cheerType === cheerType)))
    } else if (isSubmitted) {
      void revokeSubmittedCheer(receiverId, cheerType)
    } else if (totalGiven < CHEERS_MAX_PER_EVENT) {
      setPendingCheers(prev => [...prev, { receiverId, cheerType }])
    }
  }

  async function revokeSubmittedCheer(receiverId: string, cheerType: CheerType) {
    if (!userId) return
    const removed = myCheersGiven.find(k => k.receiver_id === receiverId && k.cheer_type === cheerType)
    setMyCheersGiven(prev => prev.filter(k => !(k.receiver_id === receiverId && k.cheer_type === cheerType)))
    const { error } = await supabase.from('cheers').delete()
      .eq('event_id', id).eq('giver_id', userId).eq('receiver_id', receiverId).eq('cheer_type', cheerType)
    if (error) {
      if (removed) setMyCheersGiven(prev => [...prev, removed])
      Alert.alert('Error', error.message)
    }
  }

  async function submitCheers() {
    if (!userId || pendingCheers.length === 0) return
    setSubmittingCheers(true)
    setCheerSubmitError(null)
    const rows = pendingCheers.map(p => ({
      event_id: id,
      giver_id: userId,
      receiver_id: p.receiverId,
      cheer_type: p.cheerType,
    }))
    const { data, error } = await supabase.from('cheers').insert(rows).select()
    setSubmittingCheers(false)
    if (error) {
      Sentry.captureException(error, { extra: { context: 'submitCheers', eventId: id } })
      setCheerSubmitError(error.message)
      return
    }
    setMyCheersGiven(prev => [...prev, ...(data ?? [])])
    setPendingCheers([])
    setCheersSent(true)
    setTimeout(() => setCheersSent(false), 3000)
  }

  async function resetCheers() {
    if (!userId || (myCheersGiven.length === 0 && pendingCheers.length === 0)) return
    const snapshotKudos = [...myCheersGiven]
    setMyCheersGiven([])
    setPendingCheers([])
    if (snapshotKudos.length > 0) {
      const { error } = await supabase.from('cheers').delete()
        .eq('event_id', id).eq('giver_id', userId)
      if (error) {
        setMyCheersGiven(snapshotKudos)
        Alert.alert('Error', error.message)
      }
    }
  }

  async function refreshComments() {
    const { data, error } = await supabase
      .from('event_comments')
      .select(
        'id, event_id, body, is_announcement, created_at, user_id, profiles!event_comments_user_id_fkey (id, username, first_name, last_name, avatar_url, selected_border)',
      )
      .eq('event_id', id)
      .order('created_at', { ascending: true })
    if (error) {
      Alert.alert('Error', error.message)
      return
    }
    setComments((data ?? []) as unknown as EventCommentWithAuthor[])
  }

  async function handlePostComment(body: string, isAnnouncement: boolean, mentionIds: string[]) {
    if (!userId) return
    if (body.length > EVENT_COMMENT_MAX_LEN) {
      Alert.alert('Comment too long', `Please keep comments under ${EVENT_COMMENT_MAX_LEN} characters.`)
      throw new Error('comment_too_long')
    }
    setPostingComment(true)
    try {
      const { error } = await supabase.from('event_comments').insert({
        event_id: id,
        user_id: userId,
        body,
        is_announcement: Boolean(isHostOrCohost && isAnnouncement),
        mentions: mentionIds,
      })
      if (error) throw error
      await refreshComments()
      scrollDiscussionToBottom(true)
    } catch (e: any) {
      sentryError('postComment', e)
      Alert.alert('Error', 'Could not post comment. Please try again.')
      throw e
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

    const attendingRows = (rows ?? []).filter((a: any) => a.status === 'attending')
    const waitlistRows = [...(rows ?? []).filter((a: any) => a.status === 'waitlisted')]
      .sort((a: any, b: any) => new Date(a.joined_at).getTime() - new Date(b.joined_at).getTime())
    const requestedRows = [...(rows ?? []).filter((a: any) => a.status === 'requested')]
      .sort((a: any, b: any) => new Date(a.joined_at).getTime() - new Date(b.joined_at).getTime())

    const attendeeIds = attendingRows.map((a: any) => a.user_id)
    const waitlistIds = waitlistRows.map((a: any) => a.user_id)
    const requestedIds = requestedRows.map((a: any) => a.user_id)
    const allProfileIds = [...new Set([...attendeeIds, ...waitlistIds, ...requestedIds])]
    const profilesMap = new Map<string, Profile>()
    if (allProfileIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, username, first_name, last_name, avatar_url, position')
        .in('id', allProfileIds)
      for (const p of profiles ?? []) profilesMap.set((p as any).id, p as Profile)
    }
    setAttendees(attendeeIds.map(uid => profilesMap.get(uid)).filter(Boolean) as Profile[])
    setWaitlistProfiles(waitlistIds.map(uid => profilesMap.get(uid)).filter(Boolean) as Profile[])
    setRequestedProfiles(requestedIds.map(uid => profilesMap.get(uid)).filter(Boolean) as Profile[])

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
      sentryInfo(`event:${action}`, { eventTitle: event?.title })

      if (action === 'join' && currentUserProfile) {
        setAttendees(prev => [...prev, currentUserProfile])
        setAssignments(prev => ({ ...prev, [userId]: { team: null, pinned: false } }))
        setEvent(prev => prev ? {
          ...prev,
          event_attendees: [...(prev.event_attendees ?? []), { event_id: id, user_id: userId, joined_at: new Date().toISOString(), team_number: null, team_pinned: false, status: 'attending', profiles: currentUserProfile }],
        } as EventWithDetails : prev)
      } else if (action === 'leave') {
        setAttendees(prev => prev.filter(p => p.id !== userId))
        setAssignments(prev => { const next = { ...prev }; delete next[userId]; return next })
        setEvent(prev => prev ? {
          ...prev,
          event_attendees: (prev.event_attendees ?? []).filter((a: any) => a.user_id !== userId),
        } as EventWithDetails : prev)
      }
    } catch (e: any) {
      sentryError('handleToggleAttendance', e, { action })
      Alert.alert('Error', 'Something went wrong. Please try again.')
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
      sentryInfo('event:join_waitlist', { eventTitle: event?.title })
      if (currentUserProfile) {
        setWaitlistProfiles(prev => [...prev, currentUserProfile])
        setEvent(prev => prev ? {
          ...prev,
          event_attendees: [...(prev.event_attendees ?? []), { event_id: id, user_id: userId, joined_at: new Date().toISOString(), team_number: null, team_pinned: false, status: 'waitlisted', profiles: currentUserProfile }],
        } as EventWithDetails : prev)
      }
    } catch (e: any) {
      sentryError('handleJoinWaitlist', e)
      Alert.alert('Error', 'Something went wrong. Please try again.')
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
      sentryInfo('event:leave_waitlist', { eventTitle: event?.title })
      setWaitlistProfiles(prev => prev.filter(p => p.id !== userId))
      setEvent(prev => prev ? {
        ...prev,
        event_attendees: (prev.event_attendees ?? []).filter((a: any) => a.user_id !== userId),
      } as EventWithDetails : prev)
    } catch (e: any) {
      sentryError('handleLeaveWaitlist', e)
      Alert.alert('Error', 'Something went wrong. Please try again.')
    } finally {
      setJoining(false)
    }
  }

  // ─── Paid event request flow ─────────────────────────────────────────────────

  async function handleRequestToJoin() {
    if (!userId) return
    try {
      setJoining(true)
      const { error } = await supabase.from('event_attendees').insert({ event_id: id, user_id: userId, status: 'requested' })
      if (error) throw error
      sentryInfo('event:request_join', { eventTitle: event?.title })
      if (event?.created_by && event.created_by !== userId) {
        await supabase.from('notifications').insert({
          user_id: event.created_by,
          notification_type: 'join_request',
          title: 'New join request',
          body: `Someone requested to join "${event.title}"`,
          data: { event_id: id, requester_id: userId },
        })
      }
      setEvent(prev => prev ? {
        ...prev,
        event_attendees: [...(prev.event_attendees ?? []), { event_id: id, user_id: userId, joined_at: new Date().toISOString(), team_number: null, team_pinned: false, status: 'requested' }],
      } as EventWithDetails : prev)
    } catch (e: any) {
      sentryError('handleRequestToJoin', e)
      Alert.alert('Error', 'Something went wrong. Please try again.')
    } finally {
      setJoining(false)
    }
  }

  async function handleCancelRequest() {
    if (!userId) return
    try {
      setJoining(true)
      const { error } = await supabase.from('event_attendees').delete().eq('event_id', id).eq('user_id', userId)
      if (error) throw error
      sentryInfo('event:cancel_request', { eventTitle: event?.title })
      setEvent(prev => prev ? {
        ...prev,
        event_attendees: (prev.event_attendees ?? []).filter((a: any) => a.user_id !== userId),
      } as EventWithDetails : prev)
    } catch (e: any) {
      sentryError('handleCancelRequest', e)
      Alert.alert('Error', 'Something went wrong. Please try again.')
    } finally {
      setJoining(false)
    }
  }

  async function handleApproveRequest(requestedUserId: string) {
    try {
      setProcessingRequest(requestedUserId)
      const { error } = await supabase.from('event_attendees')
        .update({ status: 'attending', denial_reason: null })
        .eq('event_id', id).eq('user_id', requestedUserId)
      if (error) throw error
      sentryInfo('event:approve_request', { approvedUserId: requestedUserId, eventTitle: event?.title })
      await supabase.from('notifications').insert({
        user_id: requestedUserId,
        notification_type: 'request_approved',
        title: 'Request approved',
        body: `Your request to join "${event?.title}" was approved`,
        data: { event_id: id },
      })
      const profile = requestedProfiles.find(p => p.id === requestedUserId)
      setRequestedProfiles(prev => prev.filter(p => p.id !== requestedUserId))
      if (profile) {
        setAttendees(prev => [...prev, profile])
        setAssignments(prev => ({ ...prev, [requestedUserId]: { team: null, pinned: false } }))
      }
      setEvent(prev => prev ? {
        ...prev,
        event_attendees: (prev.event_attendees ?? []).map((a: any) =>
          a.user_id === requestedUserId ? { ...a, status: 'attending', denial_reason: null } : a
        ),
      } as EventWithDetails : prev)
    } catch (e: any) {
      sentryError('handleApproveRequest', e, { requestedUserId })
      Alert.alert('Error', 'Something went wrong. Please try again.')
    } finally {
      setProcessingRequest(null)
    }
  }

  async function handleDenyRequest(requestedUserId: string, reason: string) {
    try {
      setProcessingRequest(requestedUserId)
      const trimmedReason = reason.trim() || null
      const { error } = await supabase.from('event_attendees')
        .update({ status: 'denied', denial_reason: trimmedReason })
        .eq('event_id', id).eq('user_id', requestedUserId)
      if (error) throw error
      sentryInfo('event:deny_request', { deniedUserId: requestedUserId, eventTitle: event?.title })
      await supabase.from('notifications').insert({
        user_id: requestedUserId,
        notification_type: 'request_denied',
        title: 'Request denied',
        body: trimmedReason
          ? `Your request to join "${event?.title}" was denied: ${trimmedReason}`
          : `Your request to join "${event?.title}" was denied`,
        data: { event_id: id, denial_reason: trimmedReason },
      })
      setRequestedProfiles(prev => prev.filter(p => p.id !== requestedUserId))
      setEvent(prev => prev ? {
        ...prev,
        event_attendees: (prev.event_attendees ?? []).map((a: any) =>
          a.user_id === requestedUserId ? { ...a, status: 'denied', denial_reason: trimmedReason } : a
        ),
      } as EventWithDetails : prev)
      setDenyModal(null)
      setDenyReason('')
    } catch (e: any) {
      sentryError('handleDenyRequest', e, { requestedUserId })
      Alert.alert('Error', e.message)
    } finally {
      setProcessingRequest(null)
    }
  }

  async function handleRerequest() {
    if (!userId) return
    try {
      setJoining(true)
      const { error: delErr } = await supabase.from('event_attendees').delete().eq('event_id', id).eq('user_id', userId)
      if (delErr) throw delErr
      const { error: insErr } = await supabase.from('event_attendees').insert({ event_id: id, user_id: userId, status: 'requested' })
      if (insErr) throw insErr
      sentryInfo('event:rerequest_join', { eventTitle: event?.title })
      if (event?.created_by && event.created_by !== userId) {
        await supabase.from('notifications').insert({
          user_id: event.created_by,
          notification_type: 'join_request',
          title: 'New join request',
          body: `Someone re-requested to join "${event.title}"`,
          data: { event_id: id, requester_id: userId },
        })
      }
      setEvent(prev => prev ? {
        ...prev,
        event_attendees: [
          ...(prev.event_attendees ?? []).filter((a: any) => a.user_id !== userId),
          { event_id: id, user_id: userId, joined_at: new Date().toISOString(), team_number: null, team_pinned: false, status: 'requested' },
        ],
      } as EventWithDetails : prev)
    } catch (e: any) {
      sentryError('handleRerequest', e)
      Alert.alert('Error', e.message)
    } finally {
      setJoining(false)
    }
  }

  async function handleAddGuest() {
    if (!userId || !guestFirstName.trim() || !guestLastName.trim()) return
    try {
      setAddingGuest(true)
      const attendingCount = eventAttendeeRows(event ?? { event_attendees: [] }).filter(a => a.status === 'attending').length + guests.length
      const isFull = event?.max_attendees ? attendingCount >= event.max_attendees : false
      const status = isFull ? 'waitlisted' : 'attending'
      const { data, error } = await supabase.from('event_guests').insert({
        event_id: id,
        added_by: userId,
        first_name: guestFirstName.trim(),
        last_name: guestLastName.trim(),
        status,
      }).select().single()
      if (error) throw error
      const newGuest = data as EventGuest
      if (status === 'attending') {
        setGuests(prev => [...prev, newGuest])
        setAssignments(prev => ({ ...prev, [newGuest.id]: { team: null, pinned: false } }))
      } else {
        setWaitlistGuests(prev => [...prev, newGuest])
      }
      if (currentUserProfile && !adderUsernames[userId]) {
        setAdderUsernames(prev => ({ ...prev, [userId]: currentUserProfile.username }))
      }
      setGuestFirstName('')
      setGuestLastName('')
      setGuestModalVisible(false)
    } catch (e: any) {
      sentryError('handleAddGuest', e)
      Alert.alert('Error', 'Something went wrong. Please try again.')
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
          sentryError('confirmRemoveFromModal:guest', error, { guestId: removeModal.guestId })
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
          sentryError('confirmRemoveFromModal:attendee', error, { removedUserId: removeModal.userId })
          Alert.alert('Error', error.message)
          return
        }
        if (!data?.length) {
          sentryError('confirmRemoveFromModal:attendee', new Error('Delete returned empty — missing RLS policy'), { removedUserId: removeModal.userId })
          Alert.alert(
            'Could not remove',
            'Nothing was deleted. As host, add the Supabase policy so hosts can remove other attendees — run supabase/event_host_remove_attendees.sql in the SQL editor.'
          )
          return
        }
      }
      if (removeModal.kind === 'guest') {
        setGuests(prev => prev.filter(g => g.id !== removeModal.guestId))
        setWaitlistGuests(prev => prev.filter(g => g.id !== removeModal.guestId))
        setAssignments(prev => { const next = { ...prev }; delete next[removeModal.guestId]; return next })
      } else {
        setAttendees(prev => prev.filter(p => p.id !== removeModal.userId))
        setWaitlistProfiles(prev => prev.filter(p => p.id !== removeModal.userId))
        setAssignments(prev => { const next = { ...prev }; delete next[removeModal.userId]; return next })
        setEvent(prev => prev ? {
          ...prev,
          event_attendees: (prev.event_attendees ?? []).filter((a: any) => a.user_id !== removeModal.userId),
        } as EventWithDetails : prev)
      }
      setRemoveModal(null)
    } finally {
      setRemovingAttendee(false)
    }
  }

  async function handleApproveFromWaitlist(waitlistUserId: string) {
    const attendingCount = eventAttendeeRows(event ?? { event_attendees: [] }).filter(a => a.status === 'attending').length
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
      const promoted = waitlistProfiles.find(p => p.id === waitlistUserId)
      if (promoted) {
        setWaitlistProfiles(prev => prev.filter(p => p.id !== waitlistUserId))
        setAttendees(prev => [...prev, promoted])
        setAssignments(prev => ({ ...prev, [waitlistUserId]: { team: null, pinned: false } }))
        setEvent(prev => prev ? {
          ...prev,
          event_attendees: (prev.event_attendees ?? []).map((a: any) =>
            a.user_id === waitlistUserId ? { ...a, status: 'attending' } : a
          ),
        } : prev)
      }
    } catch (e: any) {
      sentryError('handleApproveFromWaitlist', e, { promotedUserId: waitlistUserId })
      Alert.alert('Error', 'Something went wrong. Please try again.')
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
      sentryError('confirmDelete', e)
      Alert.alert('Error', 'Could not delete event. Please try again.')
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

      setEvent(prev => prev ? {
        ...prev,
        event_attendees: (prev.event_attendees ?? []).map((a: any) => {
          const asgn = assignments[a.user_id]
          return asgn ? { ...a, team_number: asgn.team, team_pinned: asgn.pinned } : a
        }),
      } : prev)
      setGuests(prev => prev.map(g => {
        const asgn = assignments[g.id]
        return asgn ? { ...g, team_number: asgn.team ?? undefined, team_pinned: asgn.pinned } : g
      }) as EventGuest[])
    } catch (e: any) {
      sentryError('saveTeams', e)
      Alert.alert('Error', 'Could not save teams. Please try again.')
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
    // Use back() first — it cleanly pops the event screen off the stack, preventing stale
    // screens from causing subsequent pushes to load the wrong event.
    // Fall back to replace(from) only for direct URL access where canGoBack() is false.
    if (router.canGoBack()) {
      router.back()
    } else if (from) {
      router.replace(decodeURIComponent(from) as any)
    } else {
      router.replace('/(app)/(tabs)')
    }
  }

  // ─── Sentry helpers ──────────────────────────────────────────────────────────
  function sentryInfo(message: string, extra?: Record<string, unknown>) {
    Sentry.addBreadcrumb({ category: 'event', message, level: 'info', data: { userId, eventId: id, ...extra } })
  }
  function sentryError(context: string, e: any, extra?: Record<string, unknown>) {
    Sentry.captureException(e instanceof Error ? e : new Error(e?.message ?? String(e)), {
      extra: { context, userId, eventId: id, ...extra },
    })
  }

  const isOwner = event?.created_by === userId
  const isCohost = cohosts.some(c => c.user_id === userId)
  const isHostOrCohost = isOwner || isCohost

  // All profiles that can be @mentioned: attendees + cohosts + host, excluding self.
  const mentionableUsers = useMemo<MentionUser[]>(() => {
    const seen = new Set<string>()
    const result: MentionUser[] = []
    const add = (p: Profile | null | undefined) => {
      if (!p || seen.has(p.id) || p.id === userId) return
      seen.add(p.id)
      result.push({ id: p.id, username: p.username, displayName: profileDisplayName(p) })
    }
    attendees.forEach(add)
    cohosts.forEach(c => add(c.profiles as Profile))
    if (event?.profiles) add(event.profiles as Profile)
    return result
  }, [attendees, cohosts, event, userId])

  // username → profile ID map used by EventCommentRow to render tappable mentions.
  const usernameToId = useMemo(() => {
    const m = new Map<string, string>()
    const add = (p: Profile | null | undefined) => { if (p?.username) m.set(p.username, p.id) }
    attendees.forEach(add)
    cohosts.forEach(c => add(c.profiles as Profile))
    if (event?.profiles) add(event.profiles as Profile)
    return m
  }, [attendees, cohosts, event])
  const isEventOver = event
    ? Date.now() > new Date(/[Z+]/.test(event.event_date) ? event.event_date : event.event_date + 'Z').getTime() + (event.duration_minutes ?? 120) * 60_000
    : false
  const totalPlayers = attendees.length + guests.length
  const hasTeams = isHostOrCohost
    ? totalPlayers > 0
    : Object.values(assignments).some(a => a.team !== null)

  const attendeeRows = event ? eventAttendeeRows(event) : []
  const attendingEntries = attendeeRows.filter((a: any) => a.status === 'attending')
  const waitlistEntries = [...attendeeRows.filter((a: any) => a.status === 'waitlisted')]
    .sort((a: any, b: any) => new Date(a.joined_at).getTime() - new Date(b.joined_at).getTime())
  const waitlistIdx = waitlistEntries.findIndex((a: any) => a.user_id === userId)
  const totalAttending = attendingEntries.length + guests.length
  const myRequestEntry = attendeeRows.find((a: any) => a.user_id === userId && (a.status === 'requested' || a.status === 'denied'))
  const isPaidEvent = (event?.price ?? 0) > 0
  const eventStatus: AttendanceStatus = {
    count: totalAttending,
    spotsLeft: event?.max_attendees ? event.max_attendees - totalAttending : null,
    isFull: event?.max_attendees ? totalAttending >= event.max_attendees : false,
    isAttending: attendingEntries.some((a: any) => a.user_id === userId),
    isOwner: isHostOrCohost,
    isWaitlisted: waitlistIdx !== -1,
    waitlistPosition: waitlistIdx !== -1 ? waitlistIdx + 1 : null,
    waitlistCount: waitlistEntries.length,
    isRequested: myRequestEntry?.status === 'requested',
    isDenied: myRequestEntry?.status === 'denied',
    denialReason: myRequestEntry?.status === 'denied' ? (myRequestEntry.denial_reason ?? null) : null,
  }

  return (
    <View
      ref={containerRef}
      style={{ flex: 1 }}
      pointerEvents={(removeModal !== null || denyModal !== null) ? 'none' : 'auto'}
      onLayout={() => { measureContainerOffset() }}
    >
      <Stack.Screen options={{ headerShown: false, gestureEnabled: true }} />

      {/* Web-only page header: back + actions */}
      {Platform.OS === 'web' && (
        <View style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: theme.spacing.md,
          paddingVertical: theme.spacing.xs,
          zIndex: 10,
          backgroundColor: theme.colors.background,
          gap: 4,
        }}>
          <Pressable
            onPress={goBack}
            style={({ pressed }) => ({
              width: 36, height: 36, borderRadius: 18,
              alignItems: 'center', justifyContent: 'center',
              backgroundColor: pressed ? theme.colors.primary + '14' : 'transparent',
              flexShrink: 0,
              zIndex: 1,
            })}
          >
            <Ionicons name="chevron-back" size={22} color={theme.colors.text} />
          </Pressable>
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', minWidth: 0 }}>
            <Text
              style={{
                textAlign: 'center',
                fontSize: 18,
                fontWeight: theme.font.weight.bold,
                color: theme.colors.primary,
                letterSpacing: -0.3,
              }}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {event?.title ?? ''}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
            <View>
              <Pressable
                onPress={handleShare}
                style={({ pressed }) => ({
                  width: 36, height: 36, borderRadius: 18,
                  alignItems: 'center', justifyContent: 'center',
                  backgroundColor: pressed ? theme.colors.primary + '14' : 'transparent',
                })}
              >
                <Ionicons name="share-outline" size={20} color={theme.colors.primary} />
              </Pressable>
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
            {isHostOrCohost && (<>
              <Pressable
                onPress={() => router.push(`/host?edit=${id}` as any)}
                style={({ pressed }) => ({
                  width: 36, height: 36, borderRadius: 18,
                  alignItems: 'center', justifyContent: 'center',
                  backgroundColor: pressed ? theme.colors.primary + '14' : 'transparent',
                })}
              >
                <Ionicons name="create-outline" size={20} color={theme.colors.primary} />
              </Pressable>
              <Pressable
                onPress={handleDelete}
                style={({ pressed }) => ({
                  width: 36, height: 36, borderRadius: 18,
                  alignItems: 'center', justifyContent: 'center',
                  backgroundColor: pressed ? theme.colors.error + '14' : 'transparent',
                })}
              >
                {deleting
                  ? <ActivityIndicator size="small" color={theme.colors.error} />
                  : <Ionicons name="trash-outline" size={20} color={theme.colors.error} />
                }
              </Pressable>
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
        <>
          {/* Fixed header: title + tabs — no separator, blends with background */}
          <View style={{ backgroundColor: theme.colors.background, paddingTop: Platform.OS !== 'web' ? insets.top + 52 : 0 }}>
            {/* Centered event title — native only (web header already shows it) */}
            {Platform.OS !== 'web' && (
              <Text
                style={{
                  textAlign: 'center',
                  fontSize: 26,
                  fontWeight: theme.font.weight.bold,
                  color: theme.colors.primary,
                  paddingHorizontal: theme.spacing.xl,
                  paddingTop: theme.spacing.sm,
                  paddingBottom: theme.spacing.md,
                  letterSpacing: -0.5,
                  lineHeight: 32,
                }}
                numberOfLines={2}
              >
                {event.title}
              </Text>
            )}

            {/* Tab labels */}
            <View style={{ flexDirection: 'row' }}>
              {(['Description', 'People', 'Discussion', 'Cheers'] as const).map((label, i) => (
                <TouchableOpacity
                  key={label}
                  onPress={() => { if (i !== 3) { setSelectedCheerType(null); setPendingCheers([]) } setActiveTab(i) }}
                  style={[
                    { flex: 1, alignItems: 'center', paddingVertical: 14 },
                    Platform.OS === 'web' && { outlineStyle: 'none' } as any,
                  ]}
                >
                  <Text style={{
                    fontSize: theme.font.size.sm,
                    fontWeight: activeTab === i ? theme.font.weight.bold : theme.font.weight.regular,
                    color: activeTab === i ? theme.colors.primary : theme.colors.subtext,
                  }}>
                    {label}
                  </Text>
                  {activeTab === i && (
                    <View style={{ position: 'absolute', bottom: 0, left: 12, right: 12, height: 3, backgroundColor: theme.colors.primary, borderRadius: 2 }} />
                  )}
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <Pager
            page={activeTab}
            onPageChange={next => {
              if (next !== 3) { setSelectedCheerType(null); setPendingCheers([]) }
              setActiveTab(next)
            }}
            pagerBlockedRef={innerPagerBlocked}
          >
            {/* Tab 0: Description */}
            <ScrollView
              style={shared.screen}
              contentContainerStyle={[shared.scrollContent, { paddingBottom: descFooterHeight + Math.max(insets.bottom, theme.spacing.md) }]}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={theme.colors.primary} />}
            >

              {/* ── Tags + capacity ── */}
              <View style={{ marginBottom: theme.spacing.md }}>

                {/* Tag chips */}
                {(event.event_tags?.filter(et => et.tags.category !== 'skill_level').length ?? 0) > 0 && (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: theme.spacing.sm }}>
                    {[...(event.event_tags ?? [])].filter(et => et.tags.category !== 'skill_level').sort((a, b) => a.tags.display_order - b.tags.display_order).map(et => {
                      const name = et.tags.name.toLowerCase()
                      const isOpenPlay   = name.includes('open play') || name.includes('open-play')
                      const isTournament = name.includes('tournament')
                      const bg     = isOpenPlay ? theme.colors.success + '1A' : isTournament ? theme.colors.warning + '1A' : theme.colors.primary + '1A'
                      const border = isOpenPlay ? theme.colors.success + '40' : isTournament ? theme.colors.warning + '40' : theme.colors.primary + '40'
                      const color  = isOpenPlay ? theme.colors.success : isTournament ? theme.colors.warning : theme.colors.primary
                      return (
                        <View key={et.tag_id} style={{ paddingHorizontal: 10, paddingVertical: 3, borderRadius: theme.radius.full, backgroundColor: bg, borderWidth: 1, borderColor: border }}>
                          <Text style={{ fontSize: theme.font.size.sm, fontWeight: theme.font.weight.semibold, color }}>{et.tags.name}</Text>
                        </View>
                      )
                    })}
                  </View>
                )}

                {/* Capacity bar + status badge */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, flexWrap: 'wrap' }}>
                  {event.max_attendees ? (
                    <View style={{ flex: 1, minWidth: 160, gap: 5 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                        <Text style={{ fontSize: theme.font.size.sm, color: eventStatus.isFull ? theme.colors.error : theme.colors.subtext }}>
                          {eventStatus.isFull ? 'Full' : `${eventStatus.spotsLeft} spot${eventStatus.spotsLeft !== 1 ? 's' : ''} left`}
                        </Text>
                        <Text style={{ fontSize: theme.font.size.sm, color: theme.colors.subtext }}>{totalAttending}/{event.max_attendees}</Text>
                      </View>
                      <View style={{ height: 5, backgroundColor: theme.colors.border, borderRadius: 3 }}>
                        <View style={{
                          height: 5,
                          width: `${Math.round(Math.min(1, totalAttending / event.max_attendees) * 100)}%`,
                          backgroundColor: eventStatus.isFull ? theme.colors.error : (totalAttending / event.max_attendees) >= 0.85 ? theme.colors.warning : theme.colors.primary,
                          borderRadius: 3,
                        }} />
                      </View>
                    </View>
                  ) : (
                    <Text style={{ fontSize: theme.font.size.sm, color: theme.colors.subtext }}>{totalAttending} attending</Text>
                  )}
                  {eventStatus.isAttending && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: theme.radius.full, backgroundColor: theme.colors.success + '1A', borderWidth: 1, borderColor: theme.colors.success + '40' }}>
                      <Ionicons name="checkmark-circle" size={13} color={theme.colors.success} />
                      <Text style={{ fontSize: theme.font.size.xs, fontWeight: theme.font.weight.semibold, color: theme.colors.success }}>You're going</Text>
                    </View>
                  )}
                  {eventStatus.isWaitlisted && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: theme.radius.full, backgroundColor: theme.colors.warning + '1A', borderWidth: 1, borderColor: theme.colors.warning + '40' }}>
                      <Text style={{ fontSize: theme.font.size.xs, fontWeight: theme.font.weight.semibold, color: theme.colors.warning }}>#{eventStatus.waitlistPosition} on waitlist</Text>
                    </View>
                  )}
                </View>
              </View>

              {/* ── Info rows ── */}
              <View style={[shared.card, { gap: 0, marginBottom: theme.spacing.md }]}>

                {/* Date / time row */}
                {(() => {
                  const normalized = /[Z+]/.test(event.event_date) ? event.event_date : event.event_date + 'Z'
                  const d = new Date(normalized)
                  const dateStr = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
                  const startStr = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
                  const endStr = formatEndTime(event.event_date, event.duration_minutes ?? 120)
                  const dur = formatDuration(event.duration_minutes ?? 120)
                  return (
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing.md, paddingBottom: theme.spacing.md }}>
                  <View style={{ width: 36, height: 36, borderRadius: theme.radius.sm, backgroundColor: theme.colors.primary + '14', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Ionicons name="calendar-outline" size={18} color={theme.colors.primary} />
                  </View>
                  <View style={{ flex: 1, gap: theme.spacing.xs, paddingTop: 2 }}>
                    <Text style={{ fontSize: theme.font.size.md, fontWeight: theme.font.weight.semibold, color: theme.colors.text }}>
                      {dateStr}
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs }}>
                      <Ionicons name="time-outline" size={13} color={theme.colors.subtext} />
                      <Text style={{ fontSize: theme.font.size.sm, color: theme.colors.subtext }}>
                        {startStr} – {endStr}
                      </Text>
                      <View style={{ width: 3, height: 3, borderRadius: 2, backgroundColor: theme.colors.border, marginHorizontal: 2 }} />
                      <Text style={{ fontSize: theme.font.size.sm, color: theme.colors.subtext }}>{dur}</Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => void addToCalendar(
                        event.title,
                        event.event_date,
                        event.duration_minutes ?? 120,
                        LOCATIONS.find(l => l.id === event.location)?.address,
                      )}
                      hitSlop={8}
                      accessibilityRole="button"
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}
                    >
                      <Text style={{ fontSize: theme.font.size.sm, color: theme.colors.primary, fontWeight: theme.font.weight.medium }}>
                        Add to calendar
                      </Text>
                      <Ionicons name="arrow-forward" size={12} color={theme.colors.primary} />
                    </TouchableOpacity>
                  </View>
                </View>
                  )
                })()}

                {/* Location row */}
                {event.location ? (() => {
                  const venue = LOCATIONS.find(l => l.label === event.location || l.id === event.location)
                  const address = venue?.address
                  const mapsQuery = venue && address ? `${venue.label} ${address}` : address ?? event.location
                  return (
                    <>
                      <View style={{ height: 1, backgroundColor: theme.colors.border }} />
                      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing.md, paddingVertical: theme.spacing.md }}>
                        <View style={{ width: 36, height: 36, borderRadius: theme.radius.sm, backgroundColor: theme.colors.primary + '14', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <Ionicons name="location-outline" size={18} color={theme.colors.primary} />
                        </View>
                        <View style={{ flex: 1, paddingTop: 2 }}>
                          <Text style={{ fontSize: theme.font.size.md, fontWeight: theme.font.weight.semibold, color: theme.colors.text }}>
                            {venue ? venue.label : event.location}
                          </Text>
                          {address && (
                            <Text selectable style={[shared.caption, { marginTop: 2 }]}>{address}</Text>
                          )}
                          <TouchableOpacity
                            onPress={() => openInMaps(mapsQuery)}
                            hitSlop={8}
                            accessibilityRole="link"
                            style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: theme.spacing.xs }}
                          >
                            <Text style={{ fontSize: theme.font.size.sm, color: theme.colors.primary, fontWeight: theme.font.weight.medium }}>
                              Show in Maps
                            </Text>
                            <Ionicons name="arrow-forward" size={12} color={theme.colors.primary} />
                          </TouchableOpacity>
                        </View>
                      </View>
                    </>
                  )
                })() : null}

                {/* Difficulty row */}
                {(() => {
                  const diffTags = (event.event_tags ?? [])
                    .filter(et => et.tags.category === 'skill_level')
                    .sort((a, b) => a.tags.display_order - b.tags.display_order)
                  if (diffTags.length === 0) return null
                  return (
                    <>
                      <View style={{ height: 1, backgroundColor: theme.colors.border }} />
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md, paddingVertical: theme.spacing.md }}>
                        <View style={{ width: 36, height: 36, borderRadius: theme.radius.sm, backgroundColor: theme.colors.primary + '14', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <Ionicons name="speedometer-outline" size={18} color={theme.colors.primary} />
                        </View>
                        <View style={{ flex: 1, gap: 6 }}>
                          <Text style={{ fontSize: theme.font.size.xs, fontWeight: theme.font.weight.semibold, color: theme.colors.subtext, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                            Difficulty
                          </Text>
                          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                            {diffTags.map(et => (
                              <View key={et.tag_id} style={{ paddingHorizontal: 10, paddingVertical: 3, borderRadius: theme.radius.full, backgroundColor: theme.colors.primary + '14', borderWidth: 1, borderColor: theme.colors.primary + '30' }}>
                                <Text style={{ fontSize: theme.font.size.sm, fontWeight: theme.font.weight.semibold, color: theme.colors.primary }}>
                                  {et.tags.name}
                                </Text>
                              </View>
                            ))}
                          </View>
                        </View>
                      </View>
                    </>
                  )
                })()}

                {/* Price row */}
                <>
                  <View style={{ height: 1, backgroundColor: theme.colors.border }} />
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md, paddingVertical: theme.spacing.md }}>
                    <View style={{ width: 36, height: 36, borderRadius: theme.radius.sm, backgroundColor: theme.colors.primary + '14', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Ionicons name="cash-outline" size={18} color={theme.colors.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: theme.font.size.xs, fontWeight: theme.font.weight.semibold, color: theme.colors.subtext, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>
                        Price
                      </Text>
                      {event.price != null && event.price > 0 ? (
                        <Text style={{ fontSize: theme.font.size.md, fontWeight: theme.font.weight.semibold, color: theme.colors.text }}>
                          ${event.price % 1 === 0 ? event.price : event.price.toFixed(2)}
                        </Text>
                      ) : (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                          <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: theme.radius.full, backgroundColor: theme.colors.success + '1A', borderWidth: 1, borderColor: theme.colors.success + '40' }}>
                            <Text style={{ fontSize: theme.font.size.sm, fontWeight: theme.font.weight.semibold, color: theme.colors.success }}>Free</Text>
                          </View>
                        </View>
                      )}
                    </View>
                  </View>
                </>

                {/* Host(s) row */}
                {event.profiles && (
                  <>
                    <View style={{ height: 1, backgroundColor: theme.colors.border }} />
                    <View style={{ paddingTop: theme.spacing.md, paddingBottom: theme.spacing.sm, gap: theme.spacing.sm }}>
                      {/* Primary host */}
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
                        <View style={{ width: 36, height: 36, borderRadius: theme.radius.sm, backgroundColor: theme.colors.primary + '14', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <Ionicons name="person-outline" size={18} color={theme.colors.primary} />
                        </View>
                        <HostCard
                          profile={event.profiles as Profile}
                          isOwner={isOwner}
                          onPress={() => !isOwner && event.profiles && router.push(`/profile/${event.profiles.id}` as any)}
                          inline
                        />
                        <View style={{ backgroundColor: theme.colors.primary, borderRadius: theme.radius.sm, paddingHorizontal: 8, paddingVertical: 3 }}>
                          <Text style={{ fontSize: theme.font.size.xs, fontWeight: theme.font.weight.semibold, color: theme.colors.white }}>Host</Text>
                        </View>
                      </View>
                      {/* Cohosts */}
                      {cohosts.map(c => (
                        <View key={c.user_id} style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
                          <View style={{ width: 36 }} />
                          <HostCard
                            profile={c.profiles as unknown as Profile}
                            isOwner={c.user_id === userId}
                            onPress={() => c.user_id !== userId && router.push(`/profile/${c.user_id}` as any)}
                            inline
                          />
                          <View style={{ backgroundColor: theme.colors.subtext + '28', borderRadius: theme.radius.sm, paddingHorizontal: 8, paddingVertical: 3 }}>
                            <Text style={{ fontSize: theme.font.size.xs, fontWeight: theme.font.weight.semibold, color: theme.colors.subtext }}>Co-host</Text>
                          </View>
                        </View>
                      ))}
                      {/* Manage cohosts — primary host only */}
                      {isOwner && (
                        <TouchableOpacity
                          onPress={() => setCohostModalVisible(true)}
                          style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, paddingLeft: 36 + theme.spacing.md, paddingTop: theme.spacing.xs }}
                        >
                          <Ionicons name="person-add-outline" size={14} color={theme.colors.primary} />
                          <Text style={{ fontSize: theme.font.size.sm, color: theme.colors.primary, fontWeight: theme.font.weight.medium }}>
                            {cohosts.length >= 3 ? 'Manage Co-hosts' : 'Manage Co-hosts'}
                          </Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </>
                )}

                {/* Description row */}
                {event.description ? (
                  <>
                    <View style={{ height: 1, backgroundColor: theme.colors.border }} />
                    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing.md, paddingTop: theme.spacing.md, paddingBottom: theme.spacing.sm }}>
                      <View style={{ width: 36, height: 36, borderRadius: theme.radius.sm, backgroundColor: theme.colors.primary + '14', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Ionicons name="document-text-outline" size={18} color={theme.colors.primary} />
                      </View>
                      <LinkedText text={event.description} style={{ flex: 1, fontSize: theme.font.size.sm, color: theme.colors.text, lineHeight: 20, paddingTop: 10 }} />
                    </View>
                  </>
                ) : null}
              </View>

            </ScrollView>

            {/* Tab 1: People */}
            <ScrollView style={shared.screen} contentContainerStyle={shared.scrollContent}>
              {/* Going + Teams */}
              <View style={[shared.rowBetween, shared.mb_sm]}>
                <Text style={shared.subheading}>Going</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
                  <Text style={shared.caption}>
                    {eventStatus.count}{event.max_attendees ? ` / ${event.max_attendees}` : ''} people
                  </Text>
                  {eventStatus.isOwner && attendees.length > 0 && (
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
                        style={[styles.stepBtn, numTeams >= Math.min(6, attendees.length + guests.length) && styles.stepBtnDisabled]}
                        onPress={() => setNumTeams(t => Math.min(6, attendees.length + guests.length, t + 1))}
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
                        isOwner={eventStatus.isOwner}
                        onDragStart={(x, y) => handleDragStart(profile.id, x, y)}
                        onDragMove={handleDragMove}
                        onDragEnd={handleDragEnd}
                        onRemove={() => openRemoveAttendeeModal(profile)}
                        onTogglePin={() => togglePin(profile.id)}
                      />
                    )
                    if (eventStatus.isOwner) {
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
                          isOwner={eventStatus.isOwner}
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
              {eventStatus.isOwner && attendees.length > 0 && (
                <>
                  {(attendees.length + guests.length) % numTeams !== 0 && (
                    <Text style={[shared.caption, { marginTop: theme.spacing.sm, color: theme.colors.error }]}>
                      {attendees.length + guests.length} players can't be split into {numTeams} equal teams
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

              {/* Requested section — host/cohost only, paid events */}
              {isHostOrCohost && requestedProfiles.length > 0 && (
                <>
                  <View style={shared.divider} />
                  <View style={[shared.rowBetween, shared.mb_sm]}>
                    <Text style={shared.subheading}>Requested</Text>
                    <Text style={shared.caption}>{requestedProfiles.length} pending</Text>
                  </View>
                  <View style={{ gap: theme.spacing.xs }}>
                    {requestedProfiles.map(profile => (
                      <View key={profile.id} style={[shared.card, { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }]}>
                        <TouchableOpacity style={{ flex: 1, minWidth: 0 }} onPress={() => router.push(`/profile/${profile.id}` as any)}>
                          <Text style={shared.body}>{profileDisplayName(profile)}</Text>
                          <Text style={[shared.caption, { marginTop: 2 }]} numberOfLines={2}>
                            {hostRosterSkillAndPositionsLine(profile)}
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => handleApproveRequest(profile.id)}
                          disabled={processingRequest === profile.id}
                          style={{ paddingVertical: theme.spacing.xs, paddingHorizontal: theme.spacing.sm, backgroundColor: theme.colors.success, borderRadius: theme.radius.md }}
                        >
                          {processingRequest === profile.id
                            ? <ActivityIndicator size="small" color={theme.colors.white} />
                            : <Text style={{ color: theme.colors.white, fontSize: theme.font.size.sm, fontWeight: theme.font.weight.medium }}>Approve</Text>
                          }
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => { setDenyModal({ userId: profile.id, displayName: profileDisplayName(profile) }); setDenyReason('') }}
                          disabled={processingRequest === profile.id}
                          style={{ paddingVertical: theme.spacing.xs, paddingHorizontal: theme.spacing.sm, backgroundColor: theme.colors.error + '18', borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.error + '40' }}
                        >
                          <Text style={{ color: theme.colors.error, fontSize: theme.font.size.sm, fontWeight: theme.font.weight.medium }}>Deny</Text>
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                </>
              )}

              {/* Waitlist section */}
              {(eventStatus.waitlistCount > 0 || waitlistGuests.length > 0 || (eventStatus.isFull && !eventStatus.isAttending && !eventStatus.isWaitlisted)) && (
                <>
                  <View style={shared.divider} />
                  <View style={[shared.rowBetween, shared.mb_sm]}>
                    <Text style={shared.subheading}>Waitlist</Text>
                    <Text style={shared.caption}>{eventStatus.waitlistCount + waitlistGuests.length} waiting</Text>
                  </View>
                  {waitlistProfiles.length === 0 && waitlistGuests.length === 0 ? (
                    <Text style={shared.caption}>No one on the waitlist yet</Text>
                  ) : (
                    <View style={{ gap: theme.spacing.xs }}>
                      {waitlistProfiles.map((profile, idx) => (
                        <View key={profile.id} style={[shared.card, { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }]}>
                          <Text style={[shared.caption, { minWidth: 20, fontWeight: theme.font.weight.semibold, color: theme.colors.primary }]}>#{idx + 1}</Text>
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <Text style={shared.body}>{profileDisplayName(profile)}</Text>
                            {eventStatus.isOwner ? (
                              <Text style={[shared.caption, { marginTop: 2 }]} numberOfLines={2}>
                                {hostRosterSkillAndPositionsLine(profile)}
                              </Text>
                            ) : null}
                          </View>
                          {eventStatus.isOwner && (
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
                          {eventStatus.isOwner && (
                            <TouchableOpacity onPress={() => openRemoveGuestModal(g)} hitSlop={8}>
                              <Ionicons name="close" size={16} color={theme.colors.subtext} />
                            </TouchableOpacity>
                          )}
                        </View>
                      ))}
                    </View>
                  )}
                </>
              )}
            </ScrollView>

            {/* Tab 2: Discussion */}
            <View style={[shared.screen, { flex: 1, minHeight: 0 }]}>
              <ScrollView
                ref={discussionTabScrollRef}
                style={{ flex: 1 }}
                contentContainerStyle={{
                  flexGrow: 1,
                  justifyContent: 'flex-end',
                  paddingTop: theme.spacing.lg,
                  paddingHorizontal: theme.spacing.lg,
                  paddingBottom: theme.spacing.xs,
                }}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="interactive"
                onContentSizeChange={() => {
                  if (activeTab === 2) scrollDiscussionToBottom(false)
                }}
              >
                {commentsLoading && comments.length === 0 ? (
                  <View style={{ paddingVertical: theme.spacing.lg, alignItems: 'center' }}>
                    <ActivityIndicator color={theme.colors.primary} />
                  </View>
                ) : comments.length === 0 ? (
                  <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={shared.caption}>No messages yet. Be the first to comment.</Text>
                  </View>
                ) : (
                  <View style={{ gap: theme.spacing.xs }}>
                    {comments.map(c => (
                      <EventCommentRow key={c.id} comment={c} usernameToId={usernameToId} />
                    ))}
                  </View>
                )}
              </ScrollView>

              {userId ? (
                <View
                  style={{
                    paddingHorizontal: theme.spacing.lg,
                    paddingTop: theme.spacing.xs,
                    paddingBottom:
                      discussionTabKeyboardInset > 0
                        ? discussionTabKeyboardInset + theme.spacing.sm
                        : Math.max(insets.bottom, theme.spacing.md),
                  }}
                >
                  <View onLayout={(e) => setDiscussionTabComposerHeight(Math.ceil(e.nativeEvent.layout.height))}>
                    <DiscussionComposer
                      isOwner={isHostOrCohost}
                      postingComment={postingComment}
                      mentionableUsers={mentionableUsers}
                      onPost={handlePostComment}
                      onFocusScroll={() => discussionTabScrollRef.current?.scrollToEnd({ animated: true })}
                    />
                  </View>
                </View>
              ) : (
                <Text style={[shared.caption, { paddingTop: theme.spacing.sm, paddingBottom: theme.spacing.lg }]}>Sign in to join the discussion.</Text>
              )}
            </View>

            {/* Tab 3: Cheers */}
            <View style={[shared.screen, { flex: 1 }]}>
              {!isEventOver ? (
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: theme.spacing.xl }}>
                  <Ionicons name="time-outline" size={40} color={theme.colors.subtext} />
                  <Text style={[shared.subheading, { marginTop: theme.spacing.md, textAlign: 'center' }]}>Not available yet</Text>
                  <Text style={[shared.caption, { marginTop: theme.spacing.sm, textAlign: 'center' }]}>
                    Cheers open after the event ends.
                  </Text>
                </View>
              ) : !eventStatus.isAttending && !eventStatus.isOwner ? (
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: theme.spacing.xl }}>
                  <Ionicons name="lock-closed-outline" size={40} color={theme.colors.subtext} />
                  <Text style={[shared.subheading, { marginTop: theme.spacing.md, textAlign: 'center' }]}>Attendees only</Text>
                  <Text style={[shared.caption, { marginTop: theme.spacing.sm, textAlign: 'center' }]}>
                    Only people who attended this event can give cheers.
                  </Text>
                </View>
              ) : cheersLoading ? (
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                  <ActivityIndicator color={theme.colors.primary} />
                </View>
              ) : selectedCheerType === null ? (
                /* Step 1: Pick a cheer type */
                <ScrollView contentContainerStyle={[shared.scrollContent, { paddingBottom: insets.bottom + theme.spacing.lg }]}>
                  <View style={[shared.rowBetween, { marginBottom: theme.spacing.xs }]}>
                    <Text style={shared.subheading}>Give Cheers</Text>
                    {(myCheersGiven.length > 0 || pendingCheers.length > 0) && (
                      <TouchableOpacity onPress={resetCheers} hitSlop={8}>
                        <Text style={{ fontSize: theme.font.size.sm, color: theme.colors.subtext }}>Reset</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                  <Text style={[shared.caption, { marginBottom: theme.spacing.lg }]}>
                    {myCheersGiven.length + pendingCheers.length}/{CHEERS_MAX_PER_EVENT} selected · What do you want to recognize?
                  </Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
                    {CHEER_TYPES.map(kt => {
                      const submittedCount = myCheersGiven.filter(k => k.cheer_type === kt.type).length
                      const pendingCount = pendingCheers.filter(p => p.cheerType === kt.type).length
                      const totalCount = submittedCount + pendingCount
                      const totalGiven = myCheersGiven.length + pendingCheers.length
                      const atCap = totalGiven >= CHEERS_MAX_PER_EVENT && totalCount === 0
                      return (
                        <TouchableOpacity
                          key={kt.type}
                          onPress={() => !atCap ? setSelectedCheerType(kt.type) : null}
                          disabled={atCap}
                          style={{
                            width: '47%',
                            backgroundColor: totalCount > 0 ? theme.colors.primary + '12' : theme.colors.card,
                            borderWidth: 1.5,
                            borderColor: totalCount > 0 ? theme.colors.primary : theme.colors.border,
                            borderRadius: theme.radius.lg,
                            padding: theme.spacing.md,
                            alignItems: 'center',
                            gap: theme.spacing.xs,
                            opacity: atCap ? 0.4 : 1,
                          }}
                        >
                          <Ionicons
                            name={kt.icon as any}
                            size={28}
                            color={totalCount > 0 ? theme.colors.primary : theme.colors.subtext}
                          />
                          <Text style={{
                            fontSize: theme.font.size.sm,
                            fontWeight: theme.font.weight.semibold,
                            color: totalCount > 0 ? theme.colors.primary : theme.colors.text,
                            textAlign: 'center',
                          }}>
                            {kt.label}
                          </Text>
                          {totalCount > 0 && (
                            <Text style={{ fontSize: theme.font.size.xs, color: theme.colors.primary }}>
                              {totalCount} selected
                            </Text>
                          )}
                        </TouchableOpacity>
                      )
                    })}
                  </View>
                  {cheersSent ? (
                    <View style={{
                      marginTop: theme.spacing.lg,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: theme.spacing.sm,
                      paddingVertical: theme.spacing.md,
                      borderRadius: theme.radius.lg,
                      backgroundColor: theme.colors.primary + '12',
                      borderWidth: 1.5,
                      borderColor: theme.colors.primary + '40',
                    }}>
                      <Ionicons name="checkmark-circle" size={20} color={theme.colors.primary} />
                      <Text style={{ fontSize: theme.font.size.md, fontWeight: theme.font.weight.semibold, color: theme.colors.primary }}>
                        Cheers sent!
                      </Text>
                    </View>
                  ) : pendingCheers.length > 0 ? (
                    <View style={{ marginTop: theme.spacing.lg, gap: theme.spacing.sm }}>
                      {cheerSubmitError && (
                        <View style={{
                          flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm,
                          paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.sm,
                          borderRadius: theme.radius.md,
                          backgroundColor: theme.colors.error + '18',
                          borderWidth: 1, borderColor: theme.colors.error + '50',
                        }}>
                          <Ionicons name="alert-circle-outline" size={16} color={theme.colors.error} />
                          <Text style={{ fontSize: theme.font.size.sm, color: theme.colors.error, flex: 1 }}>
                            {cheerSubmitError}
                          </Text>
                        </View>
                      )}
                      <Button
                        label={submittingCheers ? 'Submitting…' : `Submit Cheers (${pendingCheers.length})`}
                        onPress={submitCheers}
                        loading={submittingCheers}
                      />
                    </View>
                  ) : null}
                </ScrollView>
              ) : (
                /* Step 2: Pick recipients for the selected cheer type */
                <View style={{ flex: 1 }}>
                  {/* Header */}
                  <View style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: theme.spacing.sm,
                    paddingHorizontal: theme.spacing.lg,
                    paddingTop: theme.spacing.md,
                    paddingBottom: theme.spacing.sm,
                    borderBottomWidth: 1,
                    borderBottomColor: theme.colors.border,
                  }}>
                    <TouchableOpacity onPress={() => setSelectedCheerType(null)} hitSlop={12}>
                      <Ionicons name="arrow-back" size={22} color={theme.colors.text} />
                    </TouchableOpacity>
                    <Ionicons
                      name={(CHEER_TYPES.find(k => k.type === selectedCheerType)?.icon ?? 'star-outline') as any}
                      size={18}
                      color={theme.colors.primary}
                    />
                    <Text style={[shared.subheading, { flex: 1 }]}>
                      {CHEER_TYPES.find(k => k.type === selectedCheerType)?.label}
                    </Text>
                    <Text style={shared.caption}>
                      {myCheersGiven.length + pendingCheers.length}/{CHEERS_MAX_PER_EVENT}
                    </Text>
                  </View>
                  {myCheersGiven.length + pendingCheers.length >= CHEERS_MAX_PER_EVENT ? (
                    <View style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: theme.spacing.sm,
                      marginHorizontal: theme.spacing.lg,
                      marginTop: theme.spacing.sm,
                      marginBottom: theme.spacing.xs,
                      paddingHorizontal: theme.spacing.md,
                      paddingVertical: theme.spacing.sm,
                      borderRadius: theme.radius.md,
                      backgroundColor: theme.colors.warning + '18',
                      borderWidth: 1.5,
                      borderColor: theme.colors.warning + '60',
                    }}>
                      <Ionicons name="warning" size={16} color={theme.colors.warning} />
                      <Text style={{ fontSize: theme.font.size.sm, color: theme.colors.warning, flex: 1 }}>
                        Limit reached ({CHEERS_MAX_PER_EVENT} cheers max). Deselect someone to swap.
                      </Text>
                    </View>
                  ) : (
                    <Text style={[shared.caption, { paddingHorizontal: theme.spacing.lg, paddingVertical: theme.spacing.sm }]}>
                      Who deserves it? Tap to select or deselect.
                    </Text>
                  )}
                  {attendees.filter(a => a.id !== userId).length === 0 ? (
                    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: theme.spacing.xl }}>
                      <Text style={shared.caption}>No other attendees.</Text>
                    </View>
                  ) : (
                    <ScrollView
                      contentContainerStyle={[shared.scrollContent, { paddingBottom: insets.bottom + theme.spacing.lg }]}
                      keyboardShouldPersistTaps="handled"
                    >
                      {(() => {
                        const others = attendees.filter(a => a.id !== userId)
                        const totalGiven = myCheersGiven.length + pendingCheers.length
                        function renderCheerCard(profile: Profile, teamColor: string | null) {
                          const hasGiven = myCheersGiven.some(k => k.receiver_id === profile.id && k.cheer_type === selectedCheerType)
                            || pendingCheers.some(p => p.receiverId === profile.id && p.cheerType === selectedCheerType)
                          const atCap = totalGiven >= CHEERS_MAX_PER_EVENT && !hasGiven
                          return (
                            <View key={profile.id} style={[styles.playerCell, isMobileWeb && { width: '50%' }]}>
                              <CheerPersonCard
                                profile={profile}
                                hasGiven={hasGiven}
                                disabled={atCap}
                                teamColor={teamColor}
                                onPress={() => toggleCheer(profile.id, selectedCheerType!)}
                              />
                            </View>
                          )
                        }
                        if (!hasTeams) {
                          return <View style={styles.playerGrid}>{others.map(p => renderCheerCard(p, null))}</View>
                        }
                        const unassigned = others.filter(p => !assignments[p.id]?.team)
                        return (
                          <View style={{ gap: theme.spacing.sm }}>
                            {Array.from({ length: numTeams }, (_, i) => i + 1).map(teamNum => {
                              const teamColor = TEAM_COLORS[(teamNum - 1) % TEAM_COLORS.length]
                              const members = others.filter(p => assignments[p.id]?.team === teamNum)
                              return (
                                <View key={teamNum}>
                                  <View style={styles.teamHeader}>
                                    <View style={[styles.teamDot, { backgroundColor: teamColor }]} />
                                    <Text style={[styles.teamHeading, { color: teamColor }]}>
                                      {TEAM_COLOR_NAMES[(teamNum - 1) % TEAM_COLOR_NAMES.length]} Team
                                    </Text>
                                  </View>
                                  {members.length === 0
                                    ? <Text style={[shared.caption, { paddingHorizontal: theme.spacing.xs }]}>No players</Text>
                                    : <View style={styles.playerGrid}>{members.map(p => renderCheerCard(p, teamColor))}</View>
                                  }
                                </View>
                              )
                            })}
                            {unassigned.length > 0 && (
                              <View>
                                <View style={styles.teamHeader}>
                                  <View style={[styles.teamDot, { backgroundColor: theme.colors.subtext }]} />
                                  <Text style={[styles.teamHeading, { color: theme.colors.subtext }]}>Unassigned</Text>
                                </View>
                                <View style={styles.playerGrid}>{unassigned.map(p => renderCheerCard(p, null))}</View>
                              </View>
                            )}
                          </View>
                        )
                      })()}
                    </ScrollView>
                  )}
                </View>
              )}
            </View>
          </Pager>

          {/* Sticky footer — join/leave/waitlist/+1, only shown on Description tab */}
          {activeTab === 0 && (
            <View
              onLayout={e => setDescFooterHeight(e.nativeEvent.layout.height)}
              style={{
                position: 'absolute', bottom: 0, left: 0, right: 0,
                paddingHorizontal: theme.spacing.lg,
                paddingTop: theme.spacing.sm,
                paddingBottom: Math.max(insets.bottom, theme.spacing.md),
                backgroundColor: theme.colors.background,
                borderTopWidth: 1,
                borderTopColor: theme.colors.border,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing.sm }}>
                <View style={{ flex: 1 }}>
                  {eventStatus.isAttending ? (
                    <Button label="Leave event" onPress={() => handleToggleAttendance('leave')} loading={joining} variant="secondary" />
                  ) : eventStatus.isWaitlisted ? (
                    <View style={{ gap: theme.spacing.xs }}>
                      <Button label="Leave Waitlist" onPress={handleLeaveWaitlist} loading={joining} variant="secondary" />
                      <Text style={[shared.caption, { textAlign: 'center' }]}>
                        You are #{eventStatus.waitlistPosition} on the waitlist
                      </Text>
                    </View>
                  ) : eventStatus.isRequested ? (
                    <View style={{ gap: theme.spacing.xs }}>
                      <Button label="Cancel Request" onPress={handleCancelRequest} loading={joining} variant="secondary" />
                      <Text style={[shared.caption, { textAlign: 'center' }]}>Pending host approval</Text>
                    </View>
                  ) : eventStatus.isDenied ? (
                    <View style={{ gap: theme.spacing.xs }}>
                      <Button label="Request Again" onPress={handleRerequest} loading={joining} />
                      <Text style={[shared.caption, { textAlign: 'center', color: theme.colors.error }]}>
                        Request denied{eventStatus.denialReason ? `: "${eventStatus.denialReason}"` : ''}
                      </Text>
                    </View>
                  ) : isPaidEvent ? (
                    <Button label="Request to Join" onPress={handleRequestToJoin} loading={joining} />
                  ) : eventStatus.isFull ? (
                    <Button label="Join Waitlist" onPress={handleJoinWaitlist} loading={joining} />
                  ) : (
                    <Button label="Join event" onPress={() => handleToggleAttendance('join')} loading={joining} />
                  )}
                </View>
                {(eventStatus.isAttending || eventStatus.isOwner) && (
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
            </View>
          )}
        </>
      )}

      <Modal
        visible={discussionDrawerOpen}
        transparent
        animationType="none"
        onRequestClose={runDiscussionDismissAnimations}
      >
        <View style={{ flex: 1, justifyContent: 'flex-end' }}>
          <Animated.View style={[StyleSheet.absoluteFillObject, discussionBackdropAnimStyle]} pointerEvents="box-none">
            <Pressable style={StyleSheet.absoluteFillObject} onPress={runDiscussionDismissAnimations} />
          </Animated.View>
          <Animated.View
            style={[
              {
                width: '100%',
                height: Math.round(windowHeight * 0.88),
                backgroundColor: theme.colors.card,
                borderTopLeftRadius: theme.radius.lg,
                borderTopRightRadius: theme.radius.lg,
                borderWidth: 1,
                borderBottomWidth: 0,
                borderColor: theme.colors.border,
                paddingHorizontal: theme.spacing.lg,
                paddingTop: theme.spacing.sm,
                paddingBottom:
                  discussionKeyboardInset > 0
                    ? theme.spacing.sm
                    : Math.max(insets.bottom, theme.spacing.md),
              },
              discussionSheetAnimStyle,
            ]}
          >
            <GestureDetector gesture={discussionSheetPanGesture}>
              <View>
                <View style={{ alignItems: 'center', marginBottom: theme.spacing.sm }}>
                  <View
                    style={{
                      width: 36,
                      height: 4,
                      borderRadius: 2,
                      backgroundColor: theme.colors.border,
                    }}
                  />
                </View>
                <View style={[shared.rowBetween, { marginBottom: theme.spacing.md }]}>
                  <Text style={shared.subheading}>Discussion</Text>
                  <TouchableOpacity
                    onPress={runDiscussionDismissAnimations}
                    hitSlop={12}
                    accessibilityRole="button"
                    accessibilityLabel="Close discussion"
                  >
                    <Ionicons name="chevron-down" size={26} color={theme.colors.text} />
                  </TouchableOpacity>
                </View>
              </View>
            </GestureDetector>
            {commentsLoading && comments.length === 0 ? (
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: theme.spacing.xl }}>
                <ActivityIndicator color={theme.colors.primary} />
              </View>
            ) : (
              <View style={{ flex: 1, minHeight: 0, paddingBottom: discussionKeyboardInset }}>
                <ScrollView
                  ref={discussionScrollRef}
                  style={{ flex: 1 }}
                  contentContainerStyle={{ flexGrow: 1, justifyContent: 'flex-end', paddingBottom: theme.spacing.md }}
                  keyboardShouldPersistTaps="handled"
                  keyboardDismissMode="interactive"
                  onContentSizeChange={() => {
                    if (discussionDrawerOpen) scrollDiscussionToBottom(false)
                  }}
                >
                  {comments.length === 0 ? (
                    <Text style={[shared.caption, { marginBottom: theme.spacing.sm }]}>No messages yet. Be the first to comment.</Text>
                  ) : (
                    <View style={{ gap: theme.spacing.xs }}>
                      {comments.map(c => (
                        <EventCommentRow key={c.id} comment={c} usernameToId={usernameToId} />
                      ))}
                    </View>
                  )}
                </ScrollView>
                {userId ? (
                  <View style={{ paddingTop: theme.spacing.sm }}>
                    <DiscussionComposer
                      isOwner={isOwner}
                      postingComment={postingComment}
                      announcementLabel="Also post as announcement"
                      mentionableUsers={mentionableUsers}
                      onPost={handlePostComment}
                      onFocusScroll={() => discussionScrollRef.current?.scrollToEnd({ animated: true })}
                    />
                  </View>
                ) : (
                  <Text style={[shared.caption, { paddingTop: theme.spacing.sm, paddingBottom: theme.spacing.xs }]}>
                    Sign in to join the discussion.
                  </Text>
                )}
              </View>
            )}
          </Animated.View>
        </View>
      </Modal>

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

      {/* Manage co-hosts modal */}
      <Modal visible={cohostModalVisible} transparent animationType="fade" onRequestClose={() => { setCohostModalVisible(false); setCohostSearchQuery(''); setCohostSearchResults([]) }}>
        <TouchableOpacity
          style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.45)' }}
          activeOpacity={1}
          onPress={() => { setCohostModalVisible(false); setCohostSearchQuery(''); setCohostSearchResults([]) }}
        >
          <TouchableOpacity activeOpacity={1} onPress={() => {}}>
            <View style={{ backgroundColor: theme.colors.card, borderRadius: theme.radius.lg, padding: theme.spacing.xl, width: 320, maxWidth: '92%', gap: theme.spacing.md }}>
              <Text style={{ fontSize: theme.font.size.lg, fontWeight: theme.font.weight.semibold, color: theme.colors.text }}>
                Manage Co-hosts
              </Text>
              <Text style={{ fontSize: theme.font.size.sm, color: theme.colors.subtext }}>
                Up to 3 co-hosts. They can post announcements, edit the event, manage teams, and remove attendees.
              </Text>

              {/* Current cohosts */}
              {cohosts.length > 0 && (
                <View style={{ gap: theme.spacing.sm }}>
                  {cohosts.map(c => {
                    const p = c.profiles as unknown as Profile
                    const name = profileDisplayName(p)
                    return (
                      <View key={c.user_id} style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, backgroundColor: theme.colors.background, borderRadius: theme.radius.md, paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.sm }}>
                        <Text style={{ flex: 1, fontSize: theme.font.size.md, color: theme.colors.text }} numberOfLines={1}>{name}</Text>
                        <TouchableOpacity
                          onPress={() => removeCohost(c.user_id)}
                          hitSlop={8}
                          disabled={cohostRemoving === c.user_id}
                        >
                          {cohostRemoving === c.user_id
                            ? <ActivityIndicator size="small" color={theme.colors.subtext} />
                            : <Ionicons name="close" size={18} color={theme.colors.subtext} />
                          }
                        </TouchableOpacity>
                      </View>
                    )
                  })}
                </View>
              )}

              {/* Search to add */}
              {cohosts.length < 3 && (
                <>
                  <Input
                    placeholder="Search by name or username"
                    value={cohostSearchQuery}
                    onChangeText={(q) => {
                      setCohostSearchQuery(q)
                      void searchCohostCandidates(q)
                    }}
                  />
                  {cohostSearching && <ActivityIndicator size="small" color={theme.colors.primary} />}
                  {cohostSearchResults.length > 0 && (
                    <View style={{ gap: theme.spacing.xs, maxHeight: 200 }}>
                      <ScrollView nestedScrollEnabled>
                        {cohostSearchResults.map(p => (
                          <TouchableOpacity
                            key={p.id}
                            onPress={() => void addCohost(p)}
                            disabled={cohostAdding}
                            style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: theme.spacing.sm, gap: theme.spacing.sm, borderBottomWidth: 1, borderBottomColor: theme.colors.border }}
                          >
                            <Text style={{ flex: 1, fontSize: theme.font.size.md, color: theme.colors.text }} numberOfLines={1}>
                              {profileDisplayName(p)}
                            </Text>
                            <Text style={{ fontSize: theme.font.size.sm, color: theme.colors.subtext }}>@{p.username}</Text>
                            {cohostAdding
                              ? <ActivityIndicator size="small" color={theme.colors.primary} />
                              : <Ionicons name="add-circle-outline" size={20} color={theme.colors.primary} />
                            }
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    </View>
                  )}
                  {cohostSearchQuery.length >= 2 && !cohostSearching && cohostSearchResults.length === 0 && (
                    <Text style={{ fontSize: theme.font.size.sm, color: theme.colors.subtext, textAlign: 'center' }}>No users found</Text>
                  )}
                </>
              )}

              <Button label="Done" onPress={() => { setCohostModalVisible(false); setCohostSearchQuery(''); setCohostSearchResults([]) }} />
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Deny request modal */}
      <Modal visible={denyModal !== null} transparent animationType="fade" onRequestClose={() => { setDenyModal(null); setDenyReason('') }}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <Pressable style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(0,0,0,0.45)' }]} onPress={() => { setDenyModal(null); setDenyReason('') }} />
          <View style={[shared.card, { width: '85%', maxWidth: 360, gap: theme.spacing.md, zIndex: 1 }]}>
            <Text style={shared.subheading}>Deny request</Text>
            {denyModal && (
              <Text style={shared.caption}>Denying {denyModal.displayName}'s request to join. They can re-request after seeing this.</Text>
            )}
            <Input
              placeholder="Reason (optional)"
              value={denyReason}
              onChangeText={setDenyReason}
              multiline
              inputStyle={{ minHeight: 72 }}
            />
            <View style={[shared.row, { gap: theme.spacing.sm }]}>
              <View style={{ flex: 1 }}>
                <Button label="Cancel" onPress={() => { setDenyModal(null); setDenyReason('') }} variant="secondary" disabled={processingRequest !== null} />
              </View>
              <View style={{ flex: 1 }}>
                <Button
                  label="Deny"
                  onPress={() => { if (denyModal) void handleDenyRequest(denyModal.userId, denyReason) }}
                  loading={processingRequest !== null}
                  variant="danger"
                />
              </View>
            </View>
          </View>
        </View>
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

      {/* Floating nav — native only, overlays the content */}
      {Platform.OS !== 'web' && (
        <View
          pointerEvents="box-none"
          style={{
            position: 'absolute',
            top: insets.top + 8,
            left: theme.spacing.md,
            right: theme.spacing.md,
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            zIndex: 50,
          }}
        >
          {/* Back pill */}
          <Pressable
            onPress={goBack}
            style={({ pressed }) => [styles.floatBtn, pressed && { opacity: 0.75 }]}
            hitSlop={8}
          >
            <Ionicons name="chevron-back" size={20} color={theme.colors.text} />
          </Pressable>

          {/* Action pills */}
          <View style={{ flexDirection: 'row', gap: theme.spacing.xs }}>
            <View style={{ position: 'relative' }}>
              <Pressable
                onPress={handleShare}
                style={({ pressed }) => [styles.floatBtn, pressed && { opacity: 0.75 }]}
                hitSlop={8}
              >
                <Ionicons name="share-outline" size={19} color={theme.colors.text} />
              </Pressable>
              {shareMenuVisible && (
                <>
                  <TouchableOpacity
                    style={{ position: 'absolute', top: 0, left: -9999, width: 99999, height: 99999 }}
                    onPress={() => setShareMenuVisible(false)}
                  />
                  <View style={[styles.shareMenu, { top: 44, right: 0 }]}>
                    {!!(navigator as any)?.share && (
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
            {isHostOrCohost && (
              <>
                <Pressable
                  onPress={() => router.push(`/host?edit=${id}` as any)}
                  style={({ pressed }) => [styles.floatBtn, pressed && { opacity: 0.75 }]}
                  hitSlop={8}
                >
                  <Ionicons name="create-outline" size={19} color={theme.colors.text} />
                </Pressable>
                <Pressable
                  onPress={handleDelete}
                  style={({ pressed }) => [styles.floatBtn, pressed && { opacity: 0.75 }]}
                  hitSlop={8}
                >
                  {deleting
                    ? <ActivityIndicator size="small" color={theme.colors.error} />
                    : <Ionicons name="trash-outline" size={19} color={theme.colors.error} />
                  }
                </Pressable>
              </>
            )}
          </View>
        </View>
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
  floatBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 4,
  },
  discussionBubbleBtn: {
    minWidth: 44,
    height: 44,
    paddingHorizontal: theme.spacing.xs,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  discussionBubbleCount: {
    position: 'absolute',
    fontSize: theme.font.size.xs,
    fontWeight: theme.font.weight.semibold,
    color: theme.colors.primary,
    marginTop: 2,
  },
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
