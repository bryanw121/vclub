import { Alert, View, Text } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useStackBackTitle } from '../../../../hooks/useStackBackTitle'
import { supabase } from '../../../../lib/supabase'
import { Button } from '../../../../components/Button'
import { shared, theme } from '../../../../constants'

export default function AccountSettingsScreen() {
  useStackBackTitle('Account settings')

  async function handleSignOut() {
    const { error } = await supabase.auth.signOut()
    if (error) Alert.alert('Error', error.message)
  }

  return (
    <View style={shared.screen}>
      <View style={[shared.scrollContentSubpage, { flex: 1 }]}>
        <View style={[shared.card, { alignItems: 'center', gap: theme.spacing.md, paddingVertical: theme.spacing.xl }]}>
          <Ionicons name="construct-outline" size={36} color={theme.colors.subtext} />
          <View style={{ alignItems: 'center', gap: theme.spacing.xs }}>
            <Text style={shared.subheading}>Coming soon</Text>
            <Text style={[shared.caption, { textAlign: 'center' }]}>
              Account settings like email and password changes are on the way.
            </Text>
          </View>
        </View>

        <View style={[shared.card, { marginTop: theme.spacing.md }]}>
          <Button label="Sign out" onPress={handleSignOut} variant="danger" />
        </View>
      </View>
    </View>
  )
}
