import React, { memo } from 'react'
import { TouchableOpacity, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useRouter, usePathname } from 'expo-router'
import { theme, eventAttendeeDisplayCount } from '../constants'
import type { EventWithDetails, Tag } from '../types'

// ─── Tag color helpers ────────────────────────────────────────────────────────

function tagColors(tag: Tag): { bg: string; text: string; border: string } {
  const name = tag.name.toLowerCase()
  if (name.includes('open play') || name.includes('open-play')) {
    return { bg: theme.colors.success + '1A', text: theme.colors.success, border: theme.colors.success + '40' }
  }
  if (name.includes('tournament')) {
    return { bg: theme.colors.warning + '1A', text: theme.colors.warning, border: theme.colors.warning + '40' }
  }
  return { bg: theme.colors.primary + '1A', text: theme.colors.primary, border: theme.colors.primary + '40' }
}

// ─── Time parser (event_date is UTC; append Z to force correct parsing) ───────

function parseEventTime(dateString: string): { hour: string; ampm: string } {
  const normalized = /[Z+]/.test(dateString) ? dateString : dateString + 'Z'
  const d = new Date(normalized)
  const hours = d.getHours()
  const minutes = d.getMinutes()
  const h12 = hours % 12 || 12
  const ampm = hours < 12 ? 'AM' : 'PM'
  const hour = `${h12}:${String(minutes).padStart(2, '0')}`
  return { hour, ampm }
}

// ─── Card ─────────────────────────────────────────────────────────────────────

function EventCardInner({ event }: { event: EventWithDetails }) {
  const router = useRouter()
  const pathname = usePathname()

  const attendeeCount = eventAttendeeDisplayCount(event)
  const waitlistedCount = event.event_attendees_waitlisted?.[0]
    ? Math.max(0, Number(event.event_attendees_waitlisted[0].count))
    : 0
  const spotsLeft = event.max_attendees != null
    ? Math.max(0, event.max_attendees - attendeeCount)
    : null
  const isFull = spotsLeft === 0
  const fillRatio = event.max_attendees
    ? Math.min(1, attendeeCount / event.max_attendees)
    : 0

  const tags = event.event_tags
    ?.map(et => et.tags)
    .sort((a, b) => a.display_order - b.display_order) ?? []

  const { hour, ampm } = parseEventTime(event.event_date)

  const barColor = isFull
    ? theme.colors.error
    : fillRatio >= 0.85
    ? theme.colors.warning
    : theme.colors.primary

  return (
    <TouchableOpacity
      activeOpacity={0.72}
      onPress={() => router.push(`/event/${event.id}?from=${encodeURIComponent(pathname)}` as any)}
      style={{
        flexDirection: 'row',
        backgroundColor: theme.colors.card,
        borderRadius: theme.radius.lg,
        borderWidth: 1,
        borderColor: theme.colors.border,
        marginBottom: theme.spacing.sm,
        overflow: 'hidden',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06,
        shadowRadius: 4,
        elevation: 1,
      }}
    >
      {/* ── Time column ── */}
      <View style={{
        width: 60,
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: theme.spacing.md,
        backgroundColor: theme.colors.primary + '12',
        gap: 1,
      }}>
        <Text style={{ fontSize: 15, fontWeight: theme.font.weight.bold, color: theme.colors.primary, letterSpacing: -0.3 }}>
          {hour}
        </Text>
        <Text style={{ fontSize: theme.font.size.xs, fontWeight: theme.font.weight.medium, color: theme.colors.primary }}>
          {ampm}
        </Text>
      </View>

      {/* ── Vertical divider ── */}
      <View style={{ width: 1, backgroundColor: theme.colors.border }} />

      {/* ── Content ── */}
      <View style={{ flex: 1, padding: theme.spacing.md, gap: 5 }}>

        {/* Tags + club row */}
        {(tags.length > 0 || event.clubs) && (
          <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 5 }}>
            {tags.map(tag => {
              const c = tagColors(tag)
              return (
                <View key={tag.id} style={{
                  paddingHorizontal: 7, paddingVertical: 2,
                  borderRadius: theme.radius.full,
                  backgroundColor: c.bg,
                  borderWidth: 1,
                  borderColor: c.border,
                }}>
                  <Text style={{ fontSize: 10, fontWeight: theme.font.weight.semibold, color: c.text }}>
                    {tag.name}
                  </Text>
                </View>
              )
            })}
            {event.clubs && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                <Ionicons name="people-outline" size={10} color={theme.colors.primary} />
                <Text style={{ fontSize: 10, fontWeight: theme.font.weight.semibold, color: theme.colors.primary }}>
                  {event.clubs.name}
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Title */}
        <Text
          style={{ fontSize: 15, fontWeight: theme.font.weight.semibold, color: theme.colors.text, lineHeight: 20 }}
          numberOfLines={2}
        >
          {event.title}
        </Text>

        {/* Location */}
        {event.location && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
            <Ionicons name="location-outline" size={12} color={theme.colors.subtext} />
            <Text style={{ fontSize: theme.font.size.sm, color: theme.colors.subtext, flex: 1 }} numberOfLines={1}>
              {event.location}
            </Text>
          </View>
        )}

        {/* Host */}
        <Text style={{ fontSize: theme.font.size.xs, color: theme.colors.subtext }}>
          by {event.profiles
            ? event.profiles.first_name
              ? `${event.profiles.first_name} ${event.profiles.last_name?.[0] ?? ''}`.trim()
              : event.profiles.username
            : 'unknown'}
          {waitlistedCount > 0 ? ` · ${waitlistedCount} waiting` : ''}
        </Text>

        {/* Capacity bar */}
        {event.max_attendees != null ? (
          <View style={{ marginTop: 2 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <Text style={{ fontSize: 10, fontWeight: theme.font.weight.medium, color: isFull ? theme.colors.error : theme.colors.subtext }}>
                {isFull ? 'Full' : `${spotsLeft} spot${spotsLeft !== 1 ? 's' : ''} left`}
              </Text>
              <Text style={{ fontSize: 10, color: theme.colors.subtext }}>
                {attendeeCount}/{event.max_attendees}
              </Text>
            </View>
            <View style={{ height: 4, backgroundColor: theme.colors.border, borderRadius: 2 }}>
              <View style={{
                height: 4,
                width: `${Math.round(fillRatio * 100)}%`,
                backgroundColor: barColor,
                borderRadius: 2,
              }} />
            </View>
          </View>
        ) : (
          <Text style={{ fontSize: 10, color: theme.colors.subtext, marginTop: 1 }}>
            {attendeeCount} attending
          </Text>
        )}

      </View>
    </TouchableOpacity>
  )
}

export const EventCard = memo(EventCardInner)
