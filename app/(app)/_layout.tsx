import { useEffect, useRef, useState } from 'react'
import { Animated, Image, Platform, Pressable, View, Text, TouchableOpacity } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { Stack, useRouter, usePathname } from 'expo-router'
import { theme, BADGE_DEFINITIONS, BREAKPOINTS, TABS, CREATE_MENU, tabIndexFromPath } from '../../constants'
import { WebNavContext } from '../../contexts/webNav'
import { SentryErrorBoundary } from '../../components/SentryErrorBoundary'
import { ChatUnreadProvider, useChatUnread } from '../../hooks/useChatUnread'
import { useIsNarrowWeb } from '../../hooks/useIsNarrowWeb'
import { useRequireSignIn } from '../../hooks/useRequireSignIn'
import { routes, type RouteString } from '../../utils/routes'

// Collect every badge image URL defined in code and prefetch them so the
// badges screen renders instantly without a network loading flash.
const BADGE_IMAGE_URLS: string[] = BADGE_DEFINITIONS.flatMap(def => [
  ...(def.imageUri ? [def.imageUri] : []),
  ...(def.tierImageUris ? Object.values(def.tierImageUris) : []),
])

function SidebarToggleIcon({ color }: { color: string }) {
  return (
    <View style={{
      width: 18, height: 14,
      borderWidth: 1.5, borderColor: color,
      borderRadius: 3,
      flexDirection: 'row',
      overflow: 'hidden',
    }}>
      <View style={{ width: 5, borderRightWidth: 1.5, borderRightColor: color }} />
      <View style={{ flex: 1 }} />
    </View>
  )
}


export default function AppLayout() {
  // The unread subscription lives in one provider so it runs exactly once across
  // the sidebar (web) and the mobile tab bar (both read it via useChatUnread).
  return (
    <ChatUnreadProvider>
      <AppLayoutInner />
    </ChatUnreadProvider>
  )
}

function AppLayoutInner() {
  const router = useRouter()
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)
  const chatUnread = useChatUnread()

  useEffect(() => {
    if (Platform.OS === 'web') return
    BADGE_IMAGE_URLS.forEach(url => { void Image.prefetch(url) })
  }, [])
  const [fabOpen, setFabOpen] = useState(false)
  const fabAnim = useRef(new Animated.Value(0)).current
  const isNarrowWeb = useIsNarrowWeb(BREAKPOINTS.sidebar)
  const requireSignIn = useRequireSignIn()

  function goToTab(index: number) {
    router.replace(TABS[index].path)
  }

  function openFab() {
    if (!requireSignIn()) return
    setFabOpen(true)
    Animated.spring(fabAnim, { toValue: 1, useNativeDriver: true, tension: 120, friction: 8 }).start()
  }

  function closeFab() {
    Animated.timing(fabAnim, { toValue: 0, duration: 150, useNativeDriver: true }).start(() => setFabOpen(false))
  }

  function goHost(path: RouteString) {
    closeFab()
    setTimeout(() => router.push(path), 160)
  }

  const sidebarActive = tabIndexFromPath(pathname)

  // ── Web (wide): sidebar always visible ───────────────────────────────────
  if (Platform.OS === 'web' && !isNarrowWeb) {
    return (
      <WebNavContext.Provider value={{ activeTab: sidebarActive, goToTab }}>
        <SentryErrorBoundary>
        <View style={{ flex: 1, flexDirection: 'row', backgroundColor: theme.colors.background }}>

          {/* Sidebar */}
          <View style={{
            width: collapsed ? 60 : 224,
            backgroundColor: theme.colors.card,
            borderRightWidth: 1,
            borderRightColor: theme.colors.border,
            paddingTop: 36,
            paddingHorizontal: collapsed ? 0 : theme.spacing.md,
            alignItems: collapsed ? 'center' : undefined,
          }}>
            {/* Logo + collapse toggle */}
            <View style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: collapsed ? 'center' : 'space-between',
              paddingLeft: collapsed ? 0 : theme.spacing.sm,
              marginBottom: theme.spacing.xl,
              paddingHorizontal: collapsed ? 0 : undefined,
            }}>
              {!collapsed && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={{
                    fontSize: theme.font.size.xl,
                    fontWeight: theme.font.weight.bold,
                    color: theme.colors.primary,
                  }}>
                    vclub
                  </Text>
                  <View style={{ backgroundColor: theme.colors.primary + '22', borderWidth: 1, borderColor: theme.colors.primary + '66', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
                    <Text style={{ fontSize: 10, fontWeight: '700', color: theme.colors.primary, letterSpacing: 1 }}>BETA</Text>
                  </View>
                </View>
              )}
              <TouchableOpacity
                onPress={() => setCollapsed(c => !c)}
                style={{ padding: 4 }}
                hitSlop={8}
              >
                <SidebarToggleIcon color={theme.colors.subtext} />
              </TouchableOpacity>
            </View>

            {TABS.map((tab, i) => {
              const active = sidebarActive === i
              const badge = tab.key === 'chat' && chatUnread > 0 ? chatUnread : 0
              return (
                <TouchableOpacity
                  key={tab.key}
                  onPress={() => goToTab(i)}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: collapsed ? 'center' : undefined,
                    gap: collapsed ? 0 : theme.spacing.sm,
                    paddingVertical: 10,
                    paddingHorizontal: collapsed ? 0 : theme.spacing.sm,
                    width: collapsed ? 40 : undefined,
                    height: collapsed ? 40 : undefined,
                    borderRadius: theme.radius.md,
                    marginBottom: theme.spacing.xs,
                    backgroundColor: active ? theme.colors.primary + '18' : 'transparent',
                  }}
                >
                  <View style={{ position: 'relative' }}>
                    <Ionicons
                      name={tab.icon}
                      size={20}
                      color={active ? theme.colors.primary : theme.colors.subtext}
                    />
                    {badge > 0 && (
                      <View style={{
                        position: 'absolute', top: -5, right: -8,
                        minWidth: 16, height: 16, borderRadius: 8,
                        backgroundColor: theme.colors.hot,
                        alignItems: 'center', justifyContent: 'center',
                        paddingHorizontal: 3,
                      }}>
                        <Text style={{ fontSize: 8, fontWeight: '800', color: theme.colors.white, lineHeight: 11 }}>
                          {badge > 99 ? '99+' : badge}
                        </Text>
                      </View>
                    )}
                  </View>
                  {!collapsed && (
                    <Text style={{
                      fontSize: theme.font.size.md,
                      fontWeight: active ? theme.font.weight.semibold : theme.font.weight.regular,
                      color: active ? theme.colors.primary : theme.colors.subtext,
                    }}>
                      {tab.name}
                    </Text>
                  )}
                </TouchableOpacity>
              )
            })}
          </View>

          {/* Content */}
          <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
            <Stack
              screenOptions={{
                headerStyle: { backgroundColor: theme.colors.background },
                headerTintColor: theme.colors.primary,
                headerShadowVisible: false,
                gestureEnabled: true,
                contentStyle: { backgroundColor: theme.colors.background },
              }}
            >
              <Stack.Screen name="(tabs)" options={{ headerShown: false, headerBackTitle: 'Back' }} />
              <Stack.Screen name="host" options={{ title: 'Host Event', headerBackTitle: 'Events', gestureEnabled: true, presentation: 'modal', ...(Platform.OS === 'web' ? { animationEnabled: false } : {}) }} />
              <Stack.Screen name="event/[id]" options={{ headerBackTitle: 'Events', gestureEnabled: true }} />
              <Stack.Screen name="profile/[id]" options={{ headerShown: false, gestureEnabled: true }} />
              <Stack.Screen name="club/[id]" options={{ headerShown: false, gestureEnabled: true }} />
              <Stack.Screen name="club/create" options={{ title: 'Create club', headerBackTitle: 'Clubs', gestureEnabled: true }} />
              <Stack.Screen name="notifications" options={{ title: 'Notifications', headerBackTitle: 'Back' }} />
              <Stack.Screen name="chat/[id]" options={{ headerShown: false, gestureEnabled: true }} />
            </Stack>

            {/* FAB backdrop */}
            {fabOpen && (
              <Pressable
                style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
                onPress={closeFab}
              />
            )}

            {/* FAB popup options */}
            {fabOpen && (
              <Animated.View
                style={{
                  position: 'absolute',
                  bottom: 32 + 52 + theme.spacing.sm,
                  right: 32,
                  gap: theme.spacing.sm,
                  alignItems: 'flex-end',
                  opacity: fabAnim,
                  transform: [{ translateY: fabAnim.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }],
                }}
              >
                {CREATE_MENU.map(opt => (
                  <TouchableOpacity
                    key={opt.label}
                    onPress={() => goHost(opt.path)}
                    style={{
                      backgroundColor: theme.colors.card,
                      borderRadius: theme.radius.full,
                      paddingVertical: theme.spacing.sm,
                      paddingHorizontal: theme.spacing.lg,
                      borderWidth: 1,
                      borderColor: theme.colors.border,
                      shadowColor: theme.colors.black,
                      shadowOffset: { width: 0, height: 2 },
                      shadowOpacity: 0.12,
                      shadowRadius: 4,
                    }}
                  >
                    <Text style={{ fontSize: theme.font.size.md, fontWeight: theme.font.weight.medium, color: theme.colors.text }}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </Animated.View>
            )}

            {/* FAB button. Wide web shows it on Events only; the mobile tab bar shows its
                create button on every tab. Long-standing difference, kept as is. */}
            {pathname === routes.events() && (
              <TouchableOpacity
                onPress={fabOpen ? closeFab : openFab}
                style={{
                  position: 'absolute',
                  bottom: 32,
                  right: 32,
                  width: 52,
                  height: 52,
                  borderRadius: 26,
                  backgroundColor: theme.colors.primary,
                  alignItems: 'center',
                  justifyContent: 'center',
                  shadowColor: theme.colors.black,
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.2,
                  shadowRadius: 6,
                }}
              >
                <Animated.View style={{ transform: [{ rotate: fabAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '45deg'] }) }] }}>
                  <Ionicons name="add" size={28} color={theme.colors.white} />
                </Animated.View>
              </TouchableOpacity>
            )}
          </View>

        </View>
        </SentryErrorBoundary>
      </WebNavContext.Provider>
    )
  }

  // ── Mobile: plain Stack — WebNavContext not needed on mobile ─────────────
  return (
    <SentryErrorBoundary>
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: theme.colors.background },
        headerTintColor: theme.colors.primary,
        headerShadowVisible: false,
        gestureEnabled: true,
        contentStyle: { backgroundColor: theme.colors.background },
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false, headerBackTitle: 'Back' }} />
      <Stack.Screen name="host" options={{ title: 'Host Event', headerBackTitle: 'Events', gestureEnabled: true, presentation: 'modal' }} />
      <Stack.Screen name="event/[id]" options={{ headerBackTitle: 'Events', gestureEnabled: true }} />
      <Stack.Screen name="profile/[id]" options={{ headerShown: false, gestureEnabled: true }} />
      <Stack.Screen name="club/[id]" options={{ headerShown: false, gestureEnabled: true }} />
      <Stack.Screen name="club/create" options={{ title: 'Create club', headerBackTitle: 'Clubs', gestureEnabled: true }} />
      <Stack.Screen name="notifications" options={{ title: 'Notifications', headerBackTitle: 'Back' }} />
      <Stack.Screen name="chat/[id]" options={{ headerShown: false, gestureEnabled: true }} />
    </Stack>
    </SentryErrorBoundary>
  )
}
