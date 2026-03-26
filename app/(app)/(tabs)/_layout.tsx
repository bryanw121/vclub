import { useState } from "react";
import { View, TouchableOpacity, Text, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { TabsContext } from "../../../contexts/tabs";
import { useWebNav } from "../../../contexts/webNav";
import { Pager } from "../../../components/Pager";
import { theme } from "../../../constants";

import EventsScreen from "./index";
import CreateScreen from "./create";
import ProfileScreen from "./profile/index";

const TABS = [
  { name: "Events", icon: "calendar-outline" as const },
  { name: "Host", icon: "add-circle-outline" as const },
  { name: "Profile", icon: "person-circle-outline" as const },
];

const SCREENS = [EventsScreen, CreateScreen, ProfileScreen];

export default function TabsLayout() {
  // All hooks called unconditionally
  const [mobileActiveTab, setMobileActiveTab] = useState(0);
  const [pagerBlocked, setPagerBlocked] = useState(false);
  const insets = useSafeAreaInsets();
  const webNav = useWebNav();

  // ── Web: sidebar lives in (app)/_layout — just render the active screen ──
  if (Platform.OS === "web") {
    const ActiveScreen = SCREENS[webNav.activeTab];
    return (
      <TabsContext.Provider value={{ goToTab: webNav.goToTab, pagerBlocked }}>
        <View style={{ flex: 1 }}>
          <ActiveScreen />
        </View>
      </TabsContext.Provider>
    );
  }

  // ── Mobile: pager + bottom tab bar ───────────────────────────────────────
  function goToTab(index: number) {
    setMobileActiveTab(index);
  }

  return (
    <TabsContext.Provider value={{ goToTab, pagerBlocked }}>
      <View style={{
        flex: 1,
        backgroundColor: theme.colors.background,
        paddingTop: insets.top,
      }}>
        <Pager page={mobileActiveTab} onPageChange={setMobileActiveTab} swipeEnabled={mobileActiveTab !== 0}>
          <EventsScreen />
          <CreateScreen />
          <ProfileScreen />
        </Pager>

        {/* Bottom tab bar */}
        <View style={{
          flexDirection: "row",
          borderTopWidth: 1,
          borderTopColor: theme.colors.border,
          backgroundColor: theme.colors.card,
          paddingTop: theme.spacing.sm,
          paddingBottom: insets.bottom || theme.spacing.md,
        }}>
          {TABS.map((tab, i) => (
            <TouchableOpacity
              key={tab.name}
              onPress={() => goToTab(i)}
              style={{ flex: 1, alignItems: "center", gap: 3 }}
            >
              <Ionicons
                name={tab.icon}
                size={24}
                color={mobileActiveTab === i ? theme.colors.primary : theme.colors.subtext}
              />
              <Text style={{
                fontSize: 10,
                color: mobileActiveTab === i ? theme.colors.primary : theme.colors.subtext,
                fontWeight: mobileActiveTab === i ? theme.font.weight.medium : theme.font.weight.regular,
              }}>
                {tab.name}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </TabsContext.Provider>
  );
}
