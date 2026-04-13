import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { ConversationRow } from '../types'

export function useConversations() {
  const [conversations, setConversations] = useState<ConversationRow[]>([])
  const [loading, setLoading] = useState(true)
  const mountedRef = useRef(true)

  const fetch = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user || !mountedRef.current) return
    const { data } = await supabase.rpc('get_my_conversations')
    if (mountedRef.current) {
      setConversations((data ?? []) as ConversationRow[])
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    mountedRef.current = true
    void fetch()

    // Re-fetch when any message is inserted or conversation_members updated
    const channel = supabase
      .channel('conversations-list')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' },
        () => { void fetch() })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'conversation_members' },
        () => { void fetch() })
      .subscribe()

    return () => {
      mountedRef.current = false
      void supabase.removeChannel(channel)
    }
  }, [fetch])

  const totalUnread = conversations.reduce((sum, c) => sum + (c.unread_count ?? 0), 0)

  return { conversations, loading, refetch: fetch, totalUnread }
}
