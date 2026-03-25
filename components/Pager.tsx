import { useEffect, useRef } from 'react'
import { View, Animated, PanResponder, Dimensions } from 'react-native'

type Props = {
  page: number
  onPageChange: (index: number) => void
  children: React.ReactNode[]
}

/**
 * Cross-platform swipeable pager using Animated + PanResponder.
 * Drop-in replacement for react-native-pager-view that works on iOS, Android, and web.
 *
 * - Driven by the `page` prop (controlled) — animate by updating state externally
 * - Swipe gestures snap to the nearest page with spring physics
 * - Rubber-bands at the first and last page
 */
export function Pager({ page, onPageChange, children }: Props) {
  const width = Dimensions.get('window').width
  const count = (children as React.ReactNode[]).length
  const translateX = useRef(new Animated.Value(-page * width)).current
  const activePage = useRef(page)
  const dragging = useRef(false)

  // Animate when the page prop changes (e.g. tab bar tapped).
  // No dragging guard here — inner PanResponders (week strip, calendar) can leave
  // dragging.current in an inconsistent state via onPanResponderTerminationRequest.
  // Two springs to the same target are harmless.
  useEffect(() => {
    activePage.current = page
    Animated.spring(translateX, {
      toValue: -page * width,
      useNativeDriver: true,
      tension: 60,
      friction: 11,
    }).start()
  }, [page, width])

  function snapTo(target: number) {
    const clamped = Math.max(0, Math.min(count - 1, target))
    activePage.current = clamped
    Animated.spring(translateX, {
      toValue: -clamped * width,
      useNativeDriver: true,
      tension: 60,
      friction: 11,
    }).start()
    onPageChange(clamped)
  }

  const panResponder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    // Bubble phase — inner gesture handlers (calendar, week strip) claim first.
    // The pager only activates for clearly horizontal swipes that nothing else claimed.
    onMoveShouldSetPanResponder: (_, { dx, dy }) =>
      Math.abs(dx) > Math.abs(dy) * 1.5 && Math.abs(dx) > 8,
    onPanResponderGrant: () => {
      dragging.current = true
      translateX.stopAnimation()
    },
    onPanResponderMove: (_, { dx }) => {
      const base = -activePage.current * width
      const atStart = activePage.current === 0 && dx > 0
      const atEnd   = activePage.current === count - 1 && dx < 0
      translateX.setValue(base + (atStart || atEnd ? dx * 0.2 : dx))
    },
    onPanResponderRelease: (_, { dx, vx }) => {
      dragging.current = false
      if      (dx < -width * 0.3 || vx < -0.5) snapTo(activePage.current + 1)
      else if (dx >  width * 0.3 || vx >  0.5) snapTo(activePage.current - 1)
      else                                       snapTo(activePage.current)
    },
    onPanResponderTerminate: () => {
      dragging.current = false
      snapTo(activePage.current)
    },
  })).current

  return (
    <View style={{ flex: 1, overflow: 'hidden' }} {...panResponder.panHandlers}>
      <Animated.View style={{
        flex: 1,
        flexDirection: 'row',
        width: width * count,
        transform: [{ translateX }],
      }}>
        {(children as React.ReactNode[]).map((child, i) => (
          <View key={i} style={{ width, flex: 1 }}>
            {child}
          </View>
        ))}
      </Animated.View>
    </View>
  )
}
