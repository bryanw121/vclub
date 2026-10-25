import { useCallback, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useFocusRefetch, useQuery } from '../../lib/query'
import { useSession } from '../../contexts/session'
import {
  STALE,
  COHOST_SELECT,
  COMMENT_SELECT,
  EVENT_DETAIL_SELECT,
  GUEST_SELECT,
  PROFILE_BRIEF,
} from '../../constants'
import type {
  EventCohostWithProfile,
  EventCommentWithAuthor,
  EventGuest,
  EventWithDetails,
  ProfileBrief,
} from '../../types'
import { eventKeys } from './keys'
import { deriveRoster } from './derive'

// ─── Fetchers (throw on a Supabase error so lib/query records it) ─────────────

export async function fetchEventDetail(id: string): Promise<EventWithDetails | null> {
  const { data, error } = await supabase.from('events').select(EVENT_DETAIL_SELECT).eq('id', id).maybeSingle()
  if (error) throw error
  return (data ?? null) as unknown as EventWithDetails | null
}

export async function fetchEventGuests(id: string): Promise<EventGuest[]> {
  const { data, error } = await supabase
    .from('event_guests')
    .select(GUEST_SELECT)
    .eq('event_id', id)
    .order('joined_at', { ascending: true })
  if (error) throw error
  return (data ?? []) as unknown as EventGuest[]
}

export async function fetchEventCohosts(id: string): Promise<EventCohostWithProfile[]> {
  const { data, error } = await supabase
    .from('event_cohosts')
    .select(COHOST_SELECT)
    .eq('event_id', id)
    .order('added_at', { ascending: true })
  if (error) throw error
  return (data ?? []) as unknown as EventCohostWithProfile[]
}

export async function fetchEventComments(id: string): Promise<EventCommentWithAuthor[]> {
  const { data, error } = await supabase
    .from('event_comments')
    .select(COMMENT_SELECT)
    .eq('event_id', id)
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []) as unknown as EventCommentWithAuthor[]
}

/** Same key and shape (`ProfileBrief`) chat caches sender profiles under. */
export async function fetchViewerProfile(userId: string): Promise<ProfileBrief | null> {
  const { data, error } = await supabase.from('profiles').select(PROFILE_BRIEF).eq('id', userId).maybeSingle()
  if (error) throw error
  return (data ?? null) as ProfileBrief | null
}

const EMPTY_GUESTS: EventGuest[] = []
const EMPTY_COHOSTS: EventCohostWithProfile[] = []
const EMPTY_COMMENTS: EventCommentWithAuthor[] = []

/**
 * Everything the event detail screen reads, fetched in ONE parallel round:
 * the event row (host, attendees with profiles, tags), +1 guests, co-hosts,
 * comments — each only needs the id — plus the viewer's own profile.
 *
 * Each piece is its own `lib/query` key under `event:<id>`, so a write can
 * patch just that piece with `setQueryData`, and `invalidate('event:<id>')`
 * (the `/host` edit) refreshes all of them. Refocusing refetches only what is
 * older than `STALE.detail`.
 */
export function useEventData(id: string) {
  const { userId } = useSession()
  const opts = { staleMs: STALE.detail }

  const main = useQuery(eventKeys.root(id), () => fetchEventDetail(id), opts)
  const guests = useQuery(eventKeys.guests(id), () => fetchEventGuests(id), opts)
  const cohosts = useQuery(eventKeys.cohosts(id), () => fetchEventCohosts(id), opts)
  const comments = useQuery(eventKeys.comments(id), () => fetchEventComments(id), opts)
  const viewer = useQuery(
    userId ? eventKeys.viewerProfile(userId) : null,
    () => fetchViewerProfile(userId as string),
    { staleMs: STALE.profile },
  )

  useFocusRefetch(eventKeys.root(id))
  useFocusRefetch(eventKeys.guests(id))
  useFocusRefetch(eventKeys.cohosts(id))
  useFocusRefetch(eventKeys.comments(id))

  const event = main.data ?? undefined
  const roster = useMemo(() => deriveRoster(event, guests.data), [event, guests.data])

  const [refreshing, setRefreshing] = useState(false)
  const refetchAll = useCallback(async () => {
    await Promise.all([
      main.refetch({ force: true }),
      guests.refetch({ force: true }),
      cohosts.refetch({ force: true }),
      comments.refetch({ force: true }),
    ])
  }, [main.refetch, guests.refetch, cohosts.refetch, comments.refetch])

  /** Pull-to-refresh: one parallel round; what is on screen stays until it lands. */
  const refresh = useCallback(async () => {
    setRefreshing(true)
    try {
      await refetchAll()
    } finally {
      setRefreshing(false)
    }
  }, [refetchAll])

  // The shell waits for the row, guests and co-hosts (the roster and host
  // actions need all three). Comments load behind their own spinner.
  const isLoading = main.isLoading || guests.isLoading || cohosts.isLoading
  const loadError = (!main.data && main.error) || (!guests.data && guests.error) || null

  return {
    id,
    userId,
    event,
    /** `true` once the row request finished and the event does not exist (or is hidden by RLS). */
    notFound: main.data === null,
    allGuests: guests.data ?? EMPTY_GUESTS,
    cohosts: cohosts.data ?? EMPTY_COHOSTS,
    comments: comments.data ?? EMPTY_COMMENTS,
    commentsLoading: comments.isLoading,
    viewerProfile: viewer.data ?? null,
    roster,
    isLoading,
    loadError,
    refresh,
    refreshing,
    retry: refetchAll,
  }
}

export type EventData = ReturnType<typeof useEventData>
