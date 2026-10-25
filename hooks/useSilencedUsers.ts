import { useCallback, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { getQueryData, queryKey, setQueryData, useMutation, useQuery } from '../lib/query'
import { useRealtimeChannel } from '../lib/realtime'
import { STALE } from '../constants/cache'
import { useSession } from '../contexts/session'
import { chatAlert, chatTopics, silencesBindings } from '../utils/chatUtils'
import { scheduleInvalidate } from './useConversations'
import type { ChatSilenceWithProfile } from '../types'

const SELECT = `
  silenced_user_id,
  created_at,
  profiles!chat_silences_silenced_user_id_fkey (
    id, username, first_name, last_name, avatar_url
  )
`

/** One query per user, shared by the Chat list, rooms, profiles, Settings → Silenced and the tab badge. */
export function silencesKey(userId: string): string {
  return queryKey('chatSilences', userId)
}

async function fetchSilences(userId: string): Promise<ChatSilenceWithProfile[]> {
  const { data, error } = await supabase
    .from('chat_silences')
    .select(SELECT)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  if (error) throw error
  const rows = (data ?? []) as {
    silenced_user_id: string
    created_at: string
    profiles: ChatSilenceWithProfile['profiles'] | NonNullable<ChatSilenceWithProfile['profiles']>[]
  }[]
  return rows.map(r => ({
    silenced_user_id: r.silenced_user_id,
    created_at: r.created_at,
    profiles: Array.isArray(r.profiles) ? (r.profiles[0] ?? null) : r.profiles,
  }))
}

const EMPTY: ChatSilenceWithProfile[] = []

/**
 * Silences query + realtime on `silences:<userId>`. Every caller passes the
 * same bindings, so any number of mounted screens (chat list, room, a profile)
 * share one channel; a change refetches once (debounced), not once per screen.
 */
export function useSilencedUserIds(enabled = true) {
  const { userId } = useSession()
  const key = userId ? silencesKey(userId) : null
  const query = useQuery(key, () => fetchSilences(userId!), { staleMs: STALE.profile, enabled: enabled && !!userId })

  const onChange = useCallback(() => {
    if (key) scheduleInvalidate(key)
  }, [key])
  useRealtimeChannel(
    userId ? chatTopics.silences(userId) : null,
    userId ? silencesBindings(userId, { onChange }) : [],
    { enabled: enabled && !!userId, onReconnect: onChange },
  )

  const entries = query.data ?? EMPTY
  const silencedUserIds = useMemo(() => new Set(entries.map(e => e.silenced_user_id)), [entries])
  return { key, userId, entries, silencedUserIds, query }
}

export function useSilencedUsers() {
  const { key, userId, entries, silencedUserIds, query } = useSilencedUserIds()

  const silence = useMutation(
    async (silencedUserId: string) => {
      if (!userId) throw new Error('Sign in to continue.')
      const { error } = await supabase
        .from('chat_silences')
        .insert({ user_id: userId, silenced_user_id: silencedUserId })
      if (error) throw error
    },
    {
      onMutate: silencedUserId => {
        if (!key) return
        const prev = getQueryData<ChatSilenceWithProfile[]>(key) ?? []
        if (prev.some(e => e.silenced_user_id === silencedUserId)) return
        setQueryData<ChatSilenceWithProfile[]>(key, [
          { silenced_user_id: silencedUserId, created_at: new Date().toISOString(), profiles: null },
          ...prev,
        ])
        return () => setQueryData(key, prev)
      },
      onError: () => chatAlert("Couldn't silence", 'Check your connection and try again.'),
      invalidates: key ? [key] : [],
    },
  )

  const unsilence = useMutation(
    async (silencedUserId: string) => {
      if (!userId) throw new Error('Sign in to continue.')
      const { error } = await supabase
        .from('chat_silences')
        .delete()
        .eq('user_id', userId)
        .eq('silenced_user_id', silencedUserId)
      if (error) throw error
    },
    {
      onMutate: silencedUserId => {
        if (!key) return
        const prev = getQueryData<ChatSilenceWithProfile[]>(key) ?? []
        setQueryData<ChatSilenceWithProfile[]>(key, prev.filter(e => e.silenced_user_id !== silencedUserId))
        return () => setQueryData(key, prev)
      },
      onError: () => chatAlert("Couldn't unsilence", 'Check your connection and try again.'),
      invalidates: key ? [key] : [],
    },
  )

  const silenceMutate = silence.mutate
  const unsilenceMutate = unsilence.mutate
  const refetch = query.refetch

  const silenceUser = useCallback(async (silencedUserId: string) => {
    if (!userId || userId === silencedUserId) return
    await silenceMutate(silencedUserId)
  }, [userId, silenceMutate])

  const unsilenceUser = useCallback(async (silencedUserId: string) => {
    if (!userId) return
    await unsilenceMutate(silencedUserId)
  }, [userId, unsilenceMutate])

  const refresh = useCallback(async () => {
    await refetch({ force: true })
  }, [refetch])

  return {
    entries,
    silencedUserIds,
    loading: !!userId && query.isLoading,
    refresh,
    silenceUser,
    unsilenceUser,
  }
}
