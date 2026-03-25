import { Stack } from 'expo-router'
import { theme } from '../../constants'

export default function AppLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: theme.colors.background },
        headerTintColor: theme.colors.primary,
        headerShadowVisible: false,
        gestureEnabled: true,
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen
        name="settings/index"
        options={{
          title: 'Settings',
          headerBackTitle: 'Profile',
          gestureEnabled: true,
        }}
      />
      <Stack.Screen
        name="settings/account"
        options={{
          title: 'Account settings',
          headerBackTitle: 'Settings',
          gestureEnabled: true,
        }}
      />
      <Stack.Screen
        name="settings/feedback"
        options={{
          title: 'Submit feedback',
          headerBackTitle: 'Settings',
          gestureEnabled: true,
        }}
      />
      <Stack.Screen
        name="event/[id]"
        options={{
          headerBackTitle: 'Events',
          gestureEnabled: true,
        }}
      />
    </Stack>
  )
}
