import { Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { Button } from './Button'
import { shared, theme } from '../constants'

type Props = {
  icon: keyof typeof Ionicons.glyphMap
  title: string
  body: string
}

/** Shown in place of account-only tabs (Chat, Profile) while browsing as a guest. */
export function SignInPrompt({ icon, title, body }: Props) {
  const router = useRouter()
  return (
    <View style={shared.signInPromptContainer} testID="sign-in-prompt">
      <View style={shared.signInPromptIcon}>
        <Ionicons name={icon} size={30} color={theme.colors.primary} />
      </View>
      <Text style={shared.signInPromptTitle} accessibilityRole="header">{title}</Text>
      <Text style={shared.signInPromptBody}>{body}</Text>
      <View style={shared.signInPromptActions}>
        <Button label="Sign in" onPress={() => router.push('/(auth)/login' as any)} />
        <Button label="Sign up" variant="secondary" onPress={() => router.push('/(auth)/register' as any)} />
      </View>
    </View>
  )
}
