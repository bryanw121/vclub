import { useRef, useState } from 'react'
import { Animated, Platform, Pressable, View, Text, TouchableOpacity, useWindowDimensions } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { Stack, useRouter, usePathname } from 'expo-router'
import { theme } from '../../constants'
import { WebNavContext } from '../../contexts/webNav'

const FAB_OPTIONS = [
  { label: 'Open Play',     path: '/host?maxAttendees=18' },
  { label: 'Tournament',    path: '/host' },
  { label: 'From Template', path: '/host?mode=templates' },
]

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

const TABS = [
  { name: 'Events',  icon: 'calendar-outline'     as const, path: '/'        },
  { name: 'Clubs',   icon: 'people-outline'        as const, path: '/clubs'   },
  { name: 'Profile', icon: 'person-circle-outline' as const, path: '/profile' },
]

const SIDEBAR_BREAKPOINT = 768

function tabIndexFromPath(path: string): number {
  if (path.startsWith('/profile') || path.startsWith('/settings')) return 2
  if (path.startsWith('/clubs')) return 1
  return 0
}

export default function AppLayout() {
  const router = useRouter()
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)
  const [fabOpen, setFabOpen] = useState(false)
  const fabAnim = useRef(new Animated.Value(0)).current
  const { width: windowWidth } = useWindowDimensions()

  function goToTab(index: number) {
    router.replace(TABS[index].path as any)
  }

  function openFab() {
    setFabOpen(true)
    Animated.spring(fabAnim, { toValue: 1, useNativeDriver: true, tension: 120, friction: 8 }).start()
  }

  function closeFab() {
    Animated.timing(fabAnim, { toValue: 0, duration: 150, useNativeDriver: true }).start(() => setFabOpen(false))
  }

  function goHost(path: string) {
    closeFab()
    setTimeout(() => router.push(path as any), 160)
  }

  const sidebarActive = tabIndexFromPath(pathname)

  // ── Web (wide): sidebar always visible ───────────────────────────────────
  if (Platform.OS === 'web' && windowWidth >= SIDEBAR_BREAKPOINT) {
    return (
      <WebNavContext.Provider value={{ activeTab: sidebarActive, goToTab }}>
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
                <Text style={{
                  fontSize: theme.font.size.xl,
                  fontWeight: theme.font.weight.bold,
                  color: theme.colors.primary,
                }}>
                  vclub
                </Text>
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
              return (
                <TouchableOpacity
                  key={tab.name}
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
                  <Ionicons
                    name={tab.icon}
                    size={20}
                    color={active ? theme.colors.primary : theme.colors.subtext}
                  />
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
          <View style={{ flex: 1 }}>
            <Stack
              screenOptions={{
                headerStyle: { backgroundColor: theme.colors.background },
                headerTintColor: theme.colors.primary,
                headerShadowVisible: false,
                gestureEnabled: true,
              }}
            >
              <Stack.Screen name="(tabs)" options={{ headerShown: false, headerBackTitle: 'Back' }} />
              <Stack.Screen name="host" options={{ title: 'Host Event', headerBackTitle: 'Events', gestureEnabled: true }} />
              <Stack.Screen name="settings/index" options={{ title: '', gestureEnabled: true }} />
              <Stack.Screen name="settings/account" options={{ title: '', gestureEnabled: true }} />
              <Stack.Screen name="settings/feedback" options={{ title: '', gestureEnabled: true }} />
              <Stack.Screen name="settings/history" options={{ title: '', gestureEnabled: true }} />
              <Stack.Screen name="settings/kudos" options={{ title: '', gestureEnabled: true }} />
              <Stack.Screen name="settings/hosted" options={{ title: '', gestureEnabled: true }} />
              <Stack.Screen name="event/[id]" options={{ headerBackTitle: 'Events', gestureEnabled: true }} />
              <Stack.Screen name="(tabs)/profile/[id]" options={{ title: 'Profile', headerBackTitle: 'Back', gestureEnabled: true }} />
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
                {FAB_OPTIONS.map(opt => (
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
                      shadowColor: '#000',
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

            {/* FAB button */}
            {!pathname.startsWith('/host') && !pathname.startsWith('/profile') && !pathname.startsWith('/settings') && !pathname.startsWith('/clubs') && (
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
                  shadowColor: '#000',
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
      </WebNavContext.Provider>
    )
  }

  // ── Mobile: plain Stack — WebNavContext not needed on mobile ─────────────
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: theme.colors.background },
        headerTintColor: theme.colors.primary,
        headerShadowVisible: false,
        gestureEnabled: true,
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false, headerBackTitle: 'Back' }} />
      <Stack.Screen name="host" options={{ title: 'Host Event', headerBackTitle: 'Events', gestureEnabled: true }} />
      <Stack.Screen name="settings/index" options={{ title: '', gestureEnabled: true }} />
      <Stack.Screen name="settings/account" options={{ title: '', gestureEnabled: true }} />
      <Stack.Screen name="settings/feedback" options={{ title: '', gestureEnabled: true }} />
      <Stack.Screen name="settings/history" options={{ title: '', gestureEnabled: true }} />
      <Stack.Screen name="settings/kudos" options={{ title: '', gestureEnabled: true }} />
      <Stack.Screen name="settings/hosted" options={{ title: '', gestureEnabled: true }} />
      <Stack.Screen name="event/[id]" options={{ headerBackTitle: 'Events', gestureEnabled: true }} />
      <Stack.Screen name="(tabs)/profile/[id]" options={{ title: 'Profile', headerBackTitle: 'Back', gestureEnabled: true }} />
    </Stack>
  )
}
