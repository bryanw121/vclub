import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { startOfToday } from '../utils'
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
      const { data, error } = await supabase
        .from('events')
        .select(`*, profiles!events_created_by_fkey (id, username, first_name, last_name, avatar_url), event_attendees(count), event_tags (tag_id, tags (id, name, category, display_order)), clubs (id, name, avatar_url)`)
        .gte('event_date', startOfToday())
        .order('event_date', { ascending: true })
      if (error) throw error
      setEvents(data as EventWithDetails[])
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
