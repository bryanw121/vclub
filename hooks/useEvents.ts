import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { startOfToday } from '../utils'
import { EventWithDetails } from '../types'

export function useEvents() {
  const [events, setEvents] = useState<EventWithDetails[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { fetchEvents() }, [])

  async function fetchEvents() {
    try {
      setLoading(true)
      setError(null)
      const { data, error } = await supabase
        .from('events')
        .select(`*, profiles!events_created_by_fkey (id, username, first_name, last_name, avatar_url), event_attendees (event_id, user_id, joined_at), event_tags (tag_id, tags (id, name, category, display_order))`)
        .gte('event_date', startOfToday())
        .order('event_date', { ascending: true })
      if (error) throw error
      setEvents(data as EventWithDetails[])
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return { events, loading, error, refetch: fetchEvents }
}
