import { getQueryData, queryKey, setQueryData } from '../../lib/query'

/**
 * Cache keys for one event's detail data. Everything lives under
 * `event:<id>`, so `invalidate(eventKeys.root(id))` (what `/host` does after an
 * edit, via the `bumpVersion` shim) refreshes all of it.
 *
 * `event:<id>` holds the EVENT_DETAIL_SELECT shape (full attendee rows with
 * profiles). Don't seed it with a feed/list row: those carry counts, not rows.
 */
export const eventKeys = {
  root: (id: string) => queryKey('event', id),
  comments: (id: string) => queryKey('event', id, 'comments'),
  guests: (id: string) => queryKey('event', id, 'guests'),
  cohosts: (id: string) => queryKey('event', id, 'cohosts'),
  myCheers: (id: string, userId: string | null) => queryKey('event', id, 'cheers', userId),
  /** The viewer's own roster-shaped profile (optimistic join rows, Venmo note). */
  viewerProfile: (userId: string | null) => queryKey('profile', userId, 'brief'),
}

/**
 * `setQueryData` only if the key already has data — an updater must never
 * turn "not loaded yet" into a cached `undefined` that reads as loaded.
 * Returns the previous value so callers can roll back.
 */
export function patchQuery<T>(key: string, fn: (prev: T) => T): T | undefined {
  const prev = getQueryData<T>(key)
  if (prev === undefined) return undefined
  setQueryData<T>(key, fn(prev))
  return prev
}
