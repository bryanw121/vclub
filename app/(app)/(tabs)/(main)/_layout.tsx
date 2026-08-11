import React, { useEffect, useMemo, useState } from 'react'
import { Platform, View, useWindowDimensions } from 'react-native'
import { theme } from '../../../../constants'
import { Slot } from 'expo-router'
import { Pager } from '../../../../components/Pager'
import { useTabsActive, useTabsShell } from '../../../../contexts/tabs'
import EventsScreen from './index'
import ProfileScreen from './profile/index'
import ClubsScreen from '../clubs'
import ChatScreen from '../chat'

const SIDEBAR_BREAKPOINT = 768
const TAB_COUNT = 4

/** Prefetch the next tab one tick after settling so the first swipe isn't empty. */
function prefetchNeighbor(active: number): number | null {
  if (active < TAB_COUNT - 1) return active + 1
  if (active > 0) return active - 1
  return null
}

/**
 * Mount each tab the first time it becomes active (and keep it mounted).
 * Neighbors are not pre-mounted so Clubs/Chat/Profile don't fetch on Events cold start;
 * the first swipe to an unvisited tab may briefly show an empty page until mount.
 */
function nextMountedTabs(prev: Set<number>, active: number): Set<number> {
  if (prev.has(active)) return prev
  const out = new Set(prev)
  out.add(active)
  return out
}

/**
 * Wide web: Slot renders /, /clubs, /profile, or /chat as separate routes.
 * Mobile / narrow web: Pager swipes between Events, Clubs, Profile, Chat (tab index from TabsContext).
 */
export default function MainLayout() {
  const { width } = useWindowDimensions()
  const { activeTabIndex } = useTabsActive()
  const { goToTab, pagerBlocked, docScrollActive } = useTabsShell()
  const [mountedTabs, setMountedTabs] = useState(() => nextMountedTabs(new Set([0]), 0))

  useEffect(() => {
    setMountedTabs(prev => nextMountedTabs(prev, activeTabIndex))
    // After the active tab settles, prefetch one neighbor for the next swipe.
    const neighbor = prefetchNeighbor(activeTabIndex)
    if (neighbor == null) return
    const t = setTimeout(() => {
      setMountedTabs(prev => nextMountedTabs(prev, neighbor))
    }, 400)
    return () => clearTimeout(t)
  }, [activeTabIndex])

  const screens = useMemo(() => {
    const factory = [
      () => <EventsScreen key="events" />,
      () => <ClubsScreen key="clubs" />,
      () => <ChatScreen key="chat" />,
      () => <ProfileScreen key="profile" />,
    ]
    return factory.map((render, i) =>
      mountedTabs.has(i) ? render() : <View key={`tab-placeholder-${i}`} style={{ flex: 1 }} />,
    )
  }, [mountedTabs])

  if (Platform.OS === 'web' && width >= SIDEBAR_BREAKPOINT) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
        <Slot />
      </View>
    )
  }

  // Narrow web: no swipe Pager. Screens stay mounted once visited (state preserved)
  // with inactive ones hidden, so the active tab's content can flow in the document
  // when doc-scroll mode is on (required for browser URL bars to collapse).
  if (Platform.OS === 'web') {
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
        {screens}
      </Pager>
    </View>
  )
}
