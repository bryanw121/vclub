import { ScrollView, Text, View } from 'react-native'
import { Stack } from 'expo-router'
import { shared } from '../../../constants'

export default function AccountSettingsScreen() {
  return (
    <View style={shared.screen}>
      <Stack.Screen options={{ title: 'Account settings' }} />
      <ScrollView contentContainerStyle={shared.scrollContent}>
        <View style={shared.card}>
          <Text style={shared.subheading}>Account settings</Text>
          <View style={shared.mt_sm} />
          <Text style={shared.caption}>Coming soon.</Text>
        </View>
      </ScrollView>
    </View>
  )
}

