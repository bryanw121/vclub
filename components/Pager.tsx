import { useEffect, useRef } from 'react'
import { View, Animated, PanResponder, Dimensions } from 'react-native'

type Props = {
  page: number
  onPageChange: (index: number) => void
  children: React.ReactNode[]
  swipeEnabled?: boolean
}

/**
 * Tab pager driven by the `page` prop (controlled).
 * Pass swipeEnabled={false} to disable gesture-based tab switching
 * (e.g. when the active tab contains a horizontal FlatList that would conflict).
 */
export function Pager({ page, onPageChange, children, swipeEnabled = true }: Props) {
  const width = Dimensions.get('window').width
  const count = (children as React.ReactNode[]).length
  const translateX = useRef(new Animated.Value(-page * width)).current
  const activePage = useRef(page)
  const swipeEnabledRef = useRef(swipeEnabled)
  swipeEnabledRef.current = swipeEnabled

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
    onMoveShouldSetPanResponder: (_, { dx, dy }) =>
      swipeEnabledRef.current &&
      Math.abs(dx) > Math.abs(dy) * 1.5 && Math.abs(dx) > 8,
    onPanResponderGrant: () => { translateX.stopAnimation() },
    onPanResponderMove: (_, { dx }) => {
      const base = -activePage.current * width
      const atStart = activePage.current === 0 && dx > 0
      const atEnd   = activePage.current === count - 1 && dx < 0
      translateX.setValue(base + (atStart || atEnd ? dx * 0.2 : dx))
    },
    onPanResponderRelease: (_, { dx, vx }) => {
      if      (dx < -width * 0.3 || vx < -0.5) snapTo(activePage.current + 1)
      else if (dx >  width * 0.3 || vx >  0.5) snapTo(activePage.current - 1)
      else                                       snapTo(activePage.current)
    },
    onPanResponderTerminate: () => { snapTo(activePage.current) },
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
