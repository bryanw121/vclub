import { useCallback, useEffect, useRef, useState } from 'react'
import { EVENT_CARD_LIST_SELECT, EVENT_CARD_MY_ATTENDANCE_SELECT } from '../constants'
import { supabase } from '../lib/supabase'
import { getSessionUser } from '../lib/sessionUser'
import { startOfToday } from '../utils'
import { attachEventCardPreviews } from '../utils/eventCardPreviews'
import { EventWithDetails } from '../types'

const STALE_MS = 60_000 // treat cached events as fresh for 60 seconds

export function useEvents() {
  const [events, setEvents] = useState<EventWithDetails[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const lastFetchedAt = useRef(0)

  const fetchEvents = useCallback(async (force = false) => {
    if (!force && Date.now() - lastFetchedAt.current < STALE_MS) return
    try {
      setLoading(true)
      setError(null)
      const user = await getSessionUser()
      const listSelect = user
        ? `${EVENT_CARD_LIST_SELECT}, ${EVENT_CARD_MY_ATTENDANCE_SELECT}`
        : EVENT_CARD_LIST_SELECT

      let query = supabase
        .from('events')
        .select(listSelect)
        .gte('event_date', startOfToday())
        .order('event_date', { ascending: true })
      if (user) {
        query = query.eq('my_attendance.user_id', user.id)
      }

      const { data, error: qErr } = await query
      if (qErr) throw qErr
      const withPreviews = await attachEventCardPreviews(
        (data ?? []) as unknown as EventWithDetails[],
      )
      setEvents(withPreviews)
      lastFetchedAt.current = Date.now()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchEvents(true) // always fetch on first mount
  }, [fetchEvents])

  return { events, loading, error, refetch: fetchEvents }
}
