import { useCallback, useEffect, useMemo, useState } from 'react'
import { DeviceEventEmitter } from 'react-native'
import { supabase } from '../lib/supabase'
import { CHAT_SILENCES_CHANGED_EVENT } from './useChatUnread'
import type { ChatSilenceWithProfile } from '../types'

const SELECT = `
  silenced_user_id,
  created_at,
  profiles!chat_silences_silenced_user_id_fkey (
    id, username, first_name, last_name, avatar_url
  )
`

export function useSilencedUsers() {
  const [entries, setEntries] = useState<ChatSilenceWithProfile[]>([])
  const [loading, setLoading] = useState(true)

  const silencedUserIds = useMemo(
    () => new Set(entries.map(e => e.silenced_user_id)),
    [entries],
  )

  const refresh = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setEntries([])
      setLoading(false)
      return
    }
    const { data, error } = await supabase
      .from('chat_silences')
      .select(SELECT)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (error) console.error('[useSilencedUsers]', JSON.stringify(error))
    const rows = (data ?? []) as {
      silenced_user_id: string
      created_at: string
      profiles: ChatSilenceWithProfile['profiles'] | NonNullable<ChatSilenceWithProfile['profiles']>[]
    }[]
    setEntries(rows.map(r => ({
      silenced_user_id: r.silenced_user_id,
      created_at: r.created_at,
      profiles: Array.isArray(r.profiles) ? (r.profiles[0] ?? null) : r.profiles,
    })))
    setLoading(false)
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null

    void supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      channel = supabase
        .channel(`chat-silences-${user.id}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'chat_silences', filter: `user_id=eq.${user.id}` },
          () => { void refresh() },
        )
        .subscribe()
    })

    return () => {
      if (channel) void supabase.removeChannel(channel)
    }
  }, [refresh])

  const silenceUser = useCallback(async (silencedUserId: string) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user || user.id === silencedUserId) return
    const { error } = await supabase
      .from('chat_silences')
      .insert({ user_id: user.id, silenced_user_id: silencedUserId })
    if (error) console.error('[silenceUser]', JSON.stringify(error))
    else {
      DeviceEventEmitter.emit(CHAT_SILENCES_CHANGED_EVENT)
      void refresh()
    }
  }, [refresh])

  const unsilenceUser = useCallback(async (silencedUserId: string) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { error } = await supabase
      .from('chat_silences')
      .delete()
      .eq('user_id', user.id)
      .eq('silenced_user_id', silencedUserId)
    if (error) console.error('[unsilenceUser]', JSON.stringify(error))
    else {
      DeviceEventEmitter.emit(CHAT_SILENCES_CHANGED_EVENT)
      void refresh()
    }
  }, [refresh])

  return { entries, silencedUserIds, loading, refresh, silenceUser, unsilenceUser }
}
