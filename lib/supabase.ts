import AsyncStorage from '@react-native-async-storage/async-storage'
import { createClient } from '@supabase/supabase-js'
import { Platform } from 'react-native'
import 'react-native-url-polyfill/auto'
import { currentAppVersion } from '../utils/appVersion'

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!

// During static export (SSR), window doesn't exist — AsyncStorage would throw.
// Fall back to a no-op storage so the build can complete; sessions are
// only needed on the client where window is available.
const isSSR = typeof window === 'undefined'
const storage = isSSR
  ? { getItem: () => null, setItem: () => {}, removeItem: () => {} }
  : AsyncStorage

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  // Sent with every request so Edge Functions and logs can tell which app build is calling.
  global: { headers: { 'x-app-version': currentAppVersion(), 'x-app-platform': Platform.OS } },
  auth: {
    storage,
    autoRefreshToken: !isSSR,
    persistSession: !isSSR,
    // On web, Supabase must parse the #access_token hash from the redirect URL.
    // On native, deep-link handling is done by Expo Router — no URL to detect.
    detectSessionInUrl: Platform.OS === 'web',
  },
})
