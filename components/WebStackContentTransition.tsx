import React from 'react'
import { Platform } from 'react-native'
import { Slot, usePathname } from 'expo-router'
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated'

/**
 * Web: native-stack uses instant show/hide. Keyed fade gives a short transition when
 * opening routes from the profile tab (and between subpages). Native uses the real stack animation.
 */
export function WebStackContentTransition() {
  const pathname = usePathname()

  if (Platform.OS !== 'web') {
    return <Slot />
  }

  return (
    <Animated.View
      key={pathname}
      entering={FadeIn.duration(240)}
      exiting={FadeOut.duration(180)}
      style={{ flex: 1 }}
    >
      <Slot />
    </Animated.View>
  )
}
