import { useEffect } from 'react'
import { Platform } from 'react-native'

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
export function useDocScrollMode(
  windowWidth: number,
  activeTabIndex: number,
  pathname: string,
): boolean {
  const active =
    Platform.OS === 'web' &&
    windowWidth < 768 &&
    activeTabIndex === 0 &&
    pathname === '/'

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return
    document.body.classList.toggle('doc-scroll', active)
    return () => {
      document.body.classList.remove('doc-scroll')
      // Reset any document scroll offset so the app-shell layout isn't clipped
      window.scrollTo(0, 0)
    }
  }, [active])

  return active
}
