import { ActivityIndicator, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { shared, theme } from '../../constants'
import { Button } from '../Button'
import { EmptyState } from './EmptyState'
import type { ScreenStateProps } from '../../types'

const GENERIC_ERROR = 'Something went wrong. Check your connection and try again.'

/**
 * One place to decide what a data screen shows. Precedence:
 * loading (with nothing to show yet) > error > empty > children.
 * Pass `ready` when cached data exists so a background refetch never blanks the screen.
 */
export function ScreenState({
  loading, ready, error, onRetry, empty, emptyIcon, emptyTitle, emptyBody,
  emptyActionLabel, onEmptyAction, children,
}: ScreenStateProps) {
  if (loading && !ready) {
    return (
      <View style={shared.screenStateCenter} testID="screen-state-loading">
        <ActivityIndicator color={theme.colors.primary} />
      </View>
    )
  }

  if (error) {
    return (
      <View style={shared.screenStateCenter} testID="screen-state-error">
        <Ionicons name="cloud-offline-outline" size={36} color={theme.colors.border} />
        <Text style={[shared.caption, shared.emptyStateBody]}>{typeof error === 'string' ? error : GENERIC_ERROR}</Text>
        {onRetry && <Button label="Retry" variant="secondary" size="sm" fullWidth={false} onPress={onRetry} />}
      </View>
    )
  }

  if (empty) {
    return (
      <EmptyState
        testID="screen-state-empty"
        icon={emptyIcon}
        title={emptyTitle ?? 'Nothing here yet'}
        body={emptyBody}
        actionLabel={emptyActionLabel}
        onAction={onEmptyAction}
      />
    )
  }

  return <>{children}</>
}
