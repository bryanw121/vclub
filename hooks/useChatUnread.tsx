import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { DeviceEventEmitter } from 'react-native'
import { supabase } from '../lib/supabase'
import { useSession } from '../contexts/session'
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
/** Startup delay so the badge query doesn't compete with the Events feed's first load. */
const INITIAL_DELAY_MS = 1500

export function ChatUnreadProvider({ children }: { children: React.ReactNode }) {
  const { userId } = useSession()
  const [count, setCount] = useState(0)
  const mountedRef = useRef(true)

  const recompute = useCallback(async () => {
    if (!userId || !mountedRef.current) return

    const [{ data: convData, error: convErr }, { data: silenceData, error: silenceErr }] = await Promise.all([
      supabase.rpc('get_my_conversations'),
      supabase.from('chat_silences').select('silenced_user_id').eq('user_id', userId),
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
  }, [userId])

  useEffect(() => {
    mountedRef.current = true
    // Guests have no conversations; signing out clears the badge.
    if (!userId) {
      setCount(0)
      return
    }
    const initialTimer = setTimeout(() => { void recompute() }, INITIAL_DELAY_MS)

    let recomputeTimer: ReturnType<typeof setTimeout> | null = null
    const scheduleRecompute = () => {
      if (recomputeTimer) clearTimeout(recomputeTimer)
      recomputeTimer = setTimeout(() => {
        recomputeTimer = null
        void recompute()
      }, 450)
    }

    // One channel multiplexes all three change streams (was two channels).
    const channel = supabase
      .channel(`chat-unread-${userId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' },
        () => { scheduleRecompute() })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'conversation_members' },
        () => { scheduleRecompute() })
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'chat_silences', filter: `user_id=eq.${userId}` },
        () => { scheduleRecompute() })
      .subscribe()

    const silencesSub = DeviceEventEmitter.addListener(CHAT_SILENCES_CHANGED_EVENT, () => {
      scheduleRecompute()
    })

    return () => {
      mountedRef.current = false
      clearTimeout(initialTimer)
      silencesSub.remove()
      if (recomputeTimer) clearTimeout(recomputeTimer)
      void supabase.removeChannel(channel)
    }
  }, [userId, recompute])

  return <ChatUnreadContext.Provider value={count}>{children}</ChatUnreadContext.Provider>
}

/** Current tab-bar unread total. Requires a `ChatUnreadProvider` ancestor. */
export function useChatUnread(): number {
  return useContext(ChatUnreadContext)
}
