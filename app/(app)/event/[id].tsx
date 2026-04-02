import React, { useEffect, useLayoutEffect, useState, useRef, useCallback, useMemo } from 'react'
import { Platform, View, Text, Image, ScrollView, Alert, Share, Pressable, TouchableOpacity, ActivityIndicator, StyleSheet, useWindowDimensions, Modal, Keyboard, KeyboardEvent, Switch } from 'react-native'
import { GestureDetector, Gesture, TouchableOpacity as GHTouchableOpacity } from 'react-native-gesture-handler'
import Animated, { useSharedValue, useAnimatedStyle, withSpring, withTiming, runOnJS, interpolate, Extrapolation } from 'react-native-reanimated'
import { Ionicons } from '@expo/vector-icons'
import { useLocalSearchParams, useRouter, Stack } from 'expo-router'
import * as Linking from 'expo-linking'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { supabase } from '../../../lib/supabase'
import { Button } from '../../../components/Button'
import { Input } from '../../../components/Input'
import { EventCommentRow } from '../../../components/EventCommentRow'
import { Pager } from '../../../components/Pager'
import { shared, theme, formatEventDate, KUDO_TYPES, KUDOS_MAX_PER_EVENT } from '../../../constants'
import { EventWithDetails, Profile, AttendanceStatus, EventGuest, EventCommentWithAuthor, EventAttendeeWithProfile, KudoType, Kudo } from '../../../types'
import { profileDisplayName, profileInitial, resolveProfileAvatarUriWithError, eventAttendeeRows, normalizeVolleyballPositions } from '../../../utils'

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

type KudosPersonCardProps = {
  profile: Profile
  hasGiven: boolean
  disabled: boolean
  teamColor: string | null
  onPress: () => void
}

function KudosPersonCard({ profile, hasGiven, disabled, teamColor, onPress }: KudosPersonCardProps) {
  const [avatarUri, setAvatarUri] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { uri } = await resolveProfileAvatarUriWithError(profile.avatar_url)
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
          backgroundColor: hasGiven ? activeColor + '12' : theme.colors.card,
          opacity: disabled ? 0.4 : 1,
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

/**
 * Isolated composer so local draft state doesn't re-render the whole event screen on every keystroke.
 */
type DiscussionComposerProps = {
  isOwner: boolean
  postingComment: boolean
  announcementLabel?: string
  onPost: (body: string, isAnnouncement: boolean) => Promise<void>
  onFocusScroll: () => void
}
function DiscussionComposer({ isOwner, postingComment, announcementLabel = 'Post as announcement', onPost, onFocusScroll }: DiscussionComposerProps) {
  const [draft, setDraft] = useState('')
  const [isAnnouncement, setIsAnnouncement] = useState(false)

  async function handlePost() {
    const body = draft.trim()
    if (!body) return
    try {
      await onPost(body, isAnnouncement)
      setDraft('')
      setIsAnnouncement(false)
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
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: theme.spacing.sm }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Input
            value={draft}
            onChangeText={setDraft}
            placeholder="Add a comment..."
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
  const { width: windowWidth, height: windowHeight } = useWindowDimensions()
  const insets = useSafeAreaInsets()
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

  const [activeTab, setActiveTab] = useState(0)
  const innerPagerBlocked = useRef(false)

  const [myKudosGiven, setMyKudosGiven] = useState<Kudo[]>([])
  const [kudosLoading, setKudosLoading] = useState(false)
  const [selectedKudoType, setSelectedKudoType] = useState<KudoType | null>(null)

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
    setComments([])
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
    fetchMyKudos()
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
      position: normalizeVolleyballPositions(p.position),
      created_at: '',
    }
  }

  async function fetchEvent() {
    const fetchId = id
    try {
      setLoading(true)
      setLoadError(null)
      setCommentsLoading(true)

      const { data, error } = await supabase
        .from('events')
        .select(
          `*, profiles!events_created_by_fkey (id, username, first_name, last_name, avatar_url), event_attendees (event_id, user_id, joined_at, team_number, team_pinned, status, profiles!event_attendees_user_id_fkey (id, username, first_name, last_name, avatar_url, position)), event_tags (tag_id, tags (id, name, category, display_order))`,
        )
        .eq('id', fetchId)
        .single()

      if (error) throw error
      setEvent(data as EventWithDetails)

      const attendeeRows = attendeeRowsWithProfiles(data.event_attendees)
      const attendingEntries = attendeeRows.filter(a => a.status !== 'waitlisted')
      const waitlistEntries = [...attendeeRows.filter(a => a.status === 'waitlisted')].sort(
        (a, b) => new Date(a.joined_at).getTime() - new Date(b.joined_at).getTime(),
      )

      setAttendees(attendingEntries.map(profileFromAttendeeEmbed).filter(Boolean) as Profile[])
      setWaitlistProfiles(waitlistEntries.map(profileFromAttendeeEmbed).filter(Boolean) as Profile[])

      // Comments load in parallel with guests; do not block the main shell.
      void supabase
        .from('event_comments')
        .select(
          'id, event_id, body, is_announcement, created_at, user_id, profiles!event_comments_user_id_fkey (id, username, first_name, last_name, avatar_url)',
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
    }
  }

  async function fetchMyKudos() {
    if (!userId) return
    setKudosLoading(true)
    const { data } = await supabase
      .from('kudos')
      .select('*')
      .eq('event_id', id)
      .eq('giver_id', userId)
    setMyKudosGiven((data ?? []) as Kudo[])
    setKudosLoading(false)
  }

  async function giveKudo(receiverId: string, kudoType: KudoType) {
    if (!userId) return
    const optimistic: Kudo = { id: '_opt_' + receiverId + kudoType, event_id: id, giver_id: userId, receiver_id: receiverId, kudo_type: kudoType, created_at: '' }
    setMyKudosGiven(prev => [...prev, optimistic])
    const { data, error } = await supabase.from('kudos').insert({
      event_id: id,
      giver_id: userId,
      receiver_id: receiverId,
      kudo_type: kudoType,
    }).select('id, created_at').single()
    if (error) {
      setMyKudosGiven(prev => prev.filter(k => k.id !== optimistic.id))
      Alert.alert('Error', error.message)
      return
    }
    if (data) {
      setMyKudosGiven(prev => prev.map(k => k.id === optimistic.id ? { ...k, id: data.id, created_at: data.created_at } : k))
    }
  }

  async function revokeKudo(receiverId: string, kudoType: KudoType) {
    if (!userId) return
    const removed = myKudosGiven.find(k => k.receiver_id === receiverId && k.kudo_type === kudoType)
    setMyKudosGiven(prev => prev.filter(k => !(k.receiver_id === receiverId && k.kudo_type === kudoType)))
    const { error } = await supabase.from('kudos').delete()
      .eq('event_id', id)
      .eq('giver_id', userId)
      .eq('receiver_id', receiverId)
      .eq('kudo_type', kudoType)
    if (error) {
      if (removed) setMyKudosGiven(prev => [...prev, removed])
      Alert.alert('Error', error.message)
    }
  }

  async function resetKudos() {
    if (!userId || myKudosGiven.length === 0) return
    const snapshot = [...myKudosGiven]
    setMyKudosGiven([])
    const { error } = await supabase.from('kudos').delete()
      .eq('event_id', id)
      .eq('giver_id', userId)
    if (error) {
      setMyKudosGiven(snapshot)
      Alert.alert('Error', error.message)
    }
  }

  async function refreshComments() {
    const { data, error } = await supabase
      .from('event_comments')
      .select(
        'id, event_id, body, is_announcement, created_at, user_id, profiles!event_comments_user_id_fkey (id, username, first_name, last_name, avatar_url)',
      )
      .eq('event_id', id)
      .order('created_at', { ascending: true })
    if (error) {
      Alert.alert('Error', error.message)
      return
    }
    setComments((data ?? []) as unknown as EventCommentWithAuthor[])
  }

  async function handlePostComment(body: string, isAnnouncement: boolean) {
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
        is_announcement: Boolean(event?.created_by === userId && isAnnouncement),
      })
      if (error) throw error
      await refreshComments()
      scrollDiscussionToBottom(true)
    } catch (e: any) {
      Alert.alert('Error', e.message)
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

    const attendingRows = (rows ?? []).filter((a: any) => a.status !== 'waitlisted')
    const waitlistRows = [...(rows ?? []).filter((a: any) => a.status === 'waitlisted')]
      .sort((a: any, b: any) => new Date(a.joined_at).getTime() - new Date(b.joined_at).getTime())

    const attendeeIds = attendingRows.map((a: any) => a.user_id)
    const waitlistIds = waitlistRows.map((a: any) => a.user_id)
    const allProfileIds = [...new Set([...attendeeIds, ...waitlistIds])]
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
      const attendingCount = eventAttendeeRows(event ?? { event_attendees: [] }).filter(a => a.status !== 'waitlisted').length + guests.length
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
  const isEventOver = event
    ? Date.now() > new Date(/[Z+]/.test(event.event_date) ? event.event_date : event.event_date + 'Z').getTime() + (event.duration_minutes ?? 120) * 60_000
    : false
  const totalPlayers = attendees.length + guests.length
  const hasTeams = isOwner
    ? totalPlayers > 0
    : Object.values(assignments).some(a => a.team !== null)

  const attendeeRows = event ? eventAttendeeRows(event) : []
  const attendingEntries = attendeeRows.filter((a: any) => a.status !== 'waitlisted')
  const waitlistEntries = [...attendeeRows.filter((a: any) => a.status === 'waitlisted')]
    .sort((a: any, b: any) => new Date(a.joined_at).getTime() - new Date(b.joined_at).getTime())
  const waitlistIdx = waitlistEntries.findIndex((a: any) => a.user_id === userId)
  const totalAttending = attendingEntries.length + guests.length
  const eventStatus: AttendanceStatus = {
    count: totalAttending,
    spotsLeft: event?.max_attendees ? event.max_attendees - totalAttending : null,
    isFull: event?.max_attendees ? totalAttending >= event.max_attendees : false,
    isAttending: attendingEntries.some((a: any) => a.user_id === userId),
    isOwner: event?.created_by === userId,
    isWaitlisted: waitlistIdx !== -1,
    waitlistPosition: waitlistIdx !== -1 ? waitlistIdx + 1 : null,
    waitlistCount: waitlistEntries.length,
  }

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
        <>
          {/* Tab bar */}
          <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: theme.colors.border, backgroundColor: theme.colors.background }}>
            {(['Description', 'People', 'Discussion', 'Kudos'] as const).map((label, i) => (
              <TouchableOpacity
                key={label}
                onPress={() => { if (i !== 3) setSelectedKudoType(null); setActiveTab(i) }}
                style={{ flex: 1, alignItems: 'center', paddingVertical: 12 }}
              >
                <Text style={{
                  fontSize: theme.font.size.sm,
                  fontWeight: activeTab === i ? theme.font.weight.semibold : theme.font.weight.regular,
                  color: activeTab === i ? theme.colors.primary : theme.colors.subtext,
                }}>
                  {label}
                </Text>
                {activeTab === i && (
                  <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 2, backgroundColor: theme.colors.primary }} />
                )}
              </TouchableOpacity>
            ))}
          </View>

          <Pager
            page={activeTab}
            onPageChange={next => {
              if (next !== 3) setSelectedKudoType(null)
              setActiveTab(next)
            }}
            pagerBlockedRef={innerPagerBlocked}
          >
            {/* Tab 0: Description */}
            <ScrollView style={shared.screen} contentContainerStyle={shared.scrollContent}>
              <Text style={[shared.primaryText, shared.mb_xs]}>{formatEventDate(event.event_date, 'long')}</Text>
              <Text style={[shared.caption, shared.mb_xs]}>
                Ends {formatEndTime(event.event_date, event.duration_minutes ?? 120)} · {formatDuration(event.duration_minutes ?? 120)}
              </Text>
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
              {event.description
                ? <Text style={[shared.body, shared.mb_lg]}>{event.description}</Text>
                : <Text style={[shared.caption, shared.mb_lg]}>No description provided.</Text>
              }

              {/* Join / Leave / Waitlist */}
              <View style={[shared.mb_lg, { flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing.sm }]}>
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

              {/* Host */}
              <View style={shared.divider} />
              <Text style={[shared.subheading, shared.mb_sm]}>Host</Text>
              <View style={[shared.card, shared.mb_lg]}>
                <Text style={shared.body}>{event.profiles ? profileDisplayName(event.profiles) : ''}</Text>
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
                          <Text style={[shared.body, { flex: 1 }]}>{profileDisplayName(profile)}</Text>
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
                  <Text style={shared.caption}>No messages yet. Be the first to comment.</Text>
                ) : (
                  <View style={{ gap: theme.spacing.xs }}>
                    {comments.map(c => (
                      <EventCommentRow key={c.id} comment={c} />
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
                      isOwner={isOwner}
                      postingComment={postingComment}
                      onPost={handlePostComment}
                      onFocusScroll={() => discussionTabScrollRef.current?.scrollToEnd({ animated: true })}
                    />
                  </View>
                </View>
              ) : (
                <Text style={[shared.caption, { paddingTop: theme.spacing.sm, paddingBottom: theme.spacing.lg }]}>Sign in to join the discussion.</Text>
              )}
            </View>

            {/* Tab 3: Kudos */}
            <View style={[shared.screen, { flex: 1 }]}>
              {!isEventOver ? (
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: theme.spacing.xl }}>
                  <Ionicons name="time-outline" size={40} color={theme.colors.subtext} />
                  <Text style={[shared.subheading, { marginTop: theme.spacing.md, textAlign: 'center' }]}>Not available yet</Text>
                  <Text style={[shared.caption, { marginTop: theme.spacing.sm, textAlign: 'center' }]}>
                    Kudos open after the event ends.
                  </Text>
                </View>
              ) : !eventStatus.isAttending && !eventStatus.isOwner ? (
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: theme.spacing.xl }}>
                  <Ionicons name="lock-closed-outline" size={40} color={theme.colors.subtext} />
                  <Text style={[shared.subheading, { marginTop: theme.spacing.md, textAlign: 'center' }]}>Attendees only</Text>
                  <Text style={[shared.caption, { marginTop: theme.spacing.sm, textAlign: 'center' }]}>
                    Only people who attended this event can give kudos.
                  </Text>
                </View>
              ) : kudosLoading ? (
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                  <ActivityIndicator color={theme.colors.primary} />
                </View>
              ) : selectedKudoType === null ? (
                /* Step 1: Pick a kudo type */
                <ScrollView contentContainerStyle={[shared.scrollContent, { paddingBottom: insets.bottom + theme.spacing.lg }]}>
                  <View style={[shared.rowBetween, { marginBottom: theme.spacing.xs }]}>
                    <Text style={shared.subheading}>Give Kudos</Text>
                    {myKudosGiven.length > 0 && (
                      <TouchableOpacity onPress={resetKudos} hitSlop={8}>
                        <Text style={{ fontSize: theme.font.size.sm, color: theme.colors.subtext }}>Reset</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                  <Text style={[shared.caption, { marginBottom: theme.spacing.lg }]}>
                    {myKudosGiven.length}/{KUDOS_MAX_PER_EVENT} given · What do you want to recognize?
                  </Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
                    {KUDO_TYPES.map(kt => {
                      const givenCount = myKudosGiven.filter(k => k.kudo_type === kt.type).length
                      const atCap = myKudosGiven.length >= KUDOS_MAX_PER_EVENT && givenCount === 0
                      return (
                        <TouchableOpacity
                          key={kt.type}
                          onPress={() => !atCap ? setSelectedKudoType(kt.type) : null}
                          disabled={atCap}
                          style={{
                            width: '47%',
                            backgroundColor: givenCount > 0 ? theme.colors.primary + '12' : theme.colors.card,
                            borderWidth: 1.5,
                            borderColor: givenCount > 0 ? theme.colors.primary : theme.colors.border,
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
                            color={givenCount > 0 ? theme.colors.primary : theme.colors.subtext}
                          />
                          <Text style={{
                            fontSize: theme.font.size.sm,
                            fontWeight: theme.font.weight.semibold,
                            color: givenCount > 0 ? theme.colors.primary : theme.colors.text,
                            textAlign: 'center',
                          }}>
                            {kt.label}
                          </Text>
                          {givenCount > 0 && (
                            <Text style={{ fontSize: theme.font.size.xs, color: theme.colors.primary }}>
                              {givenCount} given
                            </Text>
                          )}
                        </TouchableOpacity>
                      )
                    })}
                  </View>
                </ScrollView>
              ) : (
                /* Step 2: Pick recipients for the selected kudo type */
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
                    <TouchableOpacity onPress={() => setSelectedKudoType(null)} hitSlop={12}>
                      <Ionicons name="arrow-back" size={22} color={theme.colors.text} />
                    </TouchableOpacity>
                    <Ionicons
                      name={(KUDO_TYPES.find(k => k.type === selectedKudoType)?.icon ?? 'star-outline') as any}
                      size={18}
                      color={theme.colors.primary}
                    />
                    <Text style={[shared.subheading, { flex: 1 }]}>
                      {KUDO_TYPES.find(k => k.type === selectedKudoType)?.label}
                    </Text>
                    <Text style={shared.caption}>
                      {myKudosGiven.length}/{KUDOS_MAX_PER_EVENT}
                    </Text>
                  </View>
                  <Text style={[shared.caption, { paddingHorizontal: theme.spacing.lg, paddingVertical: theme.spacing.sm }]}>
                    Who deserves it? Tap to give or remove.
                  </Text>
                  {attendees.filter(a => a.id !== userId).length === 0 ? (
                    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: theme.spacing.xl }}>
                      <Text style={shared.caption}>No other attendees to give kudos to.</Text>
                    </View>
                  ) : (
                    <ScrollView
                      contentContainerStyle={[shared.scrollContent, { paddingBottom: insets.bottom + theme.spacing.lg }]}
                      keyboardShouldPersistTaps="handled"
                    >
                      {(() => {
                        const others = attendees.filter(a => a.id !== userId)
                        function renderKudosCard(profile: Profile, teamColor: string | null) {
                          const hasGiven = myKudosGiven.some(k => k.receiver_id === profile.id && k.kudo_type === selectedKudoType)
                          const atCap = myKudosGiven.length >= KUDOS_MAX_PER_EVENT && !hasGiven
                          return (
                            <View key={profile.id} style={[styles.playerCell, isMobileWeb && { width: '50%' }]}>
                              <KudosPersonCard
                                profile={profile}
                                hasGiven={hasGiven}
                                disabled={atCap}
                                teamColor={teamColor}
                                onPress={() => hasGiven
                                  ? revokeKudo(profile.id, selectedKudoType)
                                  : giveKudo(profile.id, selectedKudoType)
                                }
                              />
                            </View>
                          )
                        }
                        if (!hasTeams) {
                          return <View style={styles.playerGrid}>{others.map(p => renderKudosCard(p, null))}</View>
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
                                    : <View style={styles.playerGrid}>{members.map(p => renderKudosCard(p, teamColor))}</View>
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
                                <View style={styles.playerGrid}>{unassigned.map(p => renderKudosCard(p, null))}</View>
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
                        <EventCommentRow key={c.id} comment={c} />
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
