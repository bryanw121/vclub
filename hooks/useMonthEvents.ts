import { useCallback, useMemo, useRef, useState } from 'react'
import { EVENT_CARD_LIST_SELECT } from '../constants'
import { supabase } from '../lib/supabase'
import { startOfToday } from '../utils'
import { EventWithDetails } from '../types'

const STALE_MS = 60_000

type MonthEntry = {
  events: EventWithDetails[]
  fetchedAt: number
}

function monthStart(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, 1)).toISOString()
}

function monthEnd(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return new Date(Date.UTC(y, m, 1)).toISOString()
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

  const loadMonth = useCallback(async (month: string, force = false) => {
    const entry = cacheRef.current[month]
    if (!force && entry && Date.now() - entry.fetchedAt < STALE_MS) return

    // Join or wait out an in-flight load, then re-check (force always continues to a fresh fetch)
    for (;;) {
      const existing = pendingByMonth.current[month]
      if (existing) {
        await existing
        if (!force) {
          const e = cacheRef.current[month]
          if (e && Date.now() - e.fetchedAt < STALE_MS) return
        }
        continue
      }
      break
    }

    const p = (async () => {
      setLoadingMonths(prev => new Set([...prev, month]))
      try {
        const [{ data: eventsData, error: eventsError }, { data: tournamentsData }] = await Promise.all([
          supabase
            .from('events')
            .select(EVENT_CARD_LIST_SELECT)
            .gte('event_date', monthStart(month))
            .lt('event_date', monthEnd(month))
            .is('cancelled_at', null)
            .order('event_date', { ascending: true }),
          supabase
            .from('tournaments')
            .select('id, created_by, club_id, title, location, start_date, max_teams, price, skill_levels, status, created_at, profiles!tournaments_created_by_fkey(id, username, first_name, last_name, avatar_url), clubs(id, name, avatar_url)')
            .gte('start_date', monthStart(month))
            .lt('start_date', monthEnd(month))
            .neq('status', 'draft')
            .neq('status', 'cancelled'),
        ])

        if (!eventsError) {
          const TOURNAMENT_TAG = { id: '_tournament', name: 'Tournament', category: 'event_type', display_order: 2, created_at: '' }
          const normalized: EventWithDetails[] = (tournamentsData ?? []).map((t: any) => ({
            id:                        t.id,
            created_by:                t.created_by,
            club_id:                   t.club_id,
            title:                     t.title,
            description:               null,
            location:                  t.location,
            event_date:                t.start_date,
            duration_minutes:          0,
            max_attendees:             t.max_teams ?? null,
            created_at:                t.created_at,
            price:                     t.price ?? 0,
            cancelled_at:              null,
            profiles:                  t.profiles,
            clubs:                     t.clubs,
            event_tags:                [{ tag_id: '_tournament', tags: TOURNAMENT_TAG }],
            attendee_previews:         [],
            event_attendees_attending: [{ count: 0 }],
            event_guests_attending:    [{ count: 0 }],
            event_attendees_waitlisted:[{ count: 0 }],
            _isTournament:             true,
          }))

          const combined = [...(eventsData as unknown as EventWithDetails[]), ...normalized]
          combined.sort((a, b) => a.event_date.localeCompare(b.event_date))

          cacheRef.current[month] = {
            events: combined,
            fetchedAt: Date.now(),
          }
          if (combined.length === 0) setReachedEnd(true)
          setTick(t => t + 1)
        }
      } finally {
        setLoadingMonths(prev => {
          const next = new Set(prev)
          next.delete(month)
          return next
        })
      }
    })()

    pendingByMonth.current[month] = p
    try {
      await p
    } finally {
      if (pendingByMonth.current[month] === p) delete pendingByMonth.current[month]
    }
  }, []) // stable — reads cacheRef directly, no closure over state

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

  return { events, loadMonth, invalidateMonth, invalidateAll, loading, isMonthLoaded, loadedMonths, reachedEnd }
}
