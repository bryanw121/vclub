import React, { memo } from 'react'
import { TouchableOpacity, Text, View, Image } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useRouter, usePathname } from 'expo-router'
import { theme, eventAttendeeDisplayCount } from '../constants'
import type { EventWithDetails, Tag } from '../types'

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? ''
function avatarUri(ref: string | null | undefined): string | null {
  if (!ref) return null
  if (ref.startsWith('http')) return ref
  return `${SUPABASE_URL}/storage/v1/render/image/public/avatars/${ref}?width=80&height=80&quality=70&resize=cover`
}

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

function EventCardInner({ event, from: fromOverride }: { event: EventWithDetails; from?: string }) {
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

  const eventTypeTags = event.event_tags
    ?.filter(et => et.tags.category === 'event_type')
    .map(et => et.tags)
    .sort((a, b) => a.display_order - b.display_order) ?? []

  const skillTags = event.event_tags
    ?.filter(et => et.tags.category === 'skill_level')
    .map(et => et.tags)
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
      onPress={() => router.push(`/event/${event.id}?from=${encodeURIComponent(fromOverride ?? pathname)}` as any)}
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

        {/* Event type tags + club row */}
        {(eventTypeTags.length > 0 || event.clubs) && (
          <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 5 }}>
            {eventTypeTags.map(tag => {
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

        {/* Skill level tags row */}
        {skillTags.length > 0 && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
            {skillTags.map(tag => {
              const c = tagColors(tag)
              return (
                <View key={tag.id} style={{
                  paddingHorizontal: 6, paddingVertical: 1,
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
          </View>
        )}

        {/* Title */}
        <Text
          style={{ fontSize: 15, fontWeight: theme.font.weight.semibold, color: theme.colors.primary, lineHeight: 20 }}
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

        {/* Attendee preview + host */}
        {(() => {
          const previews = (event.attendee_previews ?? []).slice(0, 2)
          const overflow = attendeeCount > previews.length ? attendeeCount - previews.length : 0
          const hostName = event.profiles
            ? event.profiles.first_name
              ? `${event.profiles.first_name} ${event.profiles.last_name?.[0] ?? ''}`.trim()
              : event.profiles.username
            : 'unknown'
          if (previews.length === 0) {
            return (
              <Text style={{ fontSize: theme.font.size.xs, color: theme.colors.subtext }}>
                by {hostName}{waitlistedCount > 0 ? ` · ${waitlistedCount} waiting` : ''}
              </Text>
            )
          }
          return (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
              <View style={{ flexDirection: 'row' }}>
                {previews.map((p, i) => {
                  const uri = avatarUri(p.profiles?.avatar_url)
                  const initials = p.profiles?.first_name?.[0]?.toUpperCase() ?? '?'
                  return (
                    <View key={p.user_id} style={{
                      width: 22, height: 22, borderRadius: 11,
                      backgroundColor: '#E8E2FF',
                      borderWidth: 1.5, borderColor: theme.colors.card,
                      marginLeft: i > 0 ? -6 : 0,
                      alignItems: 'center', justifyContent: 'center',
                      overflow: 'hidden',
                    }}>
                      {uri
                        ? <Image source={{ uri }} style={{ width: 22, height: 22 }} />
                        : <Text style={{ fontSize: 9, fontWeight: theme.font.weight.bold, color: theme.colors.primary }}>{initials}</Text>
                      }
                    </View>
                  )
                })}
                {overflow > 0 && (
                  <View style={{
                    width: 22, height: 22, borderRadius: 11,
                    backgroundColor: theme.colors.border,
                    borderWidth: 1.5, borderColor: theme.colors.card,
                    marginLeft: -6,
                    alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Text style={{ fontSize: 8, fontWeight: theme.font.weight.semibold, color: theme.colors.subtext }}>+{overflow}</Text>
                  </View>
                )}
              </View>
              <Text style={{ fontSize: theme.font.size.xs, color: theme.colors.subtext }}>
                by {hostName}{waitlistedCount > 0 ? ` · ${waitlistedCount} waiting` : ''}
              </Text>
            </View>
          )
        })()}

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

export const EventCard = memo(EventCardInner) as typeof EventCardInner
