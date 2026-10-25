import React from 'react'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { Button } from '../Button'
import { APPROVAL_REQUIRED_NOTE, shared, theme } from '../../constants'
import { resolveJoinAction } from '../../hooks/event/derive'
import type { AttendanceStatus } from '../../types'
import type { EventAttendanceApi } from '../../types'

type Props = {
  eventStatus: AttendanceStatus
  /** `events.requires_approval`: joins become requests the host approves. Independent of price. */
  requiresApproval: boolean
  attendance: EventAttendanceApi
  onAddGuest: () => void
  /** Mobile-web document scroll: pin to the viewport (`fixed`) instead of the screen (`absolute`). */
  docScrollActive: boolean
  bottomInset: number
  onHeightChange: (height: number) => void
}

/**
 * Sticky RSVP footer on the Details tab: the one button that matches the
 * viewer's state (join / leave / waitlist / request / denied, decided by
 * `resolveJoinAction`), plus the +1 button for attendees and hosts.
 */
export function JoinFooter({ eventStatus, requiresApproval, attendance, onAddGuest, docScrollActive, bottomInset, onHeightChange }: Props) {
  const { joining } = attendance
  const action = resolveJoinAction({ ...eventStatus, requiresApproval })
  return (
    <View
      onLayout={e => onHeightChange(e.nativeEvent.layout.height)}
      style={[
        styles.footer,
        { position: (docScrollActive ? 'fixed' : 'absolute') as 'absolute', paddingBottom: Math.max(bottomInset, theme.spacing.md) },
      ]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing.sm }}>
        <View style={{ flex: 1 }}>
          {action === 'leave' ? (
            <Button label="Leave event" onPress={() => { void attendance.leave() }} loading={joining} variant="secondary" />
          ) : action === 'leave-waitlist' ? (
            <View style={{ gap: theme.spacing.xs }}>
              <Button label="Leave Waitlist" onPress={() => { void attendance.leaveWaitlist() }} loading={joining} variant="secondary" />
              <Text style={[shared.caption, { textAlign: 'center' }]}>
                You are #{eventStatus.waitlistPosition} on the waitlist
              </Text>
            </View>
          ) : action === 'cancel-request' ? (
            <View style={{ gap: theme.spacing.xs }}>
              <Button label="Cancel Request" onPress={() => { void attendance.cancelRequest() }} loading={joining} variant="secondary" />
              <Text style={[shared.caption, { textAlign: 'center' }]}>Pending host approval</Text>
            </View>
          ) : action === 'rerequest' ? (
            <View style={{ gap: theme.spacing.xs }}>
              <Button label="Request Again" onPress={() => { void attendance.rerequest() }} loading={joining} />
              <Text style={[shared.caption, { textAlign: 'center', color: theme.colors.error }]}>
                Request denied{eventStatus.denialReason ? `: "${eventStatus.denialReason}"` : ''}
              </Text>
            </View>
          ) : action === 'waitlist' ? (
            <Button label="Join Waitlist" onPress={() => { void attendance.joinWaitlist() }} loading={joining} />
          ) : action === 'request' ? (
            <View style={{ gap: theme.spacing.xs }}>
              <Button label="Request to Join" onPress={() => { void attendance.requestToJoin() }} loading={joining} />
              <Text style={[shared.caption, { textAlign: 'center' }]}>{APPROVAL_REQUIRED_NOTE}</Text>
            </View>
          ) : (
            <Button label="Join event" onPress={() => { void attendance.join() }} loading={joining} />
          )}
        </View>
        {(eventStatus.isAttending || eventStatus.isOwner) && (
          <TouchableOpacity
            onPress={onAddGuest}
            hitSlop={8}
            accessibilityLabel="Add a +1 guest"
            style={styles.addGuest}
          >
            <Ionicons name="person-add-outline" size={20} color={theme.colors.primary} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  footer: {
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.sm,
    backgroundColor: theme.colors.background,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  addGuest: {
    width: 44,
    height: 44,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
