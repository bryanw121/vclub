import React from 'react'
import { Platform, View, useWindowDimensions } from 'react-native'
import { Slot } from 'expo-router'
import { Pager } from '../../../../components/Pager'
import { useTabsContext } from '../../../../contexts/tabs'
import EventsScreen from './index'
import ProfileScreen from './profile/index'
import ClubsScreen from '../clubs'

const SIDEBAR_BREAKPOINT = 768

/**
 * Wide web: Slot renders /, /clubs, or /profile as separate routes.
 * Mobile / narrow web: Pager swipes between Events, Clubs, and Profile (tab index from TabsContext).
 */
export default function MainLayout() {
  const { width } = useWindowDimensions()
  const { activeTabIndex, goToTab, pagerBlocked } = useTabsContext()

  if (Platform.OS === 'web' && width >= SIDEBAR_BREAKPOINT) {
    return (
      <View style={{ flex: 1 }}>
        <Slot />
      </View>
    )
  }

  return (
    <View style={{ flex: 1 }}>
      <Pager page={activeTabIndex} onPageChange={goToTab} pagerBlockedRef={pagerBlocked}>
        <EventsScreen />
        <ClubsScreen />
        <ProfileScreen />
      </Pager>
    </View>
  )
}
