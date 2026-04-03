import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Notification } from '../types'

const STALE_MS = 45_000

const NOTIFICATION_SELECT =
  'id, user_id, notification_type, title, body, data, read_at, created_at'

export function useNotifications() {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const lastFetchedAt = useRef(0)

  const fetchUnreadCount = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setUnreadCount(0)
      return
    }
    const { count, error: cErr } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .is('read_at', null)
    if (cErr) return
    setUnreadCount(count ?? 0)
  }, [])

  const fetchList = useCallback(async (force = false) => {
    if (!force && Date.now() - lastFetchedAt.current < STALE_MS) return
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setNotifications([])
      setUnreadCount(0)
      setLoading(false)
      return
    }
    try {
      setLoading(true)
      setError(null)
      const { data, error: qErr } = await supabase
        .from('notifications')
        .select(NOTIFICATION_SELECT)
        .order('created_at', { ascending: false })
        .limit(80)
      if (qErr) throw qErr
      setNotifications((data ?? []) as Notification[])
      lastFetchedAt.current = Date.now()
      await fetchUnreadCount()
    } catch (e: any) {
      setError(e.message ?? 'Failed to load notifications')
    } finally {
      setLoading(false)
    }
  }, [fetchUnreadCount])

  useEffect(() => {
    void fetchList(true)
  }, [fetchList])

  const markRead = useCallback(
    async (id: string) => {
      const { error: rpcErr } = await supabase.rpc('mark_notification_read', {
        p_notification_id: id,
      })
      if (rpcErr) throw rpcErr
      const now = new Date().toISOString()
      setNotifications(prev =>
        prev.map(n => (n.id === id ? { ...n, read_at: n.read_at ?? now } : n)),
      )
      await fetchUnreadCount()
    },
    [fetchUnreadCount],
  )

  const markAllRead = useCallback(async () => {
    const { error: rpcErr } = await supabase.rpc('mark_all_notifications_read')
    if (rpcErr) throw rpcErr
    const now = new Date().toISOString()
    setNotifications(prev => prev.map(n => ({ ...n, read_at: n.read_at ?? now })))
    await fetchUnreadCount()
  }, [fetchUnreadCount])

  return {
    notifications,
    unreadCount,
    loading,
    error,
    refetch: fetchList,
    refreshUnread: fetchUnreadCount,
    markRead,
    markAllRead,
  }
}
