import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AppState } from 'react-native'
import { useFocusEffect } from 'expo-router'
import {
  EVENT_CARD_LIST_SELECT,
  EVENT_CARD_MY_ATTENDANCE_SELECT,
  EVENT_CARD_MY_ATTENDANCE_SELECT_ATTENDING_ONLY,
  EVENT_JUST_FILLED_BODY,
  EVENT_JUST_FILLED_TITLE,
  EXTERNAL_SESSION_SELECT,
  GENERIC_ERROR_MESSAGE,
  STALE,
} from '../constants'
import { supabase } from '../lib/supabase'
import { getSessionUser } from '../lib/sessionUser'
import {
  getQueryData,
  invalidate,
  queryKey,
  removeQueries,
  setQueryData,
  subscribeQueryCache,
  useQuery,
  type QueryResult,
} from '../lib/query'
import { useSession } from '../contexts/session'
import { startOfToday } from '../utils'
import { bucketByMonthKey, enumerateMonths, monthEndIso, monthStartIso } from '../utils/monthKeys'
import { fetchEventCardPreviews, withEventCardPreviews, type EventCardPreviews } from '../utils/eventCardPreviews'
import { normalizeExternalSessions, normalizeTournaments } from '../utils/feedItems'
import { notifyError, notifyInfo } from '../utils/notify'
import { eventKeys } from './event/keys'
import type { EventWithDetails, ExternalSession, FeedRsvpResult, FeedRsvpVars } from '../types'

/**
 * The Events feed, on `lib/query`.
 *
 * - One cache entry per month: `queryKey('feed', 'month', '2026-10')` holds every
 *   feed item (club events, tournaments, other venues' sessions) dated in that
 *   local month, past ones included. The cache is module-level, so leaving the
 *   tab (desktop: unmount) and coming back paints instantly from cache.
 * - Fetches batch: every month fetcher called in the same tick joins one
 *   microtask-flushed queue and they share ONE range query per table. That is
 *   what keeps "current month + 3" on desktop, `invalidate('feed')` after an
 *   RSVP, and pull-to-refresh at three round trips instead of 3 × months.
 * - Two-phase paint: a month's events land first (with the last avatar previews
 *   we had); previews arrive in a second round trip and are merged with
 *   `setQueryData` only if nothing touched that month in between.
 *
 * Hook calls can't vary in number and `lib/query` has no `useQueries`, so the
 * hook reads months through a fixed `MAX_FEED_MONTHS` row of `useQuery` slots;
 * unused slots get a `null` key and are inert.
 */

export const FEED_PREFIX = 'feed'
/** Upper bound on months the feed holds at once (2 years of scrolling). */
export const MAX_FEED_MONTHS = 24

export function feedMonthKey(month: string): string {
  return queryKey(FEED_PREFIX, 'month', month)
}

// ─── Module state (outlives the screen, like the cache) ──────────────────────

/** Months the feed has asked for, sorted. Restored on remount so scrolled-in months come back too. */
let requestedMonths: string[] = []
/** Last avatar previews per event id: painted with the next fetch so avatars don't flicker out on refresh. */
let lastPreviews: EventCardPreviews = new Map()
/** The user the cached rows were fetched for (`my_attendance` is viewer-scoped). `undefined` = not yet known. */
let feedOwner: string | null | undefined

/** Test-only. */
export function __resetFeedState(): void {
  requestedMonths = []
  lastPreviews = new Map()
  feedOwner = undefined
  queue = []
}

/** Drop every cached month and refetch the ones on screen — e.g. the signed-in user changed. */
export function resetFeed(): void {
  removeQueries(FEED_PREFIX)
  invalidate(FEED_PREFIX)
}

// ─── Fetching ────────────────────────────────────────────────────────────────

const TOURNAMENT_FEED_SELECT =
  'id, created_by, club_id, title, location, start_date, max_teams, price, skill_levels, status, created_at, profiles!tournaments_created_by_fkey(id, username, first_name, last_name, avatar_url), clubs(id, name, avatar_url)'

/** One range query per table for `startMonth..endMonth`, bucketed by local month. Throws if the events query fails. */
async function fetchFeedSpan(startMonth: string, endMonth: string): Promise<Record<string, EventWithDetails[]>> {
  const span = enumerateMonths(startMonth, endMonth)
  const user = await getSessionUser()
  const rangeStart = monthStartIso(span[0])
  const rangeEnd = monthEndIso(span[span.length - 1])

  const buildEventsQuery = (mySelect: string | null) => {
    let q = supabase
      .from('events')
      .select(mySelect ? `${EVENT_CARD_LIST_SELECT}, ${mySelect}` : EVENT_CARD_LIST_SELECT)
      .gte('event_date', rangeStart)
      .lt('event_date', rangeEnd)
      .is('cancelled_at', null)
      .order('event_date', { ascending: true })
    if (user) q = q.eq('my_attendance.user_id', user.id)
    return q
  }

  /**
   * The `my_attendance` embed reads the base `event_attendees` table so the
   * row carries `status`. Migration files lag the live schema here, so if
   * PostgREST rejects that shape, fall back to the attending-only view: the
   * rail loses its waitlisted/pending states but the feed still renders.
   * Failing closed would blank the Events tab for every user.
   */
  const runEventsQuery = async () => {
    const first = await buildEventsQuery(user ? EVENT_CARD_MY_ATTENDANCE_SELECT : null)
    if (!first.error || !user) return first
    console.warn('[useMonthEvents] my_attendance embed rejected, retrying attending-only:', first.error.message)
    return buildEventsQuery(EVENT_CARD_MY_ATTENDANCE_SELECT_ATTENDING_ONLY)
  }

  const [eventsRes, tournamentsRes, externalRes] = await Promise.all([
    runEventsQuery(),
    supabase
      .from('tournaments')
      .select(TOURNAMENT_FEED_SELECT)
      .gte('start_date', rangeStart)
      .lt('start_date', rangeEnd)
      .neq('status', 'draft')
      .neq('status', 'cancelled'),
    // Sessions at other Austin venues (Volley ATX). A failure here only
    // drops those cards; the club's own events still render.
    supabase
      .from('external_sessions')
      .select(EXTERNAL_SESSION_SELECT)
      .gte('starts_at', rangeStart)
      .lt('starts_at', rangeEnd)
      .eq('canceled', false)
      .order('starts_at', { ascending: true }),
  ])

  // The club's own events are the feed: without them, surface the error (the
  // query layer keeps any previous data on screen). The other two are extras.
  if (eventsRes.error) throw eventsRes.error
  if (tournamentsRes.error) console.warn('[useMonthEvents] tournaments:', tournamentsRes.error.message)
  if (externalRes.error) console.warn('[useMonthEvents] external_sessions:', externalRes.error.message)

  const combined = [
    ...withEventCardPreviews((eventsRes.data ?? []) as unknown as EventWithDetails[], lastPreviews),
    ...normalizeTournaments(tournamentsRes.data as unknown[] | null),
    ...normalizeExternalSessions(externalRes.data as ExternalSession[] | null),
  ]
  combined.sort((a, b) => a.event_date.localeCompare(b.event_date))
  return bucketByMonthKey(combined, span)
}

type MonthWaiter = {
  month: string
  resolve: (events: EventWithDetails[]) => void
  reject: (e: unknown) => void
}

let queue: MonthWaiter[] = []

/**
 * The per-month `useQuery` fetcher. Months requested in the same tick (one
 * render's slots, one `invalidate('feed')`, one pull-to-refresh) are fetched
 * together as a single span.
 */
function fetchFeedMonth(month: string): Promise<EventWithDetails[]> {
  return new Promise((resolve, reject) => {
    queue.push({ month, resolve, reject })
    if (queue.length === 1) queueMicrotask(flushQueue)
  })
}

function flushQueue(): void {
  const batch = queue
  queue = []
  if (batch.length === 0) return
  const months = [...new Set(batch.map(w => w.month))].sort()
  fetchFeedSpan(months[0], months[months.length - 1]).then(
    buckets => {
      // Subscribe before resolving, so the cache writes these trigger are seen.
      hydratePreviewsWhenLanded(new Map(months.map(m => [feedMonthKey(m), buckets[m] ?? []])))
      batch.forEach(w => w.resolve(buckets[w.month] ?? []))
    },
    e => batch.forEach(w => w.reject(e)),
  )
}

/**
 * Phase two of the paint: fetch avatar previews for the events just fetched and
 * merge them into each month — but only into a month whose cached value is
 * still exactly the array this fetch produced. Any other change to that key
 * (a newer fetch, `invalidate`, an optimistic RSVP, `removeQueries`) means the
 * merge would overwrite newer state or clear a stale flag, so it is skipped;
 * the newer fetch brings its own previews.
 */
function hydratePreviewsWhenLanded(buckets: Map<string, EventWithDetails[]>): void {
  const isClubEvent = (e: EventWithDetails) => !e._isTournament && !e._external
  // Only months with a club event have avatars to add.
  const pending = new Map([...buckets].filter(([, bucket]) => bucket.some(isClubEvent)))
  const ids = [...pending.values()].flat().filter(isClubEvent).map(e => e.id)
  if (ids.length === 0) return

  const landed = new Set<string>()
  let previews: EventCardPreviews | null = null
  let writing = false
  let done = false

  const finish = () => {
    if (done) return
    done = true
    unsubscribe()
    clearTimeout(giveUp)
  }

  const mergeLanded = () => {
    if (done || !previews) return
    const p = previews
    pending.forEach((bucket, key) => {
      if (!landed.has(key)) return
      pending.delete(key)
      writing = true
      try {
        setQueryData<EventWithDetails[]>(key, withEventCardPreviews(bucket, p))
      } finally {
        writing = false
      }
    })
    if (pending.size === 0) finish()
  }

  const unsubscribe = subscribeQueryCache(key => {
    if (writing) return
    const bucket = pending.get(key)
    if (!bucket) return
    if (!landed.has(key) && getQueryData(key) === bucket) {
      landed.add(key)
      if (previews) queueMicrotask(mergeLanded)
      return
    }
    pending.delete(key)
    landed.delete(key)
    if (pending.size === 0) finish()
  })
  // A superseded write that never lands and is never followed by a notify
  // (its entry was deleted outright) would otherwise leave this listener behind.
  const giveUp = setTimeout(finish, 60_000)

  void fetchEventCardPreviews(ids).then(result => {
    for (const id of ids) lastPreviews.set(id, result.get(id) ?? [])
    previews = result
    mergeLanded()
  })
}

// ─── Hook ────────────────────────────────────────────────────────────────────

function withMonths(current: string[], add: string[]): string[] {
  const missing = add.filter(m => !current.includes(m))
  if (missing.length === 0) return current
  return [...current, ...missing].sort().slice(0, MAX_FEED_MONTHS)
}

export function useMonthEvents() {
  const { userId, loading: sessionLoading } = useSession()
  const [months, setMonths] = useState<string[]>(() => requestedMonths)

  // A fixed number of hook calls every render (see the file comment).
  const slots: QueryResult<EventWithDetails[]>[] = []
  for (let i = 0; i < MAX_FEED_MONTHS; i++) {
    const month = months[i] ?? null
    // eslint-disable-next-line react-hooks/rules-of-hooks -- constant trip count
    slots.push(useQuery<EventWithDetails[]>(
      month === null ? null : feedMonthKey(month),
      () => fetchFeedMonth(month as string),
      { staleMs: STALE.feed },
    ))
  }
  const slotsRef = useRef(slots)
  slotsRef.current = slots

  // RSVP state in cached months belongs to whoever was signed in when they were
  // fetched. The cache outlives this screen, so compare against the module-level
  // owner rather than a per-mount ref (sign out on Profile, come back to Events).
  // Ignored while the session is still restoring (userId is null then, not "guest").
  useEffect(() => {
    if (sessionLoading) return
    if (feedOwner !== undefined && feedOwner !== userId) resetFeed()
    feedOwner = userId
  }, [userId, sessionLoading])

  const request = useCallback((add: string[]) => {
    const next = withMonths(requestedMonths, add)
    if (next === requestedMonths) return
    requestedMonths = next
    setMonths(next)
  }, [])

  /** Add `month` to the feed. `force`: refetch it even if fresh (after a create/edit). */
  const loadMonth = useCallback((month: string, force = false) => {
    request([month])
    if (force) invalidate(feedMonthKey(month))
  }, [request])

  const loadMonthSpan = useCallback((startMonth: string, endMonth: string, force = false) => {
    const span = enumerateMonths(startMonth, endMonth)
    request(span)
    if (force) span.forEach(m => invalidate(feedMonthKey(m)))
  }, [request])

  /** Refetch every loaded month now (pull-to-refresh). Resolves when they have all settled. */
  const refresh = useCallback(async () => {
    await Promise.all(slotsRef.current.map(s => s.refetch({ force: true })))
  }, [])

  /** Refetch only the months that are stale. Retry after an error, focus, foreground. */
  const refetchStale = useCallback(() => {
    slotsRef.current.forEach(s => { void s.refetch() })
  }, [])

  useFocusEffect(refetchStale)
  useEffect(() => {
    const sub = AppState.addEventListener('change', status => {
      if (status === 'active') refetchStale()
    })
    return () => sub.remove()
  }, [refetchStale])

  const monthData = slots.map(s => s.data)
  const events = useMemo(() => {
    const today = startOfToday()
    return monthData
      .flatMap(d => d ?? [])
      .filter(e => e.event_date >= today)
      .sort((a, b) => a.event_date.localeCompare(b.event_date))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, monthData)

  const loadedMonths = useMemo(
    () => months.filter((_, i) => monthData[i] !== undefined),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [months, ...monthData],
  )
  const isMonthLoaded = useCallback((month: string) => getQueryData(feedMonthKey(month)) !== undefined, [])

  // True only while a requested month has nothing to show yet (including before
  // the screen's first loadMonth, so the first paint is a spinner, not "No
  // events"). Background refetches (`invalidate('feed')`, focus) don't count:
  // they must not flash the footer spinner or pause infinite scroll.
  const loading = months.length === 0 || slots.some(s => s.isLoading)
  const error = slots.find(s => s.error)?.error ?? null
  const lastData = months.length > 0 ? monthData[months.length - 1] : undefined
  const reachedEnd = months.length >= MAX_FEED_MONTHS || (lastData !== undefined && lastData.length === 0)

  return { events, loadMonth, loadMonthSpan, refresh, refetchStale, loading, error, isMonthLoaded, loadedMonths, reachedEnd }
}

// ─── RSVP from a feed card ───────────────────────────────────────────────────

/** Every cached month holding `eventId` (normally exactly one). */
function monthsHolding(eventId: string): Array<[string, EventWithDetails[]]> {
  const out: Array<[string, EventWithDetails[]]> = []
  for (const month of requestedMonths) {
    const key = feedMonthKey(month)
    const data = getQueryData<EventWithDetails[]>(key)
    if (data?.some(e => e.id === eventId)) out.push([key, data])
  }
  return out
}

/** `event` as `userId` would see it with `status` (null = no row). Keeps the attending count in step. */
export function withMyAttendance(
  event: EventWithDetails,
  userId: string,
  status: 'attending' | 'waitlisted' | null,
): EventWithDetails {
  const rows = event.my_attendance ?? []
  const wasAttending = rows.some(a => a.user_id === userId && (a.status ?? 'attending') === 'attending')
  const isAttending = status === 'attending'
  const count = Number(event.event_attendees_attending?.[0]?.count ?? 0)
  const nextCount = Math.max(0, count + (isAttending ? 1 : 0) - (wasAttending ? 1 : 0))
  return {
    ...event,
    my_attendance: [
      ...rows.filter(a => a.user_id !== userId),
      ...(status ? [{ user_id: userId, status }] : []),
    ],
    event_attendees_attending: [{ count: nextCount }],
  }
}

/**
 * Patch `eventId` in every cached month. The rollback restores only that
 * event's row, so undoing one card never reverts another card's RSVP that is
 * still in flight in the same month.
 */
function patchEvent(eventId: string, userId: string, status: 'attending' | 'waitlisted' | null): () => void {
  const snapshots = monthsHolding(eventId)
  const originals = new Map<string, EventWithDetails>()
  for (const [key, data] of snapshots) {
    const original = data.find(e => e.id === eventId)
    if (original) originals.set(key, original)
    setQueryData<EventWithDetails[]>(key, data.map(e => (e.id === eventId ? withMyAttendance(e, userId, status) : e)))
  }
  return () => {
    originals.forEach((original, key) => {
      setQueryData<EventWithDetails[]>(key, prev => (prev ?? []).map(e => (e.id === eventId ? original : e)))
    })
  }
}

async function writeRsvp({ eventId, action, userId }: FeedRsvpVars): Promise<FeedRsvpResult> {
  if (action === 'leave') {
    const { error } = await supabase.from('event_attendees').delete().eq('event_id', eventId).eq('user_id', userId)
    if (error) throw error
    return { status: null }
  }
  // The database enforces capacity: if the last spot went to someone else first,
  // the insert is saved as 'waitlisted', so read back which status we actually got.
  const { data, error } = await supabase
    .from('event_attendees')
    .insert({ event_id: eventId, user_id: userId })
    .select('status')
    .single()
  if (error) throw error
  const status = (data as { status?: string } | null)?.status === 'waitlisted' ? 'waitlisted' : 'attending'
  // Correct the optimistic "Going" before `invalidates` refetches (a write after
  // that would cancel the refetch).
  if (status === 'waitlisted') patchEvent(eventId, userId, 'waitlisted')
  return { status }
}

/**
 * Join / leave from a feed card: optimistic `my_attendance` + attending count,
 * rolled back with an alert on error. One write per event at a time (a second
 * tap on the same card is ignored), but different cards can be in flight
 * together. On success the event's detail entry is invalidated so a recently
 * opened event page doesn't show a stale Join button; the feed is invalidated
 * once no card write is pending, so a refetch can't clobber another card's
 * optimistic state.
 */
export function useFeedRsvp() {
  const pendingRef = useRef(new Set<string>())
  const [pendingEventIds, setPendingEventIds] = useState<ReadonlySet<string>>(() => new Set())

  const rsvp = useCallback(async (vars: FeedRsvpVars) => {
    const { eventId, action, userId } = vars
    if (pendingRef.current.has(eventId)) return
    pendingRef.current.add(eventId)
    setPendingEventIds(new Set(pendingRef.current))

    const rollback = patchEvent(eventId, userId, action === 'join' ? 'attending' : null)
    try {
      const result = await writeRsvp(vars)
      invalidate(eventKeys.root(eventId))
      if (action === 'join' && result.status === 'waitlisted') notifyInfo(EVENT_JUST_FILLED_TITLE, EVENT_JUST_FILLED_BODY)
    } catch (e) {
      rollback()
      console.error('[useFeedRsvp]', e instanceof Error ? e.message : (e as { message?: string })?.message ?? e)
      notifyError('Error', GENERIC_ERROR_MESSAGE)
    } finally {
      pendingRef.current.delete(eventId)
      setPendingEventIds(new Set(pendingRef.current))
      if (pendingRef.current.size === 0) invalidate(FEED_PREFIX)
    }
  }, [])

  const isPending = useCallback((eventId: string) => pendingEventIds.has(eventId), [pendingEventIds])

  return { rsvp, pendingEventIds, isPending }
}
