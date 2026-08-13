import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react'
import { Platform, View, Text, TouchableOpacity, ActivityIndicator, StyleSheet, RefreshControl } from 'react-native'
import { GestureDetector, Gesture, TouchableOpacity as GHTouchableOpacity } from 'react-native-gesture-handler'
import Animated, { useSharedValue, useAnimatedStyle, withSpring, runOnJS } from 'react-native-reanimated'
import { Ionicons } from '@expo/vector-icons'
import { Button } from '../Button'
import { ProfileAvatar } from '../ProfileAvatar'
import { DocScrollView } from '../DocScrollView'
import { AnchorOptionsMenu, type AnchorMenuOption, type AnchorRect } from '../AnchorOptionsMenu'
import { shared, theme, TEAM_COLORS, TEAM_COLOR_NAMES } from '../../constants'
import type { EventWithDetails, Profile, AttendanceStatus, EventGuest, TeamAssignment } from '../../types'
import { profileDisplayName, resolveProfileAvatarUriSmall, hostRosterSkillAndPositionsLine } from '../../utils'

// ─── Draggable cards (People tab only) ───────────────────────────────────────

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
  /**
   * When set, the corner control becomes a ⋯ menu instead of a bare ✕. The
   * parent owns the option list so Message / View profile / Remove all live in
   * one place rather than as competing controls on a 34pt-tall row.
   */
  onOpenMenu?: (rect: AnchorRect) => void
}

function DraggablePlayerCard({ profile, teamColor, isPinned, isOwner, onDragStart, onDragMove, onDragEnd, onRemove, onTogglePin, onOpenMenu }: DraggableCardProps) {
  const menuBtnRef = useRef<View>(null)
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
    <View style={shared.playerCardShell}>
      <GestureDetector gesture={panGesture}>
        <Animated.View style={[{ flex: 1, minWidth: 0 }, animStyle]}>
          <GestureDetector gesture={tapGesture}>
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
              <ProfileAvatar uri={avatarUri} border={profile.selected_border ?? null} size={34} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={shared.playerCardName} numberOfLines={1}>{profileDisplayName(profile)}</Text>
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
      {(isOwner || onOpenMenu) && (() => {
        // One corner control, not two. With a menu available it becomes ⋯ and
        // Remove moves inside it; without one it stays the bare ✕ it was.
        const useMenu = !!onOpenMenu
        const label = useMenu
          ? `Actions for ${profileDisplayName(profile)}`
          : `Remove ${profileDisplayName(profile)}`
        const activate = () => {
          if (!onOpenMenu) { onRemove(); return }
          menuBtnRef.current?.measureInWindow((x, y, w, h) => {
            onOpenMenu({ x, y, width: w, height: h })
          })
        }
        const glyph = <Ionicons name={useMenu ? 'ellipsis-horizontal' : 'close'} size={15} color={theme.colors.subtext} />
        return Platform.OS === 'web' ? (
          <View
            ref={menuBtnRef}
            onStartShouldSetResponder={() => true}
            onResponderRelease={activate}
            style={[useMenu ? styles.rowMenuBtn : styles.removeBtn, styles.removeBtnHit]}
            accessibilityRole="button"
            accessibilityLabel={label}
          >
            {glyph}
          </View>
        ) : (
          <View ref={menuBtnRef} collapsable={false} style={useMenu ? undefined : styles.removeBtn}>
            <GHTouchableOpacity
              onPress={activate}
              style={[useMenu ? styles.rowMenuBtn : null, styles.removeBtnHit]}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={label}
            >
              {glyph}
            </GHTouchableOpacity>
          </View>
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
  onOpenMenu?: (rect: AnchorRect) => void
}

function DraggableGuestCard({ guest, adderUsername, teamColor, isPinned, isOwner, onDragStart, onDragMove, onDragEnd, onRemove, onTogglePin, onOpenMenu }: DraggableGuestCardProps) {
  const menuBtnRef = useRef<View>(null)
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
    <View style={shared.playerCardShell}>
      <GestureDetector gesture={panGesture}>
        <Animated.View style={[{ flex: 1, minWidth: 0 }, animStyle]}>
          <GestureDetector gesture={tapGesture}>
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
              <View style={[shared.playerCardAvatar, { borderColor: teamColor ?? theme.colors.border, backgroundColor: teamColor ? teamColor + '18' : theme.colors.background, borderWidth: teamColor ? 2 : 1.5 }]}>
                <Text style={[shared.playerCardAvatarInitial, { color: teamColor ?? theme.colors.subtext }]}>{initials}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={shared.playerCardName} numberOfLines={1}>{guest.first_name} {guest.last_name.charAt(0)}.</Text>
                <Text style={{ fontSize: theme.font.size.xs, color: theme.colors.subtext, lineHeight: 14 }} numberOfLines={1}>{adderUsername}'s +1</Text>
              </View>
              {isOwner && isPinned && teamColor && (
                <Ionicons name="lock-closed" size={13} color={theme.colors.subtext} />
              )}
            </View>
          </GestureDetector>
        </Animated.View>
      </GestureDetector>
      {(isOwner || onOpenMenu) && (() => {
        const useMenu = !!onOpenMenu
        const who = `${guest.first_name} ${guest.last_name}`
        const label = useMenu ? `Actions for guest ${who}` : `Remove guest ${who}`
        const activate = () => {
          if (!onOpenMenu) { onRemove(); return }
          menuBtnRef.current?.measureInWindow((x, y, w, h) => {
            onOpenMenu({ x, y, width: w, height: h })
          })
        }
        const glyph = <Ionicons name={useMenu ? 'ellipsis-horizontal' : 'close'} size={15} color={theme.colors.subtext} />
        return Platform.OS === 'web' ? (
          <View
            ref={menuBtnRef}
            onStartShouldSetResponder={() => true}
            onResponderRelease={activate}
            style={[useMenu ? styles.rowMenuBtn : styles.removeBtn, styles.removeBtnHit]}
            accessibilityRole="button"
            accessibilityLabel={label}
          >
            {glyph}
          </View>
        ) : (
          <View ref={menuBtnRef} collapsable={false} style={useMenu ? undefined : styles.removeBtn}>
            <GHTouchableOpacity
              onPress={activate}
              style={[useMenu ? styles.rowMenuBtn : null, styles.removeBtnHit]}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={label}
            >
              {glyph}
            </GHTouchableOpacity>
          </View>
        )
      })()}
    </View>
  )
}

// ─── People tab body ─────────────────────────────────────────────────────────

type Props = {
  docScrollActive: boolean
  refreshing: boolean
  onRefresh: () => void
  event: EventWithDetails
  eventStatus: AttendanceStatus
  attendees: Profile[]
  guests: EventGuest[]
  adderUsernames: Record<string, string>
  assignments: Record<string, TeamAssignment>
  numTeams: number
  setNumTeams: React.Dispatch<React.SetStateAction<number>>
  hasTeams: boolean
  hoveredTeamKey: string | null
  teamZoneRefs: React.MutableRefObject<Record<string, View | null>>
  isMobileWeb: boolean
  isHostOrCohost: boolean
  savingTeams: boolean
  requestedProfiles: Profile[]
  processingRequest: string | null
  waitlistProfiles: Profile[]
  waitlistGuests: EventGuest[]
  onDragStart: (id: string, x: number, y: number) => void
  onDragMove: (x: number, y: number) => void
  onDragEnd: (x: number, y: number) => void
  onTogglePin: (id: string) => void
  onRemoveAttendee: (profile: Profile) => void
  onRemoveGuest: (g: EventGuest) => void
  onOpenProfile: (userId: string) => void
  onResetTeams: () => void
  onRandomizeTeams: () => void
  onSaveTeams: () => void
  onApproveRequest: (userId: string) => void
  onDeny: (userId: string, displayName: string) => void
  onApproveFromWaitlist: (userId: string) => void
  /** Opens (or creates) a DM with this user. Only wired for hosts and co-hosts. */
  onMessage?: (userId: string) => void
  /**
   * Host or co-host. Messaging from a roster is deliberately asymmetric: an
   * organiser has a real operational need to reach one attendee, while
   * attendee→attendee DMs from a roster are an unsolicited-contact vector and
   * need their own design.
   */
  canMessage: boolean
  /** Viewer's own id, so the roster never offers "message yourself". */
  currentUserId: string | null
  /** Users the viewer has silenced — no Message action for them. */
  silencedUserIds: Set<string>
}

export function PeopleTab({
  docScrollActive,
  refreshing,
  onRefresh,
  event,
  eventStatus,
  attendees,
  guests,
  adderUsernames,
  assignments,
  numTeams,
  setNumTeams,
  hasTeams,
  hoveredTeamKey,
  teamZoneRefs,
  isMobileWeb,
  isHostOrCohost,
  savingTeams,
  requestedProfiles,
  processingRequest,
  waitlistProfiles,
  waitlistGuests,
  onDragStart,
  onDragMove,
  onDragEnd,
  onTogglePin,
  onRemoveAttendee,
  onRemoveGuest,
  onOpenProfile,
  onResetTeams,
  onRandomizeTeams,
  onSaveTeams,
  onApproveRequest,
  onDeny,
  onApproveFromWaitlist,
  onMessage,
  canMessage,
  currentUserId,
  silencedUserIds,
}: Props) {
  const [rowMenu, setRowMenu] = useState<{ anchor: AnchorRect; options: AnchorMenuOption[] } | null>(null)

  /** Can the viewer start a DM with this particular person right now? */
  const canMessageUser = useCallback((userId: string) => (
    canMessage
    && !!onMessage
    && userId !== currentUserId
    && !silencedUserIds.has(userId)
  ), [canMessage, onMessage, currentUserId, silencedUserIds])

  /**
   * Options for a member row. Message leads because it's the action this menu
   * exists for; Remove is last and destructive.
   */
  const memberMenuOptions = useCallback((profile: Profile, opts?: { onRemove?: () => void }): AnchorMenuOption[] => {
    const out: AnchorMenuOption[] = []
    if (canMessageUser(profile.id)) {
      out.push({ key: 'message', label: 'Message', onPress: () => onMessage?.(profile.id) })
    }
    out.push({ key: 'profile', label: 'View profile', onPress: () => onOpenProfile(profile.id) })
    if (opts?.onRemove) {
      out.push({ key: 'remove', label: 'Remove from event', destructive: true, onPress: opts.onRemove })
    }
    return out
  }, [canMessageUser, onMessage, onOpenProfile])

  /**
   * A +1 has no account, so there's nobody to message. Offer the member who
   * added them instead — that's who the host actually needs to reach.
   */
  const guestMenuOptions = useCallback((g: EventGuest, opts?: { onRemove?: () => void }): AnchorMenuOption[] => {
    const out: AnchorMenuOption[] = []
    if (canMessageUser(g.added_by)) {
      const adder = adderUsernames[g.added_by]
      out.push({
        key: 'message-adder',
        label: adder ? `Message ${adder}` : 'Message who added them',
        onPress: () => onMessage?.(g.added_by),
      })
    }
    if (opts?.onRemove) {
      out.push({ key: 'remove', label: 'Remove guest', destructive: true, onPress: opts.onRemove })
    }
    return out
  }, [canMessageUser, onMessage, adderUsernames])

  /** ⋯ trigger for the flat request/waitlist rows (the roster cards have their own). */
  function RowMenuButton({ options, label }: { options: AnchorMenuOption[]; label: string }) {
    const ref = useRef<View>(null)
    if (options.length < 2) return null
    return (
      <View ref={ref} collapsable={false}>
        <TouchableOpacity
          onPress={() => ref.current?.measureInWindow((x, y, w, h) => openRowMenu({ x, y, width: w, height: h }, options))}
          style={styles.rowMenuBtn}
          accessibilityRole="button"
          accessibilityLabel={label}
        >
          <Ionicons name="ellipsis-horizontal" size={16} color={theme.colors.subtext} />
        </TouchableOpacity>
      </View>
    )
  }

  const openRowMenu = useCallback((anchor: AnchorRect, options: AnchorMenuOption[]) => {
    if (options.length === 0) return
    setRowMenu({ anchor, options })
  }, [])
  function renderCard(profile: Profile) {
    const rosterMenu = memberMenuOptions(
      profile,
      eventStatus.isOwner ? { onRemove: () => onRemoveAttendee(profile) } : undefined,
    )
    const a = assignments[profile.id]
    const teamNum = a?.team ?? null
    const teamColor = teamNum !== null ? TEAM_COLORS[(teamNum - 1) % TEAM_COLORS.length] : null
    const card = (
      <DraggablePlayerCard
        profile={profile}
        teamColor={teamColor}
        isPinned={a?.pinned ?? false}
        isOwner={eventStatus.isOwner}
        onDragStart={(x, y) => onDragStart(profile.id, x, y)}
        onDragMove={onDragMove}
        onDragEnd={onDragEnd}
        onRemove={() => onRemoveAttendee(profile)}
        onTogglePin={() => onTogglePin(profile.id)}
        onOpenMenu={rosterMenu.length > 1 ? rect => openRowMenu(rect, rosterMenu) : undefined}
      />
    )
    if (eventStatus.isOwner) {
      return <View key={profile.id} style={[shared.playerCell, isMobileWeb && { width: '50%' }]}>{card}</View>
    }
    return (
      <TouchableOpacity key={profile.id} style={[shared.playerCell, isMobileWeb && { width: '50%' }]} onPress={() => onOpenProfile(profile.id)}>
        {card}
      </TouchableOpacity>
    )
  }

  function renderGuestCard(g: EventGuest) {
    const guestMenu = guestMenuOptions(
      g,
      eventStatus.isOwner ? { onRemove: () => onRemoveGuest(g) } : undefined,
    )
    const a = assignments[g.id]
    const teamNum = a?.team ?? null
    const teamColor = teamNum !== null ? TEAM_COLORS[(teamNum - 1) % TEAM_COLORS.length] : null
    return (
      <View key={g.id} style={[shared.playerCell, isMobileWeb && { width: '50%' }]}>
        <DraggableGuestCard
          guest={g}
          adderUsername={adderUsernames[g.added_by] ?? '?'}
          teamColor={teamColor}
          isPinned={a?.pinned ?? false}
          isOwner={eventStatus.isOwner}
          onDragStart={(x, y) => onDragStart(g.id, x, y)}
          onDragMove={onDragMove}
          onDragEnd={onDragEnd}
          onRemove={() => onRemoveGuest(g)}
          onTogglePin={() => onTogglePin(g.id)}
          onOpenMenu={guestMenu.length > 1 ? rect => openRowMenu(rect, guestMenu) : undefined}
        />
      </View>
    )
  }

  return (
    <>
    <DocScrollView
      docScroll={docScrollActive}
      style={shared.screen}
      contentContainerStyle={shared.scrollContent}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />}
    >
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
        : !hasTeams
          ? (
            <View
              ref={(r) => { teamZoneRefs.current['unassigned'] = r as View | null }}
              style={[styles.dropZone, hoveredTeamKey === 'unassigned' && styles.dropZoneActive]}
            >
              <View style={shared.playerGrid}>
                {attendees.map(renderCard)}
                {guests.map(renderGuestCard)}
              </View>
            </View>
          )
          : (() => {
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
                      <View style={shared.teamHeader}>
                        <View style={[shared.teamDot, { backgroundColor: teamColor }]} />
                        <Text style={[shared.teamHeading, { color: teamColor }]}>{TEAM_COLOR_NAMES[(teamNum - 1) % TEAM_COLOR_NAMES.length]} Team</Text>
                      </View>
                      {teamPlayers.length === 0 && teamGuests.length === 0
                        ? <Text style={[shared.caption, { paddingHorizontal: theme.spacing.xs, paddingBottom: theme.spacing.xs }]}>No players</Text>
                        : <View style={shared.playerGrid}>{teamPlayers.map(renderCard)}{teamGuests.map(renderGuestCard)}</View>
                      }
                    </View>
                  )
                })}
                {(unassigned.length > 0 || unassignedGuests.length > 0) && (
                  <View
                    ref={(r) => { teamZoneRefs.current['unassigned'] = r as View | null }}
                    style={[styles.dropZone, hoveredTeamKey === 'unassigned' && styles.dropZoneActive]}
                  >
                    <View style={shared.teamHeader}>
                      <View style={[shared.teamDot, { backgroundColor: theme.colors.subtext }]} />
                      <Text style={[shared.teamHeading, { color: theme.colors.subtext }]}>Unassigned</Text>
                    </View>
                    <View style={shared.playerGrid}>
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
              <Button label="Reset" onPress={onResetTeams} variant="secondary" />
            </View>
            <View style={{ flex: 1 }}>
              <Button label="Randomize" onPress={onRandomizeTeams} variant="secondary" />
            </View>
            <View style={{ flex: 1 }}>
              <Button label="Save" onPress={onSaveTeams} loading={savingTeams} />
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
                <TouchableOpacity style={{ flex: 1, minWidth: 0 }} onPress={() => onOpenProfile(profile.id)}>
                  <Text style={shared.body}>{profileDisplayName(profile)}</Text>
                  <Text style={[shared.caption, { marginTop: 2 }]} numberOfLines={2}>
                    {hostRosterSkillAndPositionsLine(profile)}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => onApproveRequest(profile.id)}
                  disabled={processingRequest === profile.id}
                  style={{ paddingVertical: theme.spacing.xs, paddingHorizontal: theme.spacing.sm, backgroundColor: theme.colors.success, borderRadius: theme.radius.md }}
                >
                  {processingRequest === profile.id
                    ? <ActivityIndicator size="small" color={theme.colors.white} />
                    : <Text style={{ color: theme.colors.white, fontSize: theme.font.size.sm, fontWeight: theme.font.weight.medium }}>Approve</Text>
                  }
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => onDeny(profile.id, profileDisplayName(profile))}
                  disabled={processingRequest === profile.id}
                  style={{ paddingVertical: theme.spacing.xs, paddingHorizontal: theme.spacing.sm, backgroundColor: theme.colors.error + '18', borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.error + '40' }}
                >
                  <Text style={{ color: theme.colors.error, fontSize: theme.font.size.sm, fontWeight: theme.font.weight.medium }}>Deny</Text>
                </TouchableOpacity>
                <RowMenuButton
                  options={memberMenuOptions(profile)}
                  label={`Actions for ${profileDisplayName(profile)}`}
                />
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
                      onPress={() => onApproveFromWaitlist(profile.id)}
                      style={{ paddingVertical: theme.spacing.xs, paddingHorizontal: theme.spacing.sm, backgroundColor: theme.colors.primary, borderRadius: theme.radius.md }}
                    >
                      <Text style={{ color: theme.colors.white, fontSize: theme.font.size.sm, fontWeight: theme.font.weight.medium }}>Approve</Text>
                    </TouchableOpacity>
                  )}
                  <RowMenuButton
                    options={memberMenuOptions(profile)}
                    label={`Actions for ${profileDisplayName(profile)}`}
                  />
                </View>
              ))}
              {waitlistGuests.map((g, idx) => (
                <View key={g.id} style={[shared.card, { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }]}>
                  <Text style={[shared.caption, { minWidth: 20, fontWeight: theme.font.weight.semibold, color: theme.colors.primary }]}>#{waitlistProfiles.length + idx + 1}</Text>
                  <Text style={[shared.body, { flex: 1 }]}>{g.first_name} {g.last_name}</Text>
                  <View style={shared.tag}><Text style={shared.tagText}>Guest</Text></View>
                  {eventStatus.isOwner && (
                    <TouchableOpacity onPress={() => onRemoveGuest(g)} hitSlop={8}>
                      <Ionicons name="close" size={16} color={theme.colors.subtext} />
                    </TouchableOpacity>
                  )}
                </View>
              ))}
            </View>
          )}
        </>
      )}
    </DocScrollView>
    {/* One menu instance for the whole tab — a roster can run 12–24 rows, and
        mounting a Modal per row is both wasteful and a stacking-order hazard. */}
    <AnchorOptionsMenu
      visible={rowMenu !== null}
      anchor={rowMenu?.anchor ?? null}
      options={rowMenu?.options ?? []}
      onDismiss={() => setRowMenu(null)}
    />
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
  removeBtn: {
    padding: 4,
  },
  /**
   * The ⋯ menu trigger. 44pt minimum per the app's touch-target rule — the icon
   * stays small, only the hit area grows, so the roster row looks unchanged.
   */
  rowMenuBtn: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeBtnHit: {
    zIndex: 2,
    elevation: 2,
  },
})
