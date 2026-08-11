import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { ConversationRow } from '../types'

const REFETCH_DEBOUNCE_MS = 450

/** Pass `enabled: false` while the Chat tab is mounted but inactive (neighbor prefetch). */
export function useConversations(enabled = true) {
  const [conversations, setConversations] = useState<ConversationRow[]>([])
  const [loading, setLoading] = useState(true)
  const mountedRef = useRef(true)
  const refetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fetch = useCallback(async () => {
    if (!enabled) return
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
  }, [enabled])

  const scheduleFetch = useCallback(() => {
    if (!enabled) return
    if (refetchTimer.current) clearTimeout(refetchTimer.current)
    refetchTimer.current = setTimeout(() => {
      refetchTimer.current = null
      void fetch()
    }, REFETCH_DEBOUNCE_MS)
  }, [enabled, fetch])

  useEffect(() => {
    mountedRef.current = true
    if (!enabled) {
      setLoading(false)
      return () => { mountedRef.current = false }
    }

    void fetch()

    const channel = supabase
      .channel('conversations-list')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => {
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
          scheduleFetch()
        })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'conversation_members' },
        () => { scheduleFetch() })
      .subscribe()

    return () => {
      mountedRef.current = false
      if (refetchTimer.current) clearTimeout(refetchTimer.current)
      void supabase.removeChannel(channel)
    }
  }, [enabled, fetch, scheduleFetch])

  const totalUnread = conversations.reduce((sum, c) => sum + (c.unread_count ?? 0), 0)

  const clearUnread = useCallback((conversationId: string) => {
    setConversations(prev => prev.map(c =>
      c.conversation_id === conversationId ? { ...c, unread_count: 0 } : c
    ))
  }, [])

  return { conversations, loading, refetch: fetch, totalUnread, clearUnread }
}
