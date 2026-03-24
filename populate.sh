cat > "hooks/useAuth.ts" << 'EOF'
import { useEffect, useState } from 'react'
import { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })

    return () => subscription.unsubscribe()
  }, [])

  return { session, loading }
}
EOF

cat > "hooks/useEvents.ts" << 'EOF'
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { EventWithDetails } from '../types'

export function useEvents() {
  const [events, setEvents] = useState<EventWithDetails[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchEvents()
  }, [])

  async function fetchEvents() {
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('events')
        .select(`
          *,
          profiles (id, username, avatar_url),
          event_attendees (event_id, user_id, joined_at)
        `)
        .gte('event_date', new Date().toISOString())
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
EOF

echo "✅ hooks populated!"