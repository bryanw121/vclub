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
      const sorted = ((data ?? []) as ConversationRow[]).sort((a, b) => {
        const ta = a.last_message_at ? new Date(a.last_message_at).getTime() : 0
        const tb = b.last_message_at ? new Date(b.last_message_at).getTime() : 0
        return tb - ta
      })
      setConversations(sorted)
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
        (payload) => {
          // Optimistically update the matching conversation before the refetch returns
          const msg = payload.new as {
            conversation_id: string
            sender_id: string
            content: string | null
            image_url: string | null
            created_at: string
          }
          setConversations(prev => {
            const updated = prev.map(c =>
              c.conversation_id !== msg.conversation_id ? c : {
                ...c,
                last_message_at: msg.created_at,
                last_message_content: msg.content,
                last_message_image_url: msg.image_url,
                last_sender_id: msg.sender_id,
                last_message_deleted_at: null,
              }
            )
            return updated.sort((a, b) => {
              const ta = a.last_message_at ? new Date(a.last_message_at).getTime() : 0
              const tb = b.last_message_at ? new Date(b.last_message_at).getTime() : 0
              return tb - ta
            })
          })
          void fetch()
        })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'conversation_members' },
        () => { void fetch() })
      .subscribe()

    return () => {
      mountedRef.current = false
      void supabase.removeChannel(channel)
    }
  }, [fetch])

  const totalUnread = conversations.reduce((sum, c) => sum + (c.unread_count ?? 0), 0)

  /** Immediately zero out the unread badge for a conversation (call when user opens it). */
  const clearUnread = useCallback((conversationId: string) => {
    setConversations(prev => prev.map(c =>
      c.conversation_id === conversationId ? { ...c, unread_count: 0 } : c
    ))
  }, [])

  return { conversations, loading, refetch: fetch, totalUnread, clearUnread }
}
