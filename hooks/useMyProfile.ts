import { useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { Sentry } from '../lib/sentry'
import { getQueryData, queryKey, setQueryData, useMutation, useQuery } from '../lib/query'
import type { QueryResult } from '../lib/query'
import { STALE } from '../constants/cache'
import { useSession } from '../contexts/session'
import { normalizeVolleyballPositions, normalizeVolleyballSkillLevel } from '../utils'
import type { Profile, ProfilePatch } from '../types'

/**
 * The columns every screen needs from a profile (own or someone else's): the
 * public ones. Never includes `is_admin` or `notification_prefs`. Phase C moves
 * this next to the other select fragments in `constants/selects.ts`.
 */
export const PROFILE_BRIEF_SELECT =
  'id, username, first_name, last_name, avatar_url, position, skill_level, created_at, selected_border, selected_card_bg, bio'

/** The viewer's own row: the public columns plus their private notification settings. */
const MY_PROFILE_SELECT = `${PROFILE_BRIEF_SELECT}, notification_prefs`

/** Cache key of the signed-in user's own profile. */
export function myProfileKey(userId: string): string {
  return queryKey('profile', 'me', userId)
}

/** Cache key of how many cheers the signed-in user has received. */
export function myCheersCountKey(userId: string): string {
  return queryKey('cheers', 'received', userId)
}

/** A `profiles` row as PostgREST returns it → the `Profile` the UI works with. */
export function normalizeProfileRow(row: Partial<Profile>): Profile {
  return {
    id: row.id as string,
    username: row.username as string,
    first_name: row.first_name ?? null,
    last_name: row.last_name ?? null,
    avatar_url: row.avatar_url ?? null,
    position: normalizeVolleyballPositions(row.position),
    skill_level: normalizeVolleyballSkillLevel(row.skill_level),
    created_at: row.created_at as string,
    selected_border: row.selected_border ?? null,
    selected_card_bg: row.selected_card_bg ?? null,
    bio: row.bio ?? null,
    notification_prefs: row.notification_prefs ?? null,
  }
}

export type MyProfile = {
  profile: Profile | undefined
  error: Error | null
  /** No profile to show yet and a fetch is pending. */
  isLoading: boolean
  isFetching: boolean
  isStale: boolean
  refetch: QueryResult<Profile>['refetch']
  /**
   * Optimistically applies `patch` to the cached profile, then writes it.
   * Resolves to `true` when saved; on failure the cache is rolled back and it
   * resolves to `false` (`saveError` holds the reason).
   */
  updateProfile: (patch: ProfilePatch) => Promise<boolean>
  isSaving: boolean
  saveError: Error | null
}

/**
 * The signed-in user's own profile. Every reader shares one cache entry, so a
 * save in the Profile tab is immediately visible everywhere else.
 *
 * `enabled: false` reads the cache without fetching (a hidden tab that has not
 * been opened yet).
 */
export function useMyProfile(opts?: { enabled?: boolean }): MyProfile {
  const { userId } = useSession()
  const key = userId ? myProfileKey(userId) : null
  const enabled = (opts?.enabled ?? true) && userId !== null

  const query = useQuery<Profile>(
    key,
    async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select(MY_PROFILE_SELECT)
        .eq('id', userId as string)
        .single()
      if (error) throw error
      return normalizeProfileRow(data as Partial<Profile>)
    },
    { staleMs: STALE.profile, enabled },
  )

  const mutation = useMutation<ProfilePatch, ProfilePatch>(
    async patch => {
      if (!userId) throw new Error('Not logged in')
      const { error } = await supabase.from('profiles').update(patch).eq('id', userId)
      if (error) throw error
      return patch
    },
    {
      onMutate: patch => {
        if (!key) return
        const previous = getQueryData<Profile>(key)
        if (!previous) return
        setQueryData<Profile>(key, { ...previous, ...patch })
        return () => setQueryData<Profile>(key, previous)
      },
      onError: error => Sentry.captureException(error),
    },
  )

  const { mutate } = mutation
  const updateProfile = useCallback(
    async (patch: ProfilePatch): Promise<boolean> => (await mutate(patch)) !== undefined,
    [mutate],
  )

  return {
    profile: query.data,
    error: query.error,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isStale: query.isStale,
    refetch: query.refetch,
    updateProfile,
    isSaving: mutation.isPending,
    saveError: mutation.error,
  }
}

/**
 * How many cheers the signed-in user has received (exact, head-only count). A
 * failed refetch keeps the last known count instead of dropping it to zero.
 */
export function useMyCheersCount(opts?: { enabled?: boolean }): QueryResult<number> {
  const { userId } = useSession()
  return useQuery<number>(
    userId ? myCheersCountKey(userId) : null,
    async () => {
      const { count, error } = await supabase
        .from('cheers')
        .select('id', { count: 'exact', head: true })
        .eq('receiver_id', userId as string)
      if (error) throw error
      return count ?? 0
    },
    { staleMs: STALE.profile, enabled: (opts?.enabled ?? true) && userId !== null },
  )
}
