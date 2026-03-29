import React, { memo } from 'react'
import { TouchableOpacity, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { shared, theme, formatEventDate, eventAttendeeDisplayCount } from '../constants'
import { EventWithDetails } from '../types'

function EventCardInner({ event }: { event: EventWithDetails }) {
  const router = useRouter()
  const attendeeCount = eventAttendeeDisplayCount(event)
  const isOverfull = !!event.max_attendees && attendeeCount > event.max_attendees
  const spotsLeft = event.max_attendees ? Math.max(0, event.max_attendees - attendeeCount) : null
  const isFull = spotsLeft === 0
  const tags = event.event_tags?.map(et => et.tags).sort((a, b) => a.display_order - b.display_order) ?? []

  return (
    <TouchableOpacity
      style={[shared.card, shared.eventCard]}
      onPress={() => router.push(`/event/${event.id}`)}
    >
      <View style={[shared.rowBetween, shared.mb_xs]}>
        <Text style={[shared.subheading, shared.eventCardTitle]}>{event.title}</Text>
        {spotsLeft !== null && (
          <View style={[shared.badge, isFull && shared.badgeFull]}>
            <Text style={shared.badgeText}>{isOverfull ? `${attendeeCount}/${event.max_attendees} spots` : isFull ? 'Full' : `${spotsLeft} spots`}</Text>
          </View>
        )}
      </View>
      <Text style={[shared.primaryText, shared.mb_xs]}>{formatEventDate(event.event_date, 'short')}</Text>
      {event.location && <Text style={[shared.caption, shared.mb_xs]}>{event.location}</Text>}
      {tags.length > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
          {tags.map(tag => (
            <View key={tag.id} style={shared.tag}>
              <Text style={shared.tagText}>{tag.name}</Text>
            </View>
          ))}
        </View>
      )}
      {event.clubs && (
        <View style={{ flexDirection: 'row', marginBottom: 8 }}>
          <View style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
            paddingHorizontal: theme.spacing.sm,
            paddingVertical: 2,
            borderRadius: theme.radius.full,
            backgroundColor: theme.colors.primary + '18',
            borderWidth: 1,
            borderColor: theme.colors.primary + '40',
          }}>
            <Ionicons name="people-outline" size={11} color={theme.colors.primary} />
            <Text style={{ fontSize: theme.font.size.xs, fontWeight: theme.font.weight.medium, color: theme.colors.primary }}>
              {event.clubs.name}
            </Text>
          </View>
        </View>
      )}
      <View style={shared.rowBetween}>
        <Text style={shared.caption}>by {event.profiles ? (event.profiles.first_name ? `${event.profiles.first_name} ${event.profiles.last_name?.[0] ?? ''}`.trim() : event.profiles.username) : 'unknown'}</Text>
        <Text style={shared.caption}>{attendeeCount} going</Text>
      </View>
    </TouchableOpacity>
  )
}

export const EventCard = memo(EventCardInner)
