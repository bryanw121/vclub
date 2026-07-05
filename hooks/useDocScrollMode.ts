import { useEffect, useState } from 'react'
import { Platform } from 'react-native'
import { setDocScrollClaim } from '../lib/docScroll'

/**
 * Document-scroll mode: on narrow mobile web, the Events tab content flows in
 * the document and the BODY scrolls (instead of a nested ScrollView), so
 * Safari/Chrome collapse their URL bars on scroll like a normal website.
 *
 * Toggles `body.doc-scroll`, which activates the CSS overrides in app/+html.tsx
 * (un-pins html/body height and React Navigation's absolute-positioned screen
 * wrappers). Must be OFF for every other screen — stacked routes (event/[id],
 * settings) and the other tabs still use the app-shell fixed layout.
 *
 * @returns whether doc-scroll mode is currently active
 */
// Tabs that use document scroll: Events (0), Clubs (1), Profile (3).
// Chat (2) keeps the app-shell layout — its pinned input bar needs a fixed viewport.
// Note: the event detail page (/event/[id]) manages the body class itself,
// since only its Details/People tabs use document scroll.
const DOC_SCROLL_TABS = new Set([0, 1, 3])

export function useDocScrollMode(
  windowWidth: number,
  activeTabIndex: number,
  pathname: string,
): boolean {
  // expo-router's usePathname goes permanently stale after a browser-back
  // (pop) on web — pushes update it, pops don't. Force a re-render on
  // popstate and trust the real location on web.
  const [, setPopTick] = useState(0)
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return
    const onPop = () => setPopTick(t => t + 1)
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])
  const effectivePath =
    Platform.OS === 'web' && typeof window !== 'undefined'
      ? window.location.pathname
      : pathname

  const active =
    Platform.OS === 'web' &&
    windowWidth < 768 &&
    effectivePath === '/' &&
    DOC_SCROLL_TABS.has(activeTabIndex)

  useEffect(() => {
    if (Platform.OS !== 'web') return
    setDocScrollClaim('tabs', active)
    return () => setDocScrollClaim('tabs', false)
  }, [active])

  return active
}
