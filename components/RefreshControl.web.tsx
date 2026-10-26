import React, { useEffect, useRef } from 'react'
import { ActivityIndicator, View } from 'react-native'
import type { RefreshControlProps } from 'react-native'
import { shared, theme } from '../constants'
import { IDLE, PULL_TRIGGER, pullEnd, pullMove, pullStart, type PullState } from '../lib/pullGesture'

type Props = RefreshControlProps & { children?: React.ReactNode }

/** Where the indicator rests while `refreshing`, and how far above the top it hides. */
const REST_Y = 16
const HIDDEN_Y = -48

/**
 * Web pull-to-refresh (#35). react-native-web's ScrollView renders
 * `cloneElement(refreshControl, { style }, scrollView)`, so this wraps the
 * scroll view: it listens for touches bubbling up from it, runs
 * lib/pullGesture, and calls `onRefresh` on release past the threshold.
 *
 * The indicator is moved by writing its DOM style directly, never by React
 * state, so a pull doesn't re-render the (possibly long) list it wraps.
 */
export function RefreshControl({ refreshing, onRefresh, enabled = true, tintColor, style, children, ...rest }: Props) {
  const wrapperRef = useRef<View>(null)
  const indicatorRef = useRef<View>(null)
  const onRefreshRef = useRef(onRefresh)
  onRefreshRef.current = onRefresh
  const refreshingRef = useRef(refreshing)
  refreshingRef.current = refreshing

  const place = (y: number, opacity: number, animate: boolean) => {
    const el = indicatorRef.current as unknown as HTMLElement | null
    if (!el) return
    el.style.transition = animate ? 'transform 200ms ease-out, opacity 200ms ease-out' : 'none'
    el.style.transform = `translateY(${y}px)`
    el.style.opacity = String(opacity)
  }

  useEffect(() => {
    place(refreshing ? REST_Y : HIDDEN_Y, refreshing ? 1 : 0, true)
  }, [refreshing])

  useEffect(() => {
    const node = wrapperRef.current as unknown as HTMLElement | null
    if (!node || !enabled) return
    let state: PullState = IDLE

    // Every scroll owner between the finger and this wrapper, and the window
    // (doc-scroll mode on narrow web), must be at offset 0.
    const atTop = (target: EventTarget | null) => {
      if (window.scrollY > 0) return false
      for (let el = target as HTMLElement | null; el && el !== node; el = el.parentElement) {
        if (el.scrollTop > 0) return false
      }
      return true
    }
    const onStart = (e: TouchEvent) => {
      const t = e.touches[0]
      state = refreshingRef.current ? IDLE : pullStart(atTop(e.target), e.touches.length, t.clientX, t.clientY)
    }
    const onMove = (e: TouchEvent) => {
      if (state.phase === 'idle') return
      const t = e.touches[0]
      const next = pullMove(state, e.touches.length, t?.clientX ?? 0, t?.clientY ?? 0)
      if (next.phase === 'pulling') {
        if (e.cancelable) e.preventDefault()
        place(HIDDEN_Y + next.pull, Math.min(next.pull / PULL_TRIGGER, 1), false)
      } else if (state.phase === 'pulling') {
        place(HIDDEN_Y, 0, true)
      }
      state = next
    }
    const onEnd = () => {
      const fire = pullEnd(state)
      state = IDLE
      if (fire) {
        place(REST_Y, 1, true)
        onRefreshRef.current?.()
      } else if (!refreshingRef.current) {
        place(HIDDEN_Y, 0, true)
      }
    }
    const onCancel = () => {
      state = IDLE
      if (!refreshingRef.current) place(HIDDEN_Y, 0, true)
    }

    node.addEventListener('touchstart', onStart, { passive: true })
    node.addEventListener('touchmove', onMove, { passive: false })
    node.addEventListener('touchend', onEnd)
    node.addEventListener('touchcancel', onCancel)
    return () => {
      node.removeEventListener('touchstart', onStart)
      node.removeEventListener('touchmove', onMove)
      node.removeEventListener('touchend', onEnd)
      node.removeEventListener('touchcancel', onCancel)
    }
  }, [enabled])

  return (
    <View ref={wrapperRef} {...rest} style={[style, shared.pullWrapper]}>
      {children}
      <View
        ref={indicatorRef}
        pointerEvents="none"
        testID="pull-to-refresh-indicator"
        accessibilityElementsHidden={!refreshing}
        style={[shared.pullIndicator, { opacity: 0, transform: [{ translateY: HIDDEN_Y }] }]}
      >
        <ActivityIndicator size="small" color={tintColor ?? theme.colors.primary} animating />
      </View>
    </View>
  )
}
