import { useRef, useState } from "react";
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

// Pager indices: 0=Events, 1=Profile
const MOBILE_NAV_TABS = [
  { name: "Events",  icon: "calendar-outline"     as const, pageIndex: 0 },
  { name: "Profile", icon: "person-circle-outline" as const, pageIndex: 1 },
];

const FAB_OPTIONS = [
  { label: "Open Play",     path: "/host?maxAttendees=18" },
  { label: "Tournament",    path: "/host" },
  { label: "From Template", path: "/host?mode=templates" },
];

export default function TabsLayout() {
  const [mobileActiveTab, setMobileActiveTab] = useState(0);
  const [pagerBlocked, setPagerBlocked] = useState(false);
  const [fabOpen, setFabOpen] = useState(false);
  const fabAnim = useRef(new Animated.Value(0)).current;
  const insets = useSafeAreaInsets();
  const webNav = useWebNav();
  const router = useRouter();
  const { width: windowWidth } = useWindowDimensions();

  // ── Web (wide): sidebar in (app)/_layout — let Expo Router render the route ─
  if (Platform.OS === "web" && windowWidth >= 768) {
    return (
      <TabsContext.Provider value={{ goToTab: webNav.goToTab, pagerBlocked }}>
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
    <TabsContext.Provider value={{ goToTab, pagerBlocked }}>
      <View style={{ flex: 1, backgroundColor: theme.colors.background, paddingTop: insets.top }}>
        <Pager page={mobileActiveTab} onPageChange={setMobileActiveTab} swipeEnabled={mobileActiveTab !== 0}>
          <EventsScreen />
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

        {/* FAB button — hidden on Profile tab */}
        {mobileActiveTab !== 1 && <TouchableOpacity
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

        {/* Bottom tab bar — Events + Profile only */}
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
                onPress={() => setMobileActiveTab(tab.pageIndex)}
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
      </View>
    </TabsContext.Provider>
  );
}
