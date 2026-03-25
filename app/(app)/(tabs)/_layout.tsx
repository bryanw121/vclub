import { useState } from 'react'
import { View, TouchableOpacity, Text } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { TabsContext } from '../../../contexts/tabs'
import { Pager } from '../../../components/Pager'
import { theme } from '../../../constants'

// Import the three tab screens directly so Pager can render them as pages
import EventsScreen from './index'
import CreateScreen from './create'
import ProfileScreen from './profile/index'

const TABS = [
  { name: 'Events', icon: 'calendar-outline'      as const },
  { name: 'Create', icon: 'add-circle-outline'    as const },
  { name: 'Profile', icon: 'person-circle-outline' as const },
]

export default function TabsLayout() {
  const [activeTab, setActiveTab] = useState(0)
  const insets = useSafeAreaInsets()

  function goToTab(index: number) {
    setActiveTab(index)
  }

  return (
    <TabsContext.Provider value={{ goToTab }}>
      <View style={{ flex: 1, backgroundColor: theme.colors.background, paddingTop: insets.top }}>

        <Pager page={activeTab} onPageChange={setActiveTab}>
          <EventsScreen />
          <CreateScreen />
          <ProfileScreen />
        </Pager>

        {/* Custom bottom tab bar — replaces Expo Router's built-in Tabs */}
        <View style={{
          flexDirection: 'row',
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
              style={{ flex: 1, alignItems: 'center', gap: 3 }}
            >
              <Ionicons
                name={tab.icon}
                size={24}
                color={activeTab === i ? theme.colors.primary : theme.colors.subtext}
              />
              <Text style={{
                fontSize: 10,
                color: activeTab === i ? theme.colors.primary : theme.colors.subtext,
                fontWeight: activeTab === i ? theme.font.weight.medium : theme.font.weight.regular,
              }}>
                {tab.name}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

      </View>
    </TabsContext.Provider>
  )
}
