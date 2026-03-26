import { useState } from 'react'
import { Platform, View, Text, TouchableOpacity, useWindowDimensions } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { Stack, useRouter, usePathname } from 'expo-router'
import { theme } from '../../constants'
import { WebNavContext } from '../../contexts/webNav'

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
  { name: 'Events',  icon: 'calendar-outline'     as const, index: 0 },
  { name: 'Host',    icon: 'add-circle-outline'    as const, index: 1 },
  { name: 'Profile', icon: 'person-circle-outline' as const, index: 2 },
]

const SIDEBAR_BREAKPOINT = 768

export default function AppLayout() {
  const router = useRouter()
  const pathname = usePathname()
  const [activeTab, setActiveTab] = useState(0)
  const [collapsed, setCollapsed] = useState(false)
  const { width: windowWidth } = useWindowDimensions()

  function goToTab(index: number) {
    setActiveTab(index)
    const onTabs = !pathname.includes('/event/') && !pathname.includes('/settings')
    if (!onTabs) router.replace('/(app)/(tabs)')
  }

  const sidebarActive = pathname.includes('/settings')
    ? 2
    : pathname.includes('/event/')
      ? 0
      : activeTab

  // ── Web (wide): sidebar always visible ───────────────────────────────────
  if (Platform.OS === 'web' && windowWidth >= SIDEBAR_BREAKPOINT) {
    return (
      <WebNavContext.Provider value={{ activeTab, goToTab }}>
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

            {TABS.map(tab => {
              const active = sidebarActive === tab.index
              return (
                <TouchableOpacity
                  key={tab.name}
                  onPress={() => goToTab(tab.index)}
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
          <View style={{ flex: 1, overflow: 'hidden' }}>
            <Stack
              screenOptions={{
                headerStyle: { backgroundColor: theme.colors.background },
                headerTintColor: theme.colors.primary,
                headerShadowVisible: false,
                gestureEnabled: true,
              }}
            >
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
              <Stack.Screen name="settings/index" options={{ title: 'Settings', headerBackTitle: 'Profile', gestureEnabled: true }} />
              <Stack.Screen name="settings/account" options={{ title: 'Account settings', headerBackTitle: 'Settings', gestureEnabled: true }} />
              <Stack.Screen name="settings/feedback" options={{ title: 'Submit feedback', headerBackTitle: 'Settings', gestureEnabled: true }} />
              <Stack.Screen name="event/[id]" options={{ headerBackTitle: 'Events', gestureEnabled: true }} />
            </Stack>
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
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="settings/index" options={{ title: 'Settings', headerBackTitle: 'Profile', gestureEnabled: true }} />
      <Stack.Screen name="settings/account" options={{ title: 'Account settings', headerBackTitle: 'Settings', gestureEnabled: true }} />
      <Stack.Screen name="settings/feedback" options={{ title: 'Submit feedback', headerBackTitle: 'Settings', gestureEnabled: true }} />
      <Stack.Screen name="event/[id]" options={{ headerBackTitle: 'Events', gestureEnabled: true }} />
    </Stack>
  )
}
