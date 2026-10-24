import { Text, TouchableOpacity } from 'react-native'
import { useRouter } from 'expo-router'
import { shared } from '../constants'

/** Top-right header action for guests; takes the place of the notifications bell. */
export function SignInButton() {
  const router = useRouter()
  return (
    <TouchableOpacity
      onPress={() => router.push('/(auth)/login' as any)}
      style={shared.signInButton}
      accessibilityRole="button"
      accessibilityLabel="Sign in or sign up"
      hitSlop={6}
      testID="header-sign-in"
    >
      <Text style={shared.signInButtonLabel}>Sign in</Text>
    </TouchableOpacity>
  )
}
