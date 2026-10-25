import { Alert, Platform } from 'react-native'
import { GENERIC_ERROR_MESSAGE } from '../constants/copy'

/**
 * One-button alerts that work on native and web. `Alert.alert` is a no-op in
 * react-native-web, so fall back to `window.alert` there.
 */
export function notifyInfo(title: string, message?: string): void {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') window.alert(message ? `${title}\n\n${message}` : title)
    return
  }
  Alert.alert(title, message)
}

/**
 * Tell the user a write failed. `message` may be the text to show, or the
 * caught error (its message is shown when it has one); otherwise
 * `GENERIC_ERROR_MESSAGE`.
 */
export function notifyError(title: string, message?: unknown): void {
  const text =
    typeof message === 'string' && message
      ? message
      : message instanceof Error && message.message
        ? message.message
        : GENERIC_ERROR_MESSAGE
  notifyInfo(title, text)
}
