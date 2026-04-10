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
  const inFlight = useRef<Set<string>>(new Set())
  const [loadingMonths, setLoadingMonths] = useState<Set<string>>(new Set())
  const [tick, setTick] = useState(0)
  const [reachedEnd, setReachedEnd] = useState(false)

  const loadMonth = useCallback(async (month: string, force = false) => {
    const entry = cacheRef.current[month]
    if (!force && entry && Date.now() - entry.fetchedAt < STALE_MS) return
    if (inFlight.current.has(month)) return

    inFlight.current.add(month)
    setLoadingMonths(prev => new Set([...prev, month]))

    try {
      const { data, error } = await supabase
        .from('events')
        .select(EVENT_CARD_LIST_SELECT)
        .gte('event_date', monthStart(month))
        .lt('event_date', monthEnd(month))
        .is('cancelled_at', null)
        .order('event_date', { ascending: true })

      if (!error && data) {
        cacheRef.current[month] = {
          events: data as unknown as EventWithDetails[],
          fetchedAt: Date.now(),
        }
        if (data.length === 0) setReachedEnd(true)
        setTick(t => t + 1) // tell React the cache changed → recompute events
      }
    } finally {
      inFlight.current.delete(month)
      setLoadingMonths(prev => {
        const next = new Set(prev)
        next.delete(month)
        return next
      })
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
