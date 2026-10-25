import { Platform } from 'react-native'
import type { EventWithDetails, FeedSnapshot } from '../types'

/**
 * Last visit's Events feed, kept on the device so the next cold start can paint
 * events immediately instead of waiting for the network. Web only for now
 * (localStorage is synchronous, so the cache is seeded before the first render).
 *
 * The snapshot is a display hint, never a source of truth: it is seeded as
 * stale and refetched at once, and it is ignored if it belongs to another
 * viewer, is from an older format, or is too old.
 */
const STORAGE_KEY = 'vteam.feedSnapshot'
const VERSION = 1
/** Months kept: the current month and the next one cover the first screen. */
export const SNAPSHOT_MONTHS = 2
/** Older snapshots are dropped rather than shown. */
export const SNAPSHOT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000
/** Never let a large feed fill the origin's storage quota. */
const MAX_BYTES = 400_000

function storage(): Storage | null {
  if (Platform.OS !== 'web') return null
  try {
    return typeof window !== 'undefined' ? window.localStorage : null
  } catch {
    return null
  }
}

/** Pure validity check (unit tested). */
export function usableSnapshot(raw: unknown, now = Date.now()): FeedSnapshot | null {
  if (!raw || typeof raw !== 'object') return null
  const s = raw as Partial<FeedSnapshot>
  if (s.v !== VERSION || typeof s.savedAt !== 'number' || now - s.savedAt > SNAPSHOT_MAX_AGE_MS) return null
  if (!(s.owner === null || typeof s.owner === 'string')) return null
  if (!s.months || typeof s.months !== 'object') return null
  const months = Object.entries(s.months).filter(([m, rows]) => /^\d{4}-\d{2}$/.test(m) && Array.isArray(rows))
  if (months.length === 0) return null
  return { v: VERSION, savedAt: s.savedAt, owner: s.owner, months: Object.fromEntries(months) }
}

export function readFeedSnapshot(): FeedSnapshot | null {
  try {
    const raw = storage()?.getItem(STORAGE_KEY)
    return raw ? usableSnapshot(JSON.parse(raw)) : null
  } catch {
    return null
  }
}

export function writeFeedSnapshot(owner: string | null, months: Record<string, EventWithDetails[]>): void {
  const store = storage()
  if (!store) return
  try {
    const json = JSON.stringify({ v: VERSION, savedAt: Date.now(), owner, months } satisfies FeedSnapshot)
    if (json.length > MAX_BYTES) {
      store.removeItem(STORAGE_KEY)
      return
    }
    store.setItem(STORAGE_KEY, json)
  } catch {
    // Quota or private mode: the snapshot is only a speed-up.
  }
}

export function clearFeedSnapshot(): void {
  try {
    storage()?.removeItem(STORAGE_KEY)
  } catch { /* ignore */ }
}
