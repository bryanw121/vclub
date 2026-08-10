import { useCallback, useEffect, useRef, useState } from 'react'
import { Platform } from 'react-native'
import { supabase } from '../lib/supabase'
import { collectBadgeStats, checkAndAwardBadges } from '../utils/badges'
import type { UserBadge, Profile } from '../types'

const BADGE_SELECT = 'id, user_id, badge_type, tier, awarded_at, display_order, display_tier'

// Badges change infrequently — cache for 10 minutes in memory, persist to
// AsyncStorage so the next app launch shows badges instantly with no flash.
const STALE_MS = 10 * 60_000
// Awarding scans the user's attendance/cheer history, so it runs far less often
// than the badge list is read. Explicit profile edits bypass this (see checkBadges).
const CHECK_STALE_MS = 10 * 60_000
const CACHE_KEY = 'useBadges:cache'

type CacheEntry = { userId: string; badges: UserBadge[]; fetchedAt: number }

// AsyncStorage is only available on native; on web we skip persistence.
async function readCache(): Promise<CacheEntry | null> {
  if (Platform.OS === 'web') return null
  try {
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default
    const raw = await AsyncStorage.getItem(CACHE_KEY)
    return raw ? (JSON.parse(raw) as CacheEntry) : null
  } catch {
    return null
  }
}

async function writeCache(entry: CacheEntry): Promise<void> {
  if (Platform.OS === 'web') return
  try {
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(entry))
  } catch {
    // Non-critical — ignore write failures
  }
}

export function useBadges() {
  const [badges, setBadges] = useState<UserBadge[]>([])
  const [loading, setLoading] = useState(true)
  const lastFetchedAt = useRef(0)
  const lastCheckedAt = useRef(0)
  /** Mirrors `badges` so async callbacks read the current rows without re-rendering. */
  const badgesRef = useRef<UserBadge[]>([])

  const applyBadges = useCallback((next: UserBadge[]) => {
    badgesRef.current = next
    setBadges(next)
  }, [])

  /**
   * Returns the user's current badges, hitting the network only when the
   * in-memory and AsyncStorage caches are both stale. Returning the rows (not
   * just setting state) lets callers use them immediately — React state isn't
   * readable until the next render.
   */
  const fetchBadges = useCallback(async (force = false): Promise<UserBadge[]> => {
    if (!force && Date.now() - lastFetchedAt.current < STALE_MS) return badgesRef.current

    const { data: { session } } = await supabase.auth.getSession()
    const userId = session?.user?.id
    if (!userId) { setLoading(false); return badgesRef.current }

    // On a non-forced fetch, check AsyncStorage before hitting the network
    if (!force) {
      const cached = await readCache()
      if (cached && cached.userId === userId && Date.now() - cached.fetchedAt < STALE_MS) {
        applyBadges(cached.badges)
        lastFetchedAt.current = cached.fetchedAt
        setLoading(false)
        return cached.badges
      }
    }

    const { data } = await supabase
      .from('user_badges')
      .select(BADGE_SELECT)
      .eq('user_id', userId)
      .order('display_order', { ascending: true, nullsFirst: false })

    const fetched = (data ?? []) as UserBadge[]
    applyBadges(fetched)
    lastFetchedAt.current = Date.now()
    setLoading(false)
    void writeCache({ userId, badges: fetched, fetchedAt: lastFetchedAt.current })
    return fetched
  }, [applyBadges])

  /**
   * Collect stats, compare against thresholds, award anything new.
   *
   * This is the expensive path — it scans the user's attendance and cheer
   * history — so it is throttled to `CHECK_STALE_MS`. Screen focus passes no
   * `force`, since nothing that awards a badge can happen while the profile
   * screen is already open. An explicit profile edit (saving details, uploading
   * an avatar) *can* newly qualify for `profile_complete`, so those call sites
   * pass `force` to bypass the throttle and keep the badge immediate.
   */
  const checkBadges = useCallback(async (profile: Profile, force = false) => {
    if (!force && Date.now() - lastCheckedAt.current < CHECK_STALE_MS) return
    lastCheckedAt.current = Date.now()

    const { data: { session } } = await supabase.auth.getSession()
    const userId = session?.user?.id
    if (!userId) return

    // Compare against the cached rows rather than issuing the second
    // `user_badges` round-trip this used to run alongside fetchBadges. Awaiting
    // fetchBadges (cache-respecting, usually a no-op) guarantees the list is
    // populated — comparing against an empty list would re-award every badge.
    const [existing, stats] = await Promise.all([
      fetchBadges(),
      collectBadgeStats(userId, profile),
    ])
    const newlyAwarded = await checkAndAwardBadges(userId, stats, existing)

    if (newlyAwarded.length > 0) {
      await fetchBadges(true)
    }
  }, [fetchBadges])

  /**
   * Assign a badge to a display slot (1–3) or clear it (null).
   * Automatically evicts whatever was previously in that slot.
   */
  const setDisplaySlot = useCallback(async (
    badgeType: string,
    slot: number | null,
    displayTier?: number | null,
  ) => {
    const { data: { session } } = await supabase.auth.getSession()
    const userId = session?.user?.id
    if (!userId) return

    // Optimistic local update
    const next = badgesRef.current.map(b => {
      if (b.badge_type === badgeType) return { ...b, display_order: slot, display_tier: displayTier ?? null }
      if (slot !== null && b.display_order === slot) return { ...b, display_order: null }
      return b
    })
    applyBadges(next)
    void writeCache({ userId, badges: next, fetchedAt: lastFetchedAt.current })

    // Persist: clear the slot first, then assign
    if (slot !== null) {
      await supabase
        .from('user_badges')
        .update({ display_order: null })
        .eq('user_id', userId)
        .eq('display_order', slot)
        .neq('badge_type', badgeType)
    }
    await supabase
      .from('user_badges')
      .update({ display_order: slot, display_tier: displayTier ?? null })
      .eq('user_id', userId)
      .eq('badge_type', badgeType)
  }, [applyBadges])

  useEffect(() => {
    // Load from AsyncStorage immediately so badges appear without a network round-trip,
    // then refresh from the network if the cached data is stale.
    async function init() {
      const { data: { session } } = await supabase.auth.getSession()
      const userId = session?.user?.id
      if (!userId) { setLoading(false); return }

      const cached = await readCache()
      if (cached && cached.userId === userId) {
        applyBadges(cached.badges)
        lastFetchedAt.current = cached.fetchedAt
        setLoading(false)
        // Still refresh in the background if stale
        if (Date.now() - cached.fetchedAt >= STALE_MS) {
          void fetchBadges(true)
        }
      } else {
        void fetchBadges(true)
      }
    }
    void init()
  }, [fetchBadges, applyBadges])

  return { badges, loading, fetchBadges, checkBadges, setDisplaySlot }
}
