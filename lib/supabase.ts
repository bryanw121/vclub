import AsyncStorage from '@react-native-async-storage/async-storage'
import { createClient } from '@supabase/supabase-js'
import type { AppDatabase } from '../types/database.pending'
import { AppState, Platform } from 'react-native'
import 'react-native-url-polyfill/auto'

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!

// During static export (SSR), window doesn't exist — AsyncStorage would throw.
// Fall back to a no-op storage so the build can complete; sessions are
// only needed on the client where window is available.
const isSSR = typeof window === 'undefined'
const storage = isSSR
  ? { getItem: () => null, setItem: () => {}, removeItem: () => {} }
  : AsyncStorage

export const supabase = createClient<AppDatabase>(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage,
    autoRefreshToken: !isSSR,
    persistSession: !isSSR,
    // On web, Supabase must parse the #access_token hash from the redirect URL.
    // On native, deep-link handling is done by Expo Router — no URL to detect.
    detectSessionInUrl: Platform.OS === 'web',
  },
})

// Native: the token refresh timer only runs while the app is in the
// foreground (Supabase's React Native guidance). A backgrounded app otherwise
// wakes with an expired access token, and the first requests / realtime joins
// after resume fail until the next tick. Web keeps the default visibility-based
// handling; SSR has no session to refresh.
if (Platform.OS !== 'web' && !isSSR) {
  AppState.addEventListener('change', state => {
    if (state === 'active') void supabase.auth.startAutoRefresh()
    else void supabase.auth.stopAutoRefresh()
  })
}
