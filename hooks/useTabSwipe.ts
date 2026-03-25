import { useRef } from 'react'
import { PanResponder } from 'react-native'
import { router } from 'expo-router'

/**
 * Returns PanResponder handlers that trigger tab navigation on fast horizontal swipes.
 * Uses the capture phase so it can intercept swipes even over child components,
 * but only at high velocity so slow calendar/scroll gestures are unaffected.
 */
export function useTabSwipe(prevTab?: string, nextTab?: string) {
  // Use refs so the callbacks always see the latest route values
  const routes = useRef({ prevTab, nextTab })
  routes.current = { prevTab, nextTab }

  const lastSwipe = useRef(0)

  return useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    // Capture phase (outer → inner): only steal for fast, clearly horizontal swipes.
    // This lets slow calendar/week-strip gestures proceed normally.
    onMoveShouldSetPanResponderCapture: (_, { dx, dy, vx, vy }) =>
      Math.abs(dx) > Math.abs(dy) * 2.5 &&
      Math.abs(vx) > Math.abs(vy) * 2.5 &&
      Math.abs(vx) > 0.9 &&
      Math.abs(dx) > 50,
    onPanResponderRelease: (_, { vx }) => {
      const now = Date.now()
      if (now - lastSwipe.current < 400) return // debounce rapid swipes
      lastSwipe.current = now
      const { prevTab, nextTab } = routes.current
      if (vx < -0.9 && nextTab) router.navigate(nextTab as any)
      else if (vx > 0.9 && prevTab) router.navigate(prevTab as any)
    },
  })).current.panHandlers
}
