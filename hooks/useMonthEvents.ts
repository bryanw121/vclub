import { useCallback, useMemo, useRef, useState } from 'react'
import { EVENT_CARD_LIST_SELECT, EVENT_CARD_MY_ATTENDANCE_SELECT } from '../constants'
import { supabase } from '../lib/supabase'
import { getSessionUser } from '../lib/sessionUser'
import { startOfToday } from '../utils'
import {
  bucketByMonthKey,
  enumerateMonths,
  monthEndIso,
  monthStartIso,
} from '../utils/monthKeys'
import { attachEventCardPreviews } from '../utils/eventCardPreviews'
import { EventWithDetails } from '../types'

const STALE_MS = 60_000

type MonthEntry = {
  events: EventWithDetails[]
  fetchedAt: number
}

const TOURNAMENT_TAG = { id: '_tournament', name: 'Tournament', category: 'event_type', display_order: 2, created_at: '' }

function normalizeTournaments(tournamentsData: unknown[] | null): EventWithDetails[] {
  return (tournamentsData ?? []).map((t: any) => ({
    id:                         t.id,
    created_by:                 t.created_by,
    club_id:                    t.club_id,
    title:                      t.title,
    description:                null,
    location:                   t.location,
    event_date:                 t.start_date,
    duration_minutes:           0,
    max_attendees:              t.max_teams ?? null,
    created_at:                 t.created_at,
    price:                      t.price ?? 0,
    cancelled_at:               null,
    profiles:                   t.profiles,
    clubs:                      t.clubs,
    event_tags:                 [{ tag_id: '_tournament', tags: TOURNAMENT_TAG }],
    attendee_previews:          [],
    my_attendance:              [],
    event_attendees_attending:  [{ count: 0 }],
    event_guests_attending:     [{ count: 0 }],
    event_attendees_waitlisted: [{ count: 0 }],
    _isTournament:              true,
  }))
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

    const p = (async () => {
      setLoadingMonths(prev => new Set([...prev, ...span]))
      try {
        const user = await getSessionUser()
        const listSelect = user
          ? `${EVENT_CARD_LIST_SELECT}, ${EVENT_CARD_MY_ATTENDANCE_SELECT}`
          : EVENT_CARD_LIST_SELECT

        let eventsQuery = supabase
          .from('events')
          .select(listSelect)
          .gte('event_date', monthStartIso(span[0]))
          .lt('event_date', monthEndIso(span[span.length - 1]))
          .is('cancelled_at', null)
          .order('event_date', { ascending: true })
        if (user) {
          eventsQuery = eventsQuery.eq('my_attendance.user_id', user.id)
        }

        const [{ data: eventsData, error: eventsError }, { data: tournamentsData }] = await Promise.all([
          eventsQuery,
          supabase
            .from('tournaments')
            .select('id, created_by, club_id, title, location, start_date, max_teams, price, skill_levels, status, created_at, profiles!tournaments_created_by_fkey(id, username, first_name, last_name, avatar_url), clubs(id, name, avatar_url)')
            .gte('start_date', monthStartIso(span[0]))
            .lt('start_date', monthEndIso(span[span.length - 1]))
            .neq('status', 'draft')
            .neq('status', 'cancelled'),
        ])

        if (eventsError) return

        const withPreviews = await attachEventCardPreviews(
          (eventsData ?? []) as unknown as EventWithDetails[],
        )
        const combined = [...withPreviews, ...normalizeTournaments(tournamentsData as unknown[] | null)]
        combined.sort((a, b) => a.event_date.localeCompare(b.event_date))

        const buckets = bucketByMonthKey(combined, span)
        const now = Date.now()
        for (const month of span) {
          cacheRef.current[month] = { events: buckets[month] ?? [], fetchedAt: now }
        }
        if ((buckets[span[span.length - 1]] ?? []).length === 0) setReachedEnd(true)
        setTick(t => t + 1)
      } finally {
        setLoadingMonths(prev => {
          const next = new Set(prev)
          for (const month of span) next.delete(month)
          return next
        })
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
