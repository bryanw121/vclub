import { Text, View } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { Button } from './Button'
import { shared, theme } from '../constants'
import { useGoToSignIn } from '../hooks/useRequireSignIn'

type Props = {
  icon: keyof typeof Ionicons.glyphMap
  title: string
  body: string
}

/** Shown in place of account-only tabs (Chat, Profile) while browsing as a guest. */
export function SignInPrompt({ icon, title, body }: Props) {
  const goToSignIn = useGoToSignIn()
  return (
    <View style={shared.signInPromptContainer} testID="sign-in-prompt">
      <View style={shared.signInPromptIcon}>
        <Ionicons name={icon} size={30} color={theme.colors.primary} />
      </View>
      <Text style={shared.signInPromptTitle} accessibilityRole="header">{title}</Text>
      <Text style={shared.signInPromptBody}>{body}</Text>
      <View style={shared.signInPromptActions}>
        <Button label="Sign in" onPress={() => goToSignIn('login')} />
        <Button label="Sign up" variant="secondary" onPress={() => goToSignIn('register')} />
      </View>
    </View>
  )
}
