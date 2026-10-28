import { Platform } from 'react-native'
import { prefetchQuery } from '../../lib/query'
import { STALE } from '../../constants/cache'
import { eventKeys } from './keys'
import { fetchEventCohosts, fetchEventComments, fetchEventDetail, fetchEventGuests } from './useEventData'

/**
 * Start the event page's requests before the tap completes: on press-in
 * (touch down / mouse down, ~100ms before the press) and, on desktop web,
 * after the pointer rests on the card for HOVER_DELAY_MS. The detail screen's
 * `useQuery`s then join the in-flight requests or read the results. Each key
 * is fetched only if not already fresh, so repeated hovers cost nothing.
 */
export function prefetchEventDetail(id: string): void {
  const opts = { staleMs: STALE.detail }
  void prefetchQuery(eventKeys.root(id), () => fetchEventDetail(id), opts)
  void prefetchQuery(eventKeys.guests(id), () => fetchEventGuests(id), opts)
  void prefetchQuery(eventKeys.cohosts(id), () => fetchEventCohosts(id), opts)
  void prefetchQuery(eventKeys.comments(id), () => fetchEventComments(id), opts)
}

const HOVER_DELAY_MS = 150
let hoverTimer: ReturnType<typeof setTimeout> | null = null

function cancelHover(): void {
  if (hoverTimer) clearTimeout(hoverTimer)
  hoverTimer = null
}

/**
 * Props to spread on a feed card's touchable. `onMouseEnter`/`onMouseLeave`
 * are forwarded to the DOM by react-native-web; native gets press-in only.
 */
export function eventPrefetchProps(id: string): object {
  const onPressIn = () => {
    cancelHover()
    prefetchEventDetail(id)
  }
  if (Platform.OS !== 'web') return { onPressIn }
  return {
    onPressIn,
    onMouseEnter: () => {
      cancelHover()
      hoverTimer = setTimeout(() => {
        hoverTimer = null
        prefetchEventDetail(id)
      }, HOVER_DELAY_MS)
    },
    onMouseLeave: cancelHover,
  }
}
