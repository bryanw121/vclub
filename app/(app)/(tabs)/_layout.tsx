import { useCallback, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";
import { Animated, Platform, Pressable, Text, TouchableOpacity, View, useWindowDimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Slot, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { TabsContext } from "../../../contexts/tabs";
import { useWebNav } from "../../../contexts/webNav";
import { Pager } from "../../../components/Pager";
import { theme } from "../../../constants";

import EventsScreen from "./index";
import ProfileScreen from "./profile/index";
import ClubsScreen from "./clubs";

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

export default function TabsLayout() {
  const [mobileActiveTab, setMobileActiveTab] = useState(0);
  const pagerBlocked = useRef(false);

  // Refresh the events list when returning from host/event screens.
  // We skip the very first focus (initial mount) since useEvents already
  // fetches on mount; only subsequent focus events mean "just came back".
  const [eventsRefreshTick, setEventsRefreshTick] = useState(0);
  const focusCount = useRef(0);
  useFocusEffect(useCallback(() => {
    focusCount.current += 1;
    if (focusCount.current > 1) setEventsRefreshTick(t => t + 1);
  }, []));
  const [fabOpen, setFabOpen] = useState(false);
  const fabAnim = useRef(new Animated.Value(0)).current;
  const insets = useSafeAreaInsets();

  // Tab bar hide/show animation (mobile web only)
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
  }, []);
  const webNav = useWebNav();
  const router = useRouter();
  const { width: windowWidth } = useWindowDimensions();

  // ── Web (wide): sidebar in (app)/_layout — let Expo Router render the route ─
  if (Platform.OS === "web" && windowWidth >= 768) {
    return (
      <TabsContext.Provider value={{ goToTab: webNav.goToTab, pagerBlocked, setTabBarHidden: () => {}, tabBarHeight: 0 }}>
        <View style={{ flex: 1 }}>
          <Slot />
        </View>
      </TabsContext.Provider>
    );
  }

  // ── Mobile: pager + bottom tab bar ───────────────────────────────────────
  function goToTab(index: number) {
    setMobileActiveTab(index);
    if (fabOpen) closeFab();
    setTabBarHidden(false); // always reveal tab bar on tab switch
  }

  function openFab() {
    setFabOpen(true);
    Animated.spring(fabAnim, { toValue: 1, useNativeDriver: true, tension: 120, friction: 8 }).start();
  }

  function closeFab() {
    Animated.timing(fabAnim, { toValue: 0, duration: 150, useNativeDriver: true }).start(() => setFabOpen(false));
  }

  function goHost(path: string) {
    closeFab();
    setTimeout(() => router.push(path as any), 160);
  }

  const fabBottom = (insets.bottom || theme.spacing.md) + 64;

  return (
    <TabsContext.Provider value={{ goToTab, pagerBlocked, setTabBarHidden, tabBarHeight }}>
      <View style={{ flex: 1, backgroundColor: theme.colors.background, paddingTop: insets.top }}>
        <Pager page={mobileActiveTab} onPageChange={setMobileActiveTab} pagerBlockedRef={pagerBlocked}>
          <EventsScreen refreshTick={eventsRefreshTick} />
          <ClubsScreen />
          <ProfileScreen />
        </Pager>

        {/* FAB popup backdrop */}
        {fabOpen && (
          <Pressable
            style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
            onPress={closeFab}
          />
        )}

        {/* FAB popup options */}
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

        {/* FAB button — hidden on Clubs and Profile tabs */}
        {mobileActiveTab === 0 && <TouchableOpacity
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
        </TouchableOpacity>}

        {/* Bottom tab bar — absolutely positioned so the Pager always fills the
            full height. When the bar hides via translateY the Pager content
            becomes fully visible without any layout recalculation. */}
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
              const active = mobileActiveTab === tab.pageIndex;
              return (
                <TouchableOpacity
                  key={tab.name}
                  onPress={() => { setMobileActiveTab(tab.pageIndex); setTabBarHidden(false); }}
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
