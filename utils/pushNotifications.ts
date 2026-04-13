import { Platform } from 'react-native'
import { supabase } from '../lib/supabase'

/**
 * Registers for Expo push notifications and saves the token to the push_tokens table.
 * Call once after the user is authenticated.
 * On web or simulator, this is a no-op.
 */
export async function registerPushToken(): Promise<void> {
  if (Platform.OS === 'web') return

  try {
    const Device = await import('expo-device')
    if (!Device.default.isDevice) return // Simulators can't receive push notifications

    const Notifications = await import('expo-notifications')

    // Configure how notifications are shown when app is foregrounded
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    })

    const { status: existingStatus } = await Notifications.getPermissionsAsync()
    let finalStatus = existingStatus

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync()
      finalStatus = status
    }

    if (finalStatus !== 'granted') return

    const tokenData = await Notifications.getExpoPushTokenAsync()
    const token = tokenData.data

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    await supabase
      .from('push_tokens')
      .upsert({
        user_id: user.id,
        token,
        platform: Platform.OS as 'ios' | 'android',
        updated_at: new Date().toISOString(),
      }, { onConflict: 'token' })
  } catch {
    // Non-critical — push notifications are best-effort
  }
}
