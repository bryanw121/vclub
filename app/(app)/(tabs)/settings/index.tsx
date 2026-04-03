import { useEffect } from 'react'
import { useNavigation } from 'expo-router'

/**
 * Settings are now accessed directly from the profile's menu cards.
 * This index screen auto-dismisses so it never appears as an intermediate step
 * in the navigation stack when returning from a sub-settings page.
 */
export default function SettingsIndexScreen() {
  const navigation = useNavigation()
  useEffect(() => {
    if (navigation.canGoBack()) navigation.goBack()
  }, [navigation])
  return null
}
