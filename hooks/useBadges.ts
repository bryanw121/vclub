import { useCallback, useEffect, useRef, useState } from 'react'
import { Platform } from 'react-native'
import { supabase } from '../lib/supabase'
import { collectBadgeStats, checkAndAwardBadges } from '../utils/badges'
import type { UserBadge, Profile } from '../types'

const BADGE_SELECT = 'id, user_id, badge_type, tier, awarded_at, display_order'

// Badges change infrequently — cache for 10 minutes in memory, persist to
// AsyncStorage so the next app launch shows badges instantly with no flash.
const STALE_MS = 10 * 60_000
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

  const fetchBadges = useCallback(async (force = false) => {
    if (!force && Date.now() - lastFetchedAt.current < STALE_MS) return

    const { data: { session } } = await supabase.auth.getSession()
    const userId = session?.user?.id
    if (!userId) { setLoading(false); return }

    // On a non-forced fetch, check AsyncStorage before hitting the network
    if (!force) {
      const cached = await readCache()
      if (cached && cached.userId === userId && Date.now() - cached.fetchedAt < STALE_MS) {
        setBadges(cached.badges)
        lastFetchedAt.current = cached.fetchedAt
        setLoading(false)
        return
      }
    }

    const { data } = await supabase
      .from('user_badges')
      .select(BADGE_SELECT)
      .eq('user_id', userId)
      .order('display_order', { ascending: true, nullsFirst: false })

    const fetched = (data ?? []) as UserBadge[]
    setBadges(fetched)
    lastFetchedAt.current = Date.now()
    setLoading(false)
    void writeCache({ userId, badges: fetched, fetchedAt: lastFetchedAt.current })
  }, [])

  /** Collect stats, compare against thresholds, award anything new. */
  const checkBadges = useCallback(async (profile: Profile) => {
    const { data: { session } } = await supabase.auth.getSession()
    const userId = session?.user?.id
    if (!userId) return

    const [stats, existingRes] = await Promise.all([
      collectBadgeStats(userId, profile),
      supabase.from('user_badges').select(BADGE_SELECT).eq('user_id', userId),
    ])

    const existing = (existingRes.data ?? []) as UserBadge[]
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
  ) => {
    const { data: { session } } = await supabase.auth.getSession()
    const userId = session?.user?.id
    if (!userId) return

    // Optimistic local update
    setBadges(prev => {
      const next = prev.map(b => {
        if (b.badge_type === badgeType) return { ...b, display_order: slot }
        if (slot !== null && b.display_order === slot) return { ...b, display_order: null }
        return b
      })
      void writeCache({ userId, badges: next, fetchedAt: lastFetchedAt.current })
      return next
    })

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
      .update({ display_order: slot })
      .eq('user_id', userId)
      .eq('badge_type', badgeType)
  }, [])

  useEffect(() => {
    // Load from AsyncStorage immediately so badges appear without a network round-trip,
    // then refresh from the network if the cached data is stale.
    async function init() {
      const { data: { session } } = await supabase.auth.getSession()
      const userId = session?.user?.id
      if (!userId) { setLoading(false); return }

      const cached = await readCache()
      if (cached && cached.userId === userId) {
        setBadges(cached.badges)
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
  }, [fetchBadges])

  return { badges, loading, fetchBadges, checkBadges, setDisplaySlot }
}
