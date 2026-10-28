import { useState } from 'react'
import { ScrollView, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import Ionicons from '@expo/vector-icons/Ionicons'
import { useStackBackTitle } from '../../../../hooks/useStackBackTitle'
import { DELETE_CONFIRMATION, useAccountDeletion } from '../../../../hooks/useAccountDeletion'
import { Button } from '../../../../components/Button'
import { Input } from '../../../../components/Input'
import { ScreenState } from '../../../../components/ui'
import { DeletionPlanList } from '../../../../components/profile/DeletionPlanList'
import { shared, theme } from '../../../../constants'
import { routes } from '../../../../utils/routes'
import { notifyInfo } from '../../../../utils/notify'
import { useTabsShell } from '../../../../contexts/tabs'

/**
 * Settings → Account → Delete account. Shows exactly which clubs, tournaments
 * and upcoming events will be deleted, cancelled or handed to whom, then asks
 * the person to type DELETE before the delete-account function runs.
 */
export default function DeleteAccountScreen() {
  useStackBackTitle('Delete account')
  const router = useRouter()
  const { tabBarHeight } = useTabsShell()
  const { plan, isLoading, error, refetch, deleteAccount, isDeleting, deleteError } = useAccountDeletion()
  const [typed, setTyped] = useState('')
  const confirmed = typed.trim().toUpperCase() === DELETE_CONFIRMATION

  async function handleDelete() {
    if (!confirmed) return
    const done = await deleteAccount(DELETE_CONFIRMATION)
    if (!done) return
    router.replace(routes.events())
    notifyInfo('Account deleted', 'Your vteam account and its data have been deleted.')
  }

  return (
    <ScrollView
      style={shared.screen}
      contentContainerStyle={[shared.scrollContentSubpage, { gap: theme.spacing.md, paddingBottom: tabBarHeight + theme.spacing.xl }]}
      keyboardShouldPersistTaps="handled"
    >
      <View style={[shared.card, { gap: theme.spacing.sm }]}>
        <View style={[shared.row, { gap: theme.spacing.sm }]}>
          <Ionicons name="warning-outline" size={22} color={theme.colors.error} />
          <Text style={shared.subheading}>This can't be undone</Text>
        </View>
        <Text style={shared.body}>
          Deleting your account removes your profile, photos, messages, comments, RSVPs, kudos and settings.
          Past events you hosted stay for the people who played, without your name.
        </Text>
      </View>

      <ScreenState
        loading={isLoading}
        ready={!!plan}
        error={error ? 'Could not check what your account owns. Please try again.' : null}
        onRetry={() => void refetch({ force: true })}
      >
        {plan && <DeletionPlanList plan={plan} />}
      </ScreenState>

      {plan && (
        <View style={[shared.card, { gap: theme.spacing.sm }]}>
          <Input
            label={`Type ${DELETE_CONFIRMATION} to confirm`}
            value={typed}
            onChangeText={setTyped}
            placeholder={DELETE_CONFIRMATION}
            autoCapitalize="characters"
            autoCorrect={false}
            testID="delete-account-confirm-input"
          />
          {deleteError && <Text style={[shared.caption, { color: theme.colors.error }]}>{deleteError.message}</Text>}
          <Button
            label="Delete my account"
            variant="danger"
            onPress={() => void handleDelete()}
            loading={isDeleting}
            disabled={!confirmed || isDeleting}
          />
        </View>
      )}
    </ScrollView>
  )
}
