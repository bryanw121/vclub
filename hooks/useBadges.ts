import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { collectBadgeStats, checkAndAwardBadges } from '../utils/badges'
import type { UserBadge, Profile } from '../types'

const BADGE_SELECT = 'id, user_id, badge_type, tier, awarded_at, display_order'
const STALE_MS = 60_000

export function useBadges() {
  const [badges, setBadges] = useState<UserBadge[]>([])
  const [loading, setLoading] = useState(true)
  const lastFetchedAt = useRef(0)

  const fetchBadges = useCallback(async (force = false) => {
    if (!force && Date.now() - lastFetchedAt.current < STALE_MS) return
    const { data: { session } } = await supabase.auth.getSession()
    const userId = session?.user?.id
    if (!userId) { setLoading(false); return }

    const { data } = await supabase
      .from('user_badges')
      .select(BADGE_SELECT)
      .eq('user_id', userId)
      .order('display_order', { ascending: true, nullsFirst: false })

    setBadges((data ?? []) as UserBadge[])
    lastFetchedAt.current = Date.now()
    setLoading(false)
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
    setBadges(prev => prev.map(b => {
      if (b.badge_type === badgeType) return { ...b, display_order: slot }
      // Clear any other badge that was in the same slot
      if (slot !== null && b.display_order === slot) return { ...b, display_order: null }
      return b
    }))

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
    void fetchBadges(true)
  }, [fetchBadges])

  return { badges, loading, fetchBadges, checkBadges, setDisplaySlot }
}
