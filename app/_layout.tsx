import { useEffect, useRef, useState } from 'react'
import { Animated, Image, Text, View } from 'react-native'
import { useFonts } from 'expo-font'
import {
  SpaceGrotesk_400Regular,
  SpaceGrotesk_500Medium,
  SpaceGrotesk_600SemiBold,
  SpaceGrotesk_700Bold,
} from '@expo-google-fonts/space-grotesk'
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter'
import { LinearGradient } from 'expo-linear-gradient'
import { Stack, usePathname, useRouter, useSegments } from 'expo-router'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { SessionProvider, useSession } from '../contexts/session'
import { isProtectedPath, setPostSignInRedirect, takePostSignInRedirect } from '../utils/authGate'
import { supabase } from '../lib/supabase'
import { theme } from '../constants'
import { initSentry, Sentry } from '../lib/sentry'
import { SentryErrorBoundary } from '../components/SentryErrorBoundary'
import { registerPushToken } from '../utils/pushNotifications'
import { useMinVersion } from '../hooks/useMinVersion'
import { UpdateRequiredScreen } from '../components/UpdateRequiredScreen'

initSentry()

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

/** Fade-out only — the splash stays up exactly as long as fonts + auth take to load. */
const SPLASH_FADE_MS = 200

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

function RootLayout() {
  return (
    <SessionProvider>
      <RootNavigator />
    </SessionProvider>
  )
}

function RootNavigator() {
  const [fontsLoaded] = useFonts({
    SpaceGrotesk_400Regular,
    SpaceGrotesk_500Medium,
    SpaceGrotesk_600SemiBold,
    SpaceGrotesk_700Bold,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  })

  const { userId, loading } = useSession()
  const updateRequirement = useMinVersion()
  const router = useRouter()
  const segments = useSegments()
  const pathname = usePathname()

  const ready = fontsLoaded && !loading
  const [splashVisible, setSplashVisible] = useState(true)
  const splashOpacity = useRef(new Animated.Value(1)).current

  // Data fetching starts as soon as the tree mounts (below the splash), so the
  // splash only covers font + session restore. No fixed minimum duration.
  useEffect(() => {
    if (!ready || !splashVisible) return
    Animated.timing(splashOpacity, { toValue: 0, duration: SPLASH_FADE_MS, useNativeDriver: true })
      .start(() => setSplashVisible(false))
  }, [ready, splashVisible, splashOpacity])

  // Per-user setup whenever someone signs in (cold start with a session included).
  useEffect(() => {
    if (!userId) return
    void prefetchUserAvatar()
    void registerPushToken()
  }, [userId])

  // Keep Sentry user context in sync with auth state
  useEffect(() => {
    Sentry.setUser(userId ? { id: userId } : null)
  }, [userId])

  // Guests may browse; only account-only routes bounce to login. Signed-in users
  // leave the auth screens (except reset-password, where the recovery link
  // creates a session but the user still has to set a new password).
  useEffect(() => {
    if (loading) return
    const inAuthGroup = segments[0] === '(auth)'
    const onResetPassword = (segments as string[])[1] === 'reset-password'
    if (!userId && !inAuthGroup && isProtectedPath(pathname)) {
      setPostSignInRedirect(pathname)
      router.replace('/(auth)/login')
    } else if (userId && inAuthGroup && !onResetPassword) {
      router.replace((takePostSignInRedirect() ?? '/(app)') as any)
    }
  }, [userId, loading, segments, pathname])

  return (
    <SentryErrorBoundary>
    <SafeAreaProvider>
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

      {updateRequirement && !splashVisible && (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
          <UpdateRequiredScreen requirement={updateRequirement} />
        </View>
      )}

      {splashVisible && (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
          <AppSplash opacity={splashOpacity} />
        </View>
      )}
    </GestureHandlerRootView>
    </SafeAreaProvider>
    </SentryErrorBoundary>
  )
}

export default Sentry.wrap(RootLayout)
