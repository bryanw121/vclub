import { View, Text } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { Stack } from 'expo-router'
import { shared, theme } from '../../../constants'

export default function ClubsScreen() {
  return (
    <View style={[shared.centered, { flex: 1, backgroundColor: theme.colors.background, gap: theme.spacing.md }]}>
      <Stack.Screen options={{ title: 'Clubs' }} />
      <Ionicons name="people-outline" size={56} color={theme.colors.subtext} />
      <Text style={{ fontSize: theme.font.size.xl, fontWeight: theme.font.weight.semibold, color: theme.colors.text }}>
        Clubs
      </Text>
      <Text style={[shared.caption, { textAlign: 'center', maxWidth: 260 }]}>
        Create and manage volleyball clubs, invite members, and organize team events — coming soon.
      </Text>
    </View>
  )
}
