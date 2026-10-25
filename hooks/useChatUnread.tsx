import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { useSession } from '../contexts/session'
import { unreadTotal } from '../utils/chatUtils'
import { useConversationsQuery } from './useConversations'
import { useSilencedUserIds } from './useSilencedUsers'

const ChatUnreadContext = createContext(0)

/** Startup delay so the badge query doesn't compete with the Events feed's first load. */
const INITIAL_DELAY_MS = 1500

/**
 * Tab-bar unread total, excluding DMs with people the user silenced. Read via
 * `useChatUnread()`. Mounted once at the app root; the sidebar (web) and the
 * mobile tab bar both read it.
 *
 * It derives from the shared conversations and silences queries (the same
 * cache entries the Chat list reads), so it never issues its own copy of
 * `get_my_conversations`, and realtime payloads update list and badge together.
 * Its own reads switch on (`enabled`) 1.5s after sign-in; until then it shows
 * whatever the cache already holds (e.g. the Chat tab opened first).
 */
export function ChatUnreadProvider({ children }: { children: React.ReactNode }) {
  const { userId } = useSession()
  const [delayPassed, setDelayPassed] = useState(false)

  useEffect(() => {
    setDelayPassed(false)
    if (!userId) return
    const t = setTimeout(() => setDelayPassed(true), INITIAL_DELAY_MS)
    return () => clearTimeout(t)
  }, [userId])

  const enabled = !!userId && delayPassed
  const { data: conversations } = useConversationsQuery(enabled)
  const { silencedUserIds } = useSilencedUserIds(enabled)

  // Guests have no conversations; signing out switches the keys to null → 0.
  const count = useMemo(
    () => (userId && conversations ? unreadTotal(conversations, silencedUserIds) : 0),
    [userId, conversations, silencedUserIds],
  )

  return <ChatUnreadContext.Provider value={count}>{children}</ChatUnreadContext.Provider>
}

/** Current tab-bar unread total. Requires a `ChatUnreadProvider` ancestor. */
export function useChatUnread(): number {
  return useContext(ChatUnreadContext)
}
