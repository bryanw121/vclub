import { View, FlatList, Text, RefreshControl } from 'react-native'
import { useEvents } from '../../../hooks/useEvents'
import { EventCard } from '../../../components/EventCard'
import { shared, theme } from '../../../constants'

export default function EventList() {
  const { events, loading, error, refetch } = useEvents()

  if (error) {
    return (
      <View style={shared.centered}>
        <Text style={shared.errorText}>{error}</Text>
      </View>
    )
  }

  return (
    <View style={shared.screen}>
      <FlatList
        data={events}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <EventCard event={item} />}
        contentContainerStyle={shared.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={refetch}
            tintColor={theme.colors.primary}
          />
        }
        ListEmptyComponent={
          !loading ? <Text style={shared.caption}>no upcoming events</Text> : null
        }
      />
    </View>
  )
}
