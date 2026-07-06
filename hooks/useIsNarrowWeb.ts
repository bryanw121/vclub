import { useEffect, useState } from 'react'
import { Platform } from 'react-native'

/**
 * True when running on web with a viewport narrower than `breakpoint` (default
 * 768 — the sidebar/tablet cutoff). On native it is always false (the callers
 * that use it are web-only branches).
 *
 * Unlike `useWindowDimensions`, this re-renders ONLY when the breakpoint boolean
 * flips — not on every resize or mobile URL-bar height change. That matters in
 * doc-scroll mode, where the browser chrome collapses continuously as you scroll
 * and would otherwise re-render the whole tab shell every frame.
 */
export function useIsNarrowWeb(breakpoint = 768): boolean {
  const [narrow, setNarrow] = useState(
    () => Platform.OS === 'web' && typeof window !== 'undefined' && window.innerWidth < breakpoint,
  )

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return
    const onResize = () => {
      const next = window.innerWidth < breakpoint
      // Bail out of the state update (and re-render) unless the boolean changed.
      setNarrow(prev => (prev === next ? prev : next))
    }
    onResize()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [breakpoint])

  return narrow
}
