import React from 'react'
import { Platform, View, useWindowDimensions } from 'react-native'
import { theme } from '../../../../constants'
import { Slot } from 'expo-router'
import { Pager } from '../../../../components/Pager'
import { useTabsContext } from '../../../../contexts/tabs'
import EventsScreen from './index'
import ProfileScreen from './profile/index'
import ClubsScreen from '../clubs'
import ChatScreen from '../chat'

const SIDEBAR_BREAKPOINT = 768

/**
 * Wide web: Slot renders /, /clubs, /profile, or /chat as separate routes.
 * Mobile / narrow web: Pager swipes between Events, Clubs, Profile, Chat (tab index from TabsContext).
 */
export default function MainLayout() {
  const { width } = useWindowDimensions()
  const { activeTabIndex, goToTab, pagerBlocked, docScrollActive } = useTabsContext()

  if (Platform.OS === 'web' && width >= SIDEBAR_BREAKPOINT) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
        <Slot />
      </View>
    )
  }

  // Narrow web: no swipe Pager. Screens stay mounted (state preserved) with
  // inactive ones hidden, so the active tab's content can flow in the document
  // when doc-scroll mode is on (required for browser URL bars to collapse).
  if (Platform.OS === 'web') {
    const screens = [
      <EventsScreen key="events" />,
      <ClubsScreen key="clubs" />,
      <ChatScreen key="chat" />,
      <ProfileScreen key="profile" />,
    ]
    return (
      <View style={docScrollActive ? ({ minHeight: '100dvh' } as any) : { flex: 1 }}>
        {screens.map((screen, i) => (
          <View
            key={i}
            style={
              i !== activeTabIndex
                ? { display: 'none' }
                : docScrollActive
                  ? undefined // auto height — content extends the document
                  : { flex: 1 }
            }
          >
            {screen}
          </View>
        ))}
      </View>
    )
  }

  return (
    <View style={{ flex: 1 }}>
      <Pager page={activeTabIndex} onPageChange={goToTab} pagerBlockedRef={pagerBlocked}>
        <EventsScreen />
        <ClubsScreen />
        <ChatScreen />
        <ProfileScreen />
      </Pager>
    </View>
  )
}
