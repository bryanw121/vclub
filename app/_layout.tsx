import { useEffect, useRef, useState } from 'react'
import { Animated, Image, Text, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { Stack, useRouter, useSegments } from 'expo-router'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import { theme } from '../constants'

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!
const AVATARS_BUCKET = 'avatars'

async function prefetchUserAvatar() {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    const userId = session?.user?.id
    if (!userId) return
    const { data } = await supabase
      .from('profiles')
      .select('avatar_url')
      .eq('id', userId)
      .single()
    const path = data?.avatar_url
    if (!path || /^https?:\/\//i.test(path)) return
    const url = `${SUPABASE_URL}/storage/v1/object/public/${AVATARS_BUCKET}/${path}`
    await Image.prefetch(url)
  } catch {}
}

const SPLASH_DURATION_MS = 1800

function AppSplash({ opacity }: { opacity: Animated.Value }) {
  return (
    <Animated.View style={{ flex: 1, opacity }}>
      <LinearGradient
        colors={['#4FC3F7', '#7C4DFF', '#E040FB']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 }}
      >
        <Text style={{ fontSize: 48, fontWeight: '800', color: '#fff', letterSpacing: -1 }}>vclub</Text>
        <View style={{ backgroundColor: 'rgba(255,255,255,0.25)', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
          <Text style={{ fontSize: 11, fontWeight: '700', color: '#fff', letterSpacing: 1.5 }}>BETA</Text>
        </View>
      </LinearGradient>
    </Animated.View>
  )
}

export default function RootLayout() {
  const { session, loading } = useAuth()
  const router = useRouter()
  const segments = useSegments()

  // splashVisible: true while the splash should be rendered (including fade-out)
  const [splashVisible, setSplashVisible] = useState(true)
  const splashOpacity = useRef(new Animated.Value(1)).current
  const splashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Tracks the previous session state to detect null→non-null (login) transitions
  const prevSessionRef = useRef<string | null | undefined>(undefined)

  function dismissSplash() {
    if (splashTimerRef.current) clearTimeout(splashTimerRef.current)
    Animated.timing(splashOpacity, { toValue: 0, duration: 350, useNativeDriver: true }).start(() => {
      setSplashVisible(false)
      splashOpacity.setValue(1) // reset for potential re-use after login
    })
  }

  useEffect(() => {
    if (loading) return

    const wasUnknown = prevSessionRef.current === undefined
    const wasLoggedOut = prevSessionRef.current === null
    const isLoggedIn = !!session
    prevSessionRef.current = session?.user?.id ?? null

    if (isLoggedIn && (wasUnknown || wasLoggedOut)) {
      // Cold start with session, or just logged in — show splash for SPLASH_DURATION_MS
      setSplashVisible(true)
      splashOpacity.setValue(1)
      if (splashTimerRef.current) clearTimeout(splashTimerRef.current)
      void prefetchUserAvatar()
      splashTimerRef.current = setTimeout(dismissSplash, SPLASH_DURATION_MS)
    } else if (!isLoggedIn && wasUnknown) {
      // Cold start, not logged in — no splash needed
      setSplashVisible(false)
    }
    // Token refreshes (wasLoggedIn → isLoggedIn): do nothing
  }, [loading, session])

  // Navigate only after splash is gone
  useEffect(() => {
    if (loading || splashVisible) return
    const inAuthGroup = segments[0] === '(auth)'
    // Don't redirect away from reset-password — the recovery token creates a session
    // but the user still needs to set a new password before entering the app.
    const onResetPassword = segments[1] === 'reset-password'
    if (!session && !inAuthGroup) router.replace('/(auth)/login')
    else if (session && inAuthGroup && !onResetPassword) router.replace('/(app)')
  }, [session, loading, splashVisible])

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: theme.colors.background },
          headerTintColor: theme.colors.primary,
          headerShadowVisible: false,
          gestureEnabled: true,
        }}
      >
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="(app)" options={{ headerShown: false }} />
      </Stack>

      {splashVisible && (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
          <AppSplash opacity={splashOpacity} />
        </View>
      )}
    </GestureHandlerRootView>
  )
}
