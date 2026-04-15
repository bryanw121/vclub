import { useCallback, useEffect, useRef, useState } from 'react'
import { DeviceEventEmitter } from 'react-native'
import { supabase } from '../lib/supabase'
import type { ConversationRow } from '../types'

/** Emitted from `useSilencedUsers` after silence/unsilence so the tab badge updates even without Realtime on `chat_silences`. */
export const CHAT_SILENCES_CHANGED_EVENT = 'vclub-chat-silences-changed'

/**
 * Tab-bar unread total from `get_my_conversations`, excluding DMs with people in `chat_silences`.
 * Subscribes to messages, conversation_members, and chat_silences so the badge updates when you silence/unsilence.
 */
export function useChatUnread() {
  const [count, setCount] = useState(0)
  const mountedRef = useRef(true)

  const recompute = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user || !mountedRef.current) return

    const [{ data: convData, error: convErr }, { data: silenceData, error: silenceErr }] = await Promise.all([
      supabase.rpc('get_my_conversations'),
      supabase.from('chat_silences').select('silenced_user_id').eq('user_id', user.id),
    ])

    if (convErr) console.error('[useChatUnread] get_my_conversations', JSON.stringify(convErr))
    if (silenceErr) console.error('[useChatUnread] chat_silences', JSON.stringify(silenceErr))

    const silenced = new Set((silenceData ?? []).map((r: { silenced_user_id: string }) => r.silenced_user_id))
    const rows = (convData ?? []) as ConversationRow[]
    let total = 0
    for (const r of rows) {
      if (r.type === 'dm' && r.other_user_id && silenced.has(r.other_user_id)) continue
      total += Number(r.unread_count ?? 0)
    }
    if (mountedRef.current) setCount(total)
  }, [])

  useEffect(() => {
    mountedRef.current = true
    void recompute()

    let msgChannel: ReturnType<typeof supabase.channel> | null = null
    let silenceChannel: ReturnType<typeof supabase.channel> | null = null

    void supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user || !mountedRef.current) return

      msgChannel = supabase
        .channel('chat-unread-badge')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' },
          () => { void recompute() })
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'conversation_members' },
          () => { void recompute() })
        .subscribe()

      silenceChannel = supabase
        .channel(`chat-unread-silences-${user.id}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'chat_silences', filter: `user_id=eq.${user.id}` },
          () => { void recompute() },
        )
        .subscribe()
    })

    const silencesSub = DeviceEventEmitter.addListener(CHAT_SILENCES_CHANGED_EVENT, () => {
      void recompute()
    })

    return () => {
      mountedRef.current = false
      silencesSub.remove()
      if (msgChannel) void supabase.removeChannel(msgChannel)
      if (silenceChannel) void supabase.removeChannel(silenceChannel)
    }
  }, [recompute])

  return count
}
