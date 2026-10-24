import { useCallback, useMemo, useRef, useState } from 'react'
import {
  EVENT_CARD_LIST_SELECT,
  EVENT_CARD_MY_ATTENDANCE_SELECT,
  EVENT_CARD_MY_ATTENDANCE_SELECT_ATTENDING_ONLY,
  EXTERNAL_SESSION_SELECT,
} from '../constants'
import { supabase } from '../lib/supabase'
import { getSessionUser } from '../lib/sessionUser'
import { startOfToday } from '../utils'
import {
  bucketByMonthKey,
  enumerateMonths,
  monthEndIso,
  monthStartIso,
} from '../utils/monthKeys'
import { fetchEventCardPreviews, withEventCardPreviews } from '../utils/eventCardPreviews'
import { normalizeExternalSessions, normalizeTournaments } from '../utils/feedItems'
import type { EventWithDetails, ExternalSession } from '../types'

const STALE_MS = 60_000

type MonthEntry = {
  events: EventWithDetails[]
  fetchedAt: number
}

export function useMonthEvents() {
  // Cache lives in a ref so loadMonth never needs it as a dependency.
  // A separate tick state triggers re-renders when cache contents change.
  const cacheRef = useRef<Record<string, MonthEntry>>({})
  /** One promise per month so callers (e.g. pull-to-refresh) can await in-flight loads */
  const pendingByMonth = useRef<Record<string, Promise<void>>>({})
  const [loadingMonths, setLoadingMonths] = useState<Set<string>>(new Set())
  const [tick, setTick] = useState(0)
  const [reachedEnd, setReachedEnd] = useState(false)

  const queueRef = useRef<{ months: string[]; force: boolean; waiters: Array<{
    resolve: () => void
    reject: (e: unknown) => void
  }> }>({ months: [], force: false, waiters: [] })
  const flushScheduled = useRef(false)

  const fetchMonths = useCallback(async (months: string[], force = false) => {
    const unique = [...new Set(months)].sort()
    if (unique.length === 0) return

    const isFresh = (month: string) => {
      const entry = cacheRef.current[month]
      return !!entry && Date.now() - entry.fetchedAt < STALE_MS
    }

    let needed = force ? unique : unique.filter(m => !isFresh(m))
    if (needed.length === 0) return

    // Join overlapping in-flight fetches, then re-check
    const overlapping = new Set<Promise<void>>()
    for (const month of needed) {
      const existing = pendingByMonth.current[month]
      if (existing) overlapping.add(existing)
    }
    if (overlapping.size > 0) {
      await Promise.all([...overlapping])
      needed = force ? unique : unique.filter(m => !isFresh(m))
      if (needed.length === 0) return
    }

    const span = enumerateMonths(needed[0], needed[needed.length - 1])

    const clearLoading = () => setLoadingMonths(prev => {
      const next = new Set(prev)
      for (const month of span) next.delete(month)
      return next
    })

    const p = (async () => {
      setLoadingMonths(prev => new Set([...prev, ...span]))
      try {
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

        const [
          { data: eventsData, error: eventsError },
          { data: tournamentsData },
          { data: externalData },
        ] = await Promise.all([
          runEventsQuery(),
          supabase
            .from('tournaments')
            .select('id, created_by, club_id, title, location, start_date, max_teams, price, skill_levels, status, created_at, profiles!tournaments_created_by_fkey(id, username, first_name, last_name, avatar_url), clubs(id, name, avatar_url)')
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

        if (eventsError) return

        // Paint the feed as soon as the events arrive; avatar previews follow in a
        // second round trip. Until they land, keep any previews already cached for
        // the same event so a refresh doesn't make avatars flicker out and back.
        const previousPreviews = new Map<string, EventWithDetails['attendee_previews']>()
        for (const month of span) {
          for (const e of cacheRef.current[month]?.events ?? []) previousPreviews.set(e.id, e.attendee_previews)
        }
        const regularEvents = withEventCardPreviews(
          (eventsData ?? []) as unknown as EventWithDetails[],
          previousPreviews,
        )
        const combined = [
          ...regularEvents,
          ...normalizeTournaments(tournamentsData as unknown[] | null),
          ...normalizeExternalSessions(externalData as ExternalSession[] | null),
        ]
        combined.sort((a, b) => a.event_date.localeCompare(b.event_date))

        const buckets = bucketByMonthKey(combined, span)
        const fetchedAt = Date.now()
        for (const month of span) {
          cacheRef.current[month] = { events: buckets[month] ?? [], fetchedAt }
        }
        if ((buckets[span[span.length - 1]] ?? []).length === 0) setReachedEnd(true)
        setTick(t => t + 1)
        clearLoading()

        const previews = await fetchEventCardPreviews(regularEvents.map(e => e.id))
        let changed = false
        for (const month of span) {
          const entry = cacheRef.current[month]
          // A newer fetch (or an invalidate) replaced this month meanwhile: leave it.
          if (!entry || entry.fetchedAt !== fetchedAt) continue
          cacheRef.current[month] = { ...entry, events: withEventCardPreviews(entry.events, previews) }
          changed = true
        }
        if (changed) setTick(t => t + 1)
      } finally {
        clearLoading()
      }
    })()

    for (const month of span) pendingByMonth.current[month] = p
    try {
      await p
    } finally {
      for (const month of span) {
        if (pendingByMonth.current[month] === p) delete pendingByMonth.current[month]
      }
    }
  }, [])

  const enqueue = useCallback((months: string[], force = false) => {
    return new Promise<void>((resolve, reject) => {
      const q = queueRef.current
      q.months.push(...months)
      q.force = q.force || force
      q.waiters.push({ resolve, reject })
      if (flushScheduled.current) return
      flushScheduled.current = true
      queueMicrotask(() => {
        flushScheduled.current = false
        const { months: queued, force: queuedForce, waiters } = queueRef.current
        queueRef.current = { months: [], force: false, waiters: [] }
        void fetchMonths(queued, queuedForce).then(
          () => { waiters.forEach(w => w.resolve()) },
          (e) => { waiters.forEach(w => w.reject(e)) },
        )
      })
    })
  }, [fetchMonths])

  const loadMonth = useCallback((month: string, force = false) => {
    return enqueue([month], force)
  }, [enqueue])

  const loadMonthSpan = useCallback((startMonth: string, endMonth: string, force = false) => {
    return enqueue(enumerateMonths(startMonth, endMonth), force)
  }, [enqueue])

  const invalidateMonth = useCallback((month: string) => {
    delete cacheRef.current[month]
    setReachedEnd(false)
    setTick(t => t + 1)
  }, [])

  const invalidateAll = useCallback(() => {
    cacheRef.current = {}
    setReachedEnd(false)
    setTick(t => t + 1)
  }, [])

  // Recomputes only when tick changes (i.e. when cache is written or cleared)
  const events = useMemo(() => {
    const today = startOfToday()
    return Object.values(cacheRef.current)
      .flatMap(entry => entry.events)
      .filter(e => e.event_date >= today)
      .sort((a, b) => a.event_date.localeCompare(b.event_date))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick])

  const loading = loadingMonths.size > 0
  const isMonthLoaded = useCallback((month: string) => !!cacheRef.current[month], [])
  // Sorted list of months that have data in cache — recomputes when tick changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const loadedMonths = useMemo(() => Object.keys(cacheRef.current).sort(), [tick])

  return { events, loadMonth, loadMonthSpan, invalidateMonth, invalidateAll, loading, isMonthLoaded, loadedMonths, reachedEnd }
}
