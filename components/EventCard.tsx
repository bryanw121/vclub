import { TouchableOpacity, Text, View, StyleSheet } from 'react-native'
import { useRouter } from 'expo-router'
import { shared, theme, formatEventDate } from '../constants'
import { EventWithDetails } from '../types'

type Props = {
  event: EventWithDetails
}

export function EventCard({ event }: Props) {
  const router = useRouter()
  const attendeeCount = event.event_attendees?.length ?? 0
  const spotsLeft = event.max_attendees ? event.max_attendees - attendeeCount : null
  const isFull = spotsLeft === 0

  return (
    <TouchableOpacity
      style={[shared.card, styles.card]}
      onPress={() => router.push(`/event/${event.id}`)}
    >
      <View style={[shared.rowBetween, shared.mb_xs]}>
        <Text style={[shared.subheading, styles.title]}>{event.title}</Text>
        {spotsLeft !== null && (
          <View style={[shared.badge, isFull && shared.badgeFull]}>
            <Text style={shared.badgeText}>{isFull ? 'Full' : `${spotsLeft} spots`}</Text>
          </View>
        )}
      </View>
      <Text style={[shared.primaryText, shared.mb_xs]}>{formatEventDate(event.event_date, 'short')}</Text>
      {event.location && <Text style={[shared.caption, shared.mb_sm]}>{event.location}</Text>}
      <View style={shared.rowBetween}>
        <Text style={shared.caption}>by {event.profiles?.username ?? 'unknown'}</Text>
        <Text style={shared.caption}>{attendeeCount} going</Text>
      </View>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  card: {
    marginBottom: theme.spacing.md,
  },
  title: {
    flex: 1,
    marginRight: theme.spacing.sm,
  },
})
