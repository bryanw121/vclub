import { Alert, Platform } from 'react-native'

/**
 * Destructive confirm that works on native and web.
 * `Alert.alert` is a no-op in react-native-web — use this whenever the user
 * must explicitly confirm before a side effect runs.
 */
export function confirmDestructive(
  title: string,
  message: string,
  confirmLabel: string,
  onConfirm: () => void,
): void {
  if (Platform.OS === 'web') {
    const body = message ? `${title}\n\n${message}` : title
    if (typeof window !== 'undefined' && window.confirm(body)) onConfirm()
    return
  }
  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    { text: confirmLabel, style: 'destructive', onPress: onConfirm },
  ])
}
