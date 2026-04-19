import React, { useCallback, useRef, useState } from "react";
import { useFocusEffect, Stack, usePathname, useRouter } from "expo-router";
import { Animated, Platform, Pressable, Text, TouchableOpacity, View, useWindowDimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Slot } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { TabsContext } from "../../../contexts/tabs";
import { useWebNav } from "../../../contexts/webNav";
import { theme } from "../../../constants";
import { useChatUnread } from "../../../hooks/useChatUnread";

// Pager indices: 0=Events, 1=Clubs, 2=Chat, 3=Profile
const MOBILE_NAV_TABS = [
  { name: "Events",  icon: "calendar-outline"     as const, pageIndex: 0 },
  { name: "Clubs",   icon: "people-outline"        as const, pageIndex: 1 },
  { name: "Chat",    icon: "chatbubbles-outline"   as const, pageIndex: 2 },
  { name: "Profile", icon: "person-circle-outline" as const, pageIndex: 3 },
];

const FAB_OPTIONS = [
  { label: "Open Play",     path: "/host?maxAttendees=18" },
  { label: "Tournament",    path: "/host" },
  { label: "From Template", path: "/host?mode=templates" },
];

const SIDEBAR_BREAKPOINT = 768;

export default function TabsLayout() {
  const [activeTabIndex, setActiveTabIndex] = useState(0);
  const [eventsRefreshTick, setEventsRefreshTick] = useState(0);
  const pagerBlocked = useRef(false);

  const focusCount = useRef(0);
  useFocusEffect(useCallback(() => {
    focusCount.current += 1;
    if (focusCount.current > 1) setEventsRefreshTick(t => t + 1);
  }, []));

  const [fabOpen, setFabOpen] = useState(false);
  const fabAnim = useRef(new Animated.Value(0)).current;
  const insets = useSafeAreaInsets();

  // In a mobile browser the home indicator area is already covered by the browser
  // chrome, so applying the full safe-area-inset-bottom creates a visible gap
  // between the tab bar and the URL bar. Zero it out unless in standalone mode.
  const isWebBrowser = Platform.OS === 'web' && typeof window !== 'undefined' &&
    !(window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone === true)
  const topInset = isWebBrowser ? 0 : insets.top
  const bottomInset = isWebBrowser ? 0 : (insets.bottom || theme.spacing.md)

  const tabBarTranslateY = useRef(new Animated.Value(0)).current;
  const tabBarNaturalHeight = useRef(60);
  const [tabBarHeight, setTabBarHeight] = useState(60);
  const tabBarHiddenRef = useRef(false);
  const setTabBarHidden = useCallback((hidden: boolean) => {
    if (tabBarHiddenRef.current === hidden) return;
    tabBarHiddenRef.current = hidden;
    Animated.timing(tabBarTranslateY, {
      toValue: hidden ? tabBarNaturalHeight.current : 0,
      duration: 220,
      useNativeDriver: Platform.OS !== 'web',
    }).start();
  }, [tabBarTranslateY]);
  const webNav = useWebNav();
  const router = useRouter();
  const pathname = usePathname();
  const { width: windowWidth } = useWindowDimensions();

  // ── Web (wide): sidebar in (app)/_layout — let Expo Router render the route ─
  if (Platform.OS === "web" && windowWidth >= SIDEBAR_BREAKPOINT) {
    return (
      <TabsContext.Provider value={{
        goToTab: webNav.goToTab,
        activeTabIndex: 0,
        eventsRefreshTick,
        pagerBlocked,
        setTabBarHidden: () => {},
        tabBarHeight: 0,
      }}>
        <View style={{ flex: 1 }}>
          <Slot />
        </View>
      </TabsContext.Provider>
    );
  }

  function closeFab() {
    Animated.timing(fabAnim, { toValue: 0, duration: 150, useNativeDriver: true }).start(() => setFabOpen(false));
  }

  function goToTab(index: number) {
    setActiveTabIndex(index);
    if (fabOpen) closeFab();
    setTabBarHidden(false);
  }

  const chatUnread = useChatUnread();

  /** When a stack screen (settings or another user's profile) is open, switch tabs by resetting the stack to the right home route. */
  function handleTabPress(tabIndex: number) {
    if (pathname.startsWith("/settings") || /^\/profile\/[^/]+$/.test(pathname) || pathname.startsWith("/chat")) {
      if (tabIndex === 0) router.replace("/" as any);
      else if (tabIndex === 1) router.replace("/clubs" as any);
      else if (tabIndex === 2) router.replace("/chat" as any);
      else router.replace("/profile" as any);
    }
    goToTab(tabIndex);
  }

  function openFab() {
    setFabOpen(true);
    Animated.spring(fabAnim, { toValue: 1, useNativeDriver: true, tension: 120, friction: 8 }).start();
  }

  function goHost(path: string) {
    closeFab();
    setTimeout(() => router.push(path as any), 160);
  }

  const onSettingsOrUserProfile =
    pathname.startsWith("/settings") || /^\/profile\/[^/]+$/.test(pathname);
  const showCreateOptions = activeTabIndex === 0 && !onSettingsOrUserProfile;

  return (
    <TabsContext.Provider value={{
      goToTab,
      activeTabIndex,
      eventsRefreshTick,
      pagerBlocked,
      setTabBarHidden,
      tabBarHeight,
    }}>
      <View style={{ flex: 1, backgroundColor: theme.colors.background, paddingTop: topInset }}>
        <Stack
          screenOptions={({ route }) => {
            const isMain = route.name === "(main)";
            return {
              headerShown: !isMain,
              headerShadowVisible: false,
              headerTintColor: theme.colors.primary,
              headerStyle: { backgroundColor: theme.colors.background },
              gestureEnabled: true,
              animation: "slide_from_right",
              ...(Platform.OS === "ios" && !isMain
                ? { fullScreenGestureEnabled: true }
                : {}),
              contentStyle: {
                backgroundColor: theme.colors.background,
                ...(isMain ? {} : { paddingBottom: tabBarHeight }),
              },
            };
          }}
        />

        {fabOpen && (
          <Pressable
            style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
            onPress={closeFab}
          />
        )}

        {fabOpen && (
          <Animated.View
            style={{
              position: "absolute",
              bottom: tabBarHeight + theme.spacing.sm,
              right: theme.spacing.lg,
              gap: theme.spacing.sm,
              alignItems: "flex-end",
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
                  shadowColor: "#000",
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.12,
                  shadowRadius: 4,
                  elevation: 4,
                }}
              >
                <Text style={{ fontFamily: theme.fonts.bodyMedium, fontSize: theme.font.size.md, color: theme.colors.text }}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </Animated.View>
        )}

        {/* FAB button is now embedded in the nav bar — no separate FAB */}

        <Animated.View
          style={{
            position: 'absolute', bottom: 0, left: 0, right: 0,
            transform: [{ translateY: tabBarTranslateY }],
          }}
          onLayout={e => {
            const h = e.nativeEvent.layout.height;
            tabBarNaturalHeight.current = h;
            setTabBarHeight(h);
          }}
        >
          {/* Bottom padding spacer — counted in tabBarHeight for content offset */}
          <View style={{ paddingBottom: Math.max(bottomInset, 10) + 10, backgroundColor: theme.colors.background }}>
            <View style={{
              flexDirection: "row",
              marginHorizontal: 14,
              backgroundColor: theme.colors.card,
              borderRadius: 26,
              paddingVertical: 10,
              paddingHorizontal: 10,
              alignItems: 'center',
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 8 },
              shadowOpacity: 0.25,
              shadowRadius: 20,
              elevation: 12,
            }}>
              {MOBILE_NAV_TABS.map((tab, idx) => {
                const active = activeTabIndex === tab.pageIndex;
                const badge = tab.name === 'Chat' && chatUnread > 0 ? chatUnread : 0;

                // Insert Create button between Clubs (idx=1) and Chat (idx=2)
                const createBtn = idx === 2 ? (
                  <TouchableOpacity
                    key="create"
                    onPress={fabOpen ? closeFab : openFab}
                    style={{
                      width: 46, height: 46, borderRadius: 15,
                      backgroundColor: fabOpen ? theme.colors.accent + 'CC' : theme.colors.accent,
                      alignItems: 'center', justifyContent: 'center',
                      shadowColor: theme.colors.accent,
                      shadowOffset: { width: 0, height: 4 },
                      shadowOpacity: 0.5,
                      shadowRadius: 8,
                      elevation: 6,
                    }}
                  >
                    <Animated.View style={{ transform: [{ rotate: fabAnim.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "45deg"] }) }] }}>
                      <Ionicons name="add" size={24} color={theme.colors.accentInk} />
                    </Animated.View>
                  </TouchableOpacity>
                ) : null;

                return (
                  <React.Fragment key={tab.name}>
                    {createBtn}
                    <TouchableOpacity
                      onPress={() => handleTabPress(tab.pageIndex)}
                      style={{
                        flex: 1, alignItems: "center", gap: 3,
                        paddingVertical: 6, borderRadius: 14,
                        backgroundColor: active ? 'rgba(255,255,255,0.12)' : 'transparent',
                      }}
                    >
                      <View style={{ position: "relative" }}>
                        <Ionicons
                          name={tab.icon}
                          size={20}
                          color={active ? '#FFFFFF' : 'rgba(255,255,255,0.5)'}
                        />
                        {badge > 0 && (
                          <View style={{
                            position: "absolute", top: -4, right: -7,
                            minWidth: 15, height: 15, borderRadius: 8,
                            backgroundColor: theme.colors.hot,
                            alignItems: "center", justifyContent: "center",
                            paddingHorizontal: 2,
                          }}>
                            <Text style={{ fontFamily: theme.fonts.bodyBold, fontSize: 8, color: '#fff', lineHeight: 10 }}>
                              {badge > 99 ? "99+" : badge}
                            </Text>
                          </View>
                        )}
                      </View>
                      <Text style={{
                        fontSize: 9,
                        fontFamily: active ? theme.fonts.bodySemiBold : theme.fonts.body,
                        color: active ? '#FFFFFF' : 'rgba(255,255,255,0.5)',
                        letterSpacing: 0.3,
                      }}>
                        {tab.name === 'Profile' ? 'Me' : tab.name}
                      </Text>
                    </TouchableOpacity>
                  </React.Fragment>
                );
              })}
            </View>
          </View>
        </Animated.View>
      </View>
    </TabsContext.Provider>
  );
}
