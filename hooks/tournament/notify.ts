import { Alert, Platform } from 'react-native'
import { TOURNAMENT_GENERIC_ERROR } from '../../constants/tournamentCopy'

/** `Alert.alert` is a no-op on react-native-web, so fall back to `window.alert` there. */
export function notify(title: string, message?: string): void {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') window.alert(message ? `${title}\n\n${message}` : title)
    return
  }
  Alert.alert(title, message)
}

/** Tell the user a write failed, using the server's message when it has one. */
export function notifyError(title: string, error: unknown): void {
  const message = error instanceof Error && error.message ? error.message : TOURNAMENT_GENERIC_ERROR
  notify(title, message)
}
