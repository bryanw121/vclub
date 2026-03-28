import React, { useEffect, useRef } from 'react'
import { View, Animated, PanResponder, Dimensions } from 'react-native'

type Props = {
  page: number
  onPageChange: (index: number) => void
  children: React.ReactNode[]
  swipeEnabled?: boolean
  pagerBlockedRef?: React.MutableRefObject<boolean>
}

/**
 * Tab pager driven by the `page` prop (controlled).
 * Pass swipeEnabled={false} to disable gesture-based tab switching.
 * Pass pagerBlockedRef to dynamically block swiping from specific inner areas.
 */
export function Pager({ page, onPageChange, children, swipeEnabled = true, pagerBlockedRef }: Props) {
  const count = (children as React.ReactNode[]).length
  const translateX = useRef(new Animated.Value(-page * Dimensions.get('window').width)).current
  const activePage = useRef(page)

  // Keep refs current so panResponder closures always see the latest values.
  const countRef = useRef(count)
  countRef.current = count

  const widthRef = useRef(Dimensions.get('window').width)
  widthRef.current = Dimensions.get('window').width

  const onPageChangeRef = useRef(onPageChange)
  onPageChangeRef.current = onPageChange

  const swipeEnabledRef = useRef(swipeEnabled)
  swipeEnabledRef.current = swipeEnabled

  const fallbackBlockedRef = useRef(false)
  const blockedRef = pagerBlockedRef ?? fallbackBlockedRef

  useEffect(() => {
    activePage.current = page
    Animated.spring(translateX, {
      toValue: -page * widthRef.current,
      useNativeDriver: true,
      tension: 60,
      friction: 11,
    }).start()
  }, [page])

  // snapTo lives in a ref so panResponder handlers always call the latest version.
  const snapToRef = useRef((target: number) => {})
  snapToRef.current = (target: number) => {
    const clamped = Math.max(0, Math.min(countRef.current - 1, target))
    activePage.current = clamped
    Animated.spring(translateX, {
      toValue: -clamped * widthRef.current,
      useNativeDriver: true,
      tension: 60,
      friction: 11,
    }).start()
    onPageChangeRef.current(clamped)
  }

  const panResponder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_, { dx, dy }) =>
      swipeEnabledRef.current &&
      !blockedRef.current &&
      Math.abs(dx) > Math.abs(dy) * 1.5 && Math.abs(dx) > 8,
    onPanResponderGrant: () => { translateX.stopAnimation() },
    onPanResponderMove: (_, { dx }) => {
      const w = widthRef.current
      const base = -activePage.current * w
      const atStart = activePage.current === 0 && dx > 0
      const atEnd   = activePage.current === countRef.current - 1 && dx < 0
      translateX.setValue(base + (atStart || atEnd ? dx * 0.2 : dx))
    },
    onPanResponderRelease: (_, { dx, vx }) => {
      const w = widthRef.current
      if      (dx < -w * 0.3 || vx < -0.5) snapToRef.current(activePage.current + 1)
      else if (dx >  w * 0.3 || vx >  0.5) snapToRef.current(activePage.current - 1)
      else                                   snapToRef.current(activePage.current)
    },
    onPanResponderTerminate: () => { snapToRef.current(activePage.current) },
  })).current

  const width = Dimensions.get('window').width

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
