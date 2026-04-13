import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

/**
 * Lightweight hook that tracks total unread chat message count across all
 * conversations. Used by the tab bar to show an unread badge on the Chat tab.
 */
export function useChatUnread() {
  const [count, setCount] = useState(0)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true

    async function fetchCount() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user || !mountedRef.current) return
      const { data } = await supabase.rpc('get_chat_unread_count')
      if (mountedRef.current) setCount(Number(data ?? 0))
    }

    void fetchCount()

    // Refresh whenever a new message is inserted or a conversation is marked read
    const channel = supabase
      .channel('chat-unread-badge')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' },
        () => { void fetchCount() })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'conversation_members' },
        () => { void fetchCount() })
      .subscribe()

    return () => {
      mountedRef.current = false
      void supabase.removeChannel(channel)
    }
  }, [])

  return count
}
