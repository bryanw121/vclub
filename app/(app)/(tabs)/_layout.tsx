import React, { useCallback, useRef, useState } from "react";
import { useFocusEffect, Stack, usePathname, useRouter } from "expo-router";
import { Animated, Platform, Pressable, Text, TouchableOpacity, View, useWindowDimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Slot } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { TabsContext } from "../../../contexts/tabs";
import { useWebNav } from "../../../contexts/webNav";
import { theme } from "../../../constants";

// Pager indices: 0=Events, 1=Clubs, 2=Profile
const MOBILE_NAV_TABS = [
  { name: "Events",  icon: "calendar-outline"     as const, pageIndex: 0 },
  { name: "Clubs",   icon: "people-outline"        as const, pageIndex: 1 },
  { name: "Profile", icon: "person-circle-outline" as const, pageIndex: 2 },
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

  /** When a stack screen (settings or another user's profile) is open, switch tabs by resetting the stack to the right home route. */
  function handleTabPress(tabIndex: number) {
    if (pathname.startsWith("/settings") || /^\/profile\/[^/]+$/.test(pathname)) {
      if (tabIndex === 0) router.replace("/" as any);
      else if (tabIndex === 1) router.replace("/clubs" as any);
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

  const fabBottom = (insets.bottom || theme.spacing.md) + 64;
  const onSettingsOrUserProfile =
    pathname.startsWith("/settings") || /^\/profile\/[^/]+$/.test(pathname);
  const showFab = activeTabIndex === 0 && !onSettingsOrUserProfile;

  return (
    <TabsContext.Provider value={{
      goToTab,
      activeTabIndex,
      eventsRefreshTick,
      pagerBlocked,
      setTabBarHidden,
      tabBarHeight,
    }}>
      <View style={{ flex: 1, backgroundColor: theme.colors.background, paddingTop: insets.top }}>
        <Stack
          screenOptions={({ route }) => {
            const isMain = route.name === "(main)";
            return {
              headerShown: !isMain,
              title: "",
              headerTitle: "",
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
              bottom: fabBottom + 52 + theme.spacing.sm,
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
                <Text style={{ fontSize: theme.font.size.md, fontWeight: theme.font.weight.medium, color: theme.colors.text }}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </Animated.View>
        )}

        {showFab && (
          <TouchableOpacity
            onPress={fabOpen ? closeFab : openFab}
            style={{
              position: "absolute",
              bottom: fabBottom,
              right: theme.spacing.lg,
              width: 52,
              height: 52,
              borderRadius: 26,
              backgroundColor: theme.colors.primary,
              alignItems: "center",
              justifyContent: "center",
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.2,
              shadowRadius: 6,
              elevation: 6,
            }}
          >
            <Animated.View style={{ transform: [{ rotate: fabAnim.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "45deg"] }) }] }}>
              <Ionicons name="add" size={28} color={theme.colors.white} />
            </Animated.View>
          </TouchableOpacity>
        )}

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
          <View style={{
            flexDirection: "row",
            borderTopWidth: 1,
            borderTopColor: theme.colors.border,
            backgroundColor: theme.colors.card,
            paddingTop: theme.spacing.sm,
            paddingBottom: insets.bottom || theme.spacing.md,
          }}>
            {MOBILE_NAV_TABS.map((tab) => {
              const active = activeTabIndex === tab.pageIndex;
              return (
                <TouchableOpacity
                  key={tab.name}
                  onPress={() => handleTabPress(tab.pageIndex)}
                  style={{ flex: 1, alignItems: "center", gap: 3 }}
                >
                  <Ionicons
                    name={tab.icon}
                    size={24}
                    color={active ? theme.colors.primary : theme.colors.subtext}
                  />
                  <Text style={{
                    fontSize: 10,
                    color: active ? theme.colors.primary : theme.colors.subtext,
                    fontWeight: active ? theme.font.weight.medium : theme.font.weight.regular,
                  }}>
                    {tab.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </Animated.View>
      </View>
    </TabsContext.Provider>
  );
}
