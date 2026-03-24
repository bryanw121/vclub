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
        name="event/[id]"
        options={{
          headerBackTitle: 'Events',
          gestureEnabled: true,
        }}
      />
    </Stack>
  )
}
