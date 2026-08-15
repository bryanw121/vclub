import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { DeviceEventEmitter } from 'react-native'
import { supabase } from '../lib/supabase'
import { getSessionUser } from '../lib/sessionUser'
import type { ConversationRow } from '../types'

/** Emitted from `useSilencedUsers` after silence/unsilence so the tab badge updates even without Realtime on `chat_silences`. */
export const CHAT_SILENCES_CHANGED_EVENT = 'vclub-chat-silences-changed'

const ChatUnreadContext = createContext(0)

/**
 * Tab-bar unread total from `get_my_conversations`, excluding DMs with people in
 * `chat_silences`. Read via `useChatUnread()`.
 *
 * Lives in a single provider mounted once at the app root so the realtime
 * subscription + RPC polling run exactly once — the sidebar (web) and the mobile
 * tab bar both read the same value. (Previously this hook was instantiated in two
 * layouts at once, opening duplicate channels and double-polling on every insert.)
 */
export function ChatUnreadProvider({ children }: { children: React.ReactNode }) {
  const [count, setCount] = useState(0)
  const mountedRef = useRef(true)

  const recompute = useCallback(async () => {
    const user = await getSessionUser()
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

    let channel: ReturnType<typeof supabase.channel> | null = null
    let recomputeTimer: ReturnType<typeof setTimeout> | null = null
    const scheduleRecompute = () => {
      if (recomputeTimer) clearTimeout(recomputeTimer)
      recomputeTimer = setTimeout(() => {
        recomputeTimer = null
        void recompute()
      }, 450)
    }

    void getSessionUser().then(user => {
      if (!user || !mountedRef.current) return

      // One channel multiplexes all three change streams (was two channels).
      channel = supabase
        .channel(`chat-unread-${user.id}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' },
          () => { scheduleRecompute() })
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'conversation_members' },
          () => { scheduleRecompute() })
        .on('postgres_changes',
          { event: '*', schema: 'public', table: 'chat_silences', filter: `user_id=eq.${user.id}` },
          () => { scheduleRecompute() })
        .subscribe()
    })

    const silencesSub = DeviceEventEmitter.addListener(CHAT_SILENCES_CHANGED_EVENT, () => {
      scheduleRecompute()
    })

    return () => {
      mountedRef.current = false
      silencesSub.remove()
      if (recomputeTimer) clearTimeout(recomputeTimer)
      if (channel) void supabase.removeChannel(channel)
    }
  }, [recompute])

  return <ChatUnreadContext.Provider value={count}>{children}</ChatUnreadContext.Provider>
}

/** Current tab-bar unread total. Requires a `ChatUnreadProvider` ancestor. */
export function useChatUnread(): number {
  return useContext(ChatUnreadContext)
}
