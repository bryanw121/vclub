import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { CHAT_IMAGES_BUCKET } from '../constants'
import type { MessageWithDetails } from '../types'

const MESSAGE_SELECT = `
  id, conversation_id, sender_id, content, image_url, reply_to_id, created_at, deleted_at, edited_at,
  profiles!messages_sender_id_fkey (id, username, first_name, last_name, avatar_url, selected_border),
  message_reactions (message_id, user_id, emoji, created_at),
  reply_to:messages!reply_to_id (
    id, content, image_url, deleted_at,
    profiles!messages_sender_id_fkey (id, username, first_name, last_name)
  )
`

const PAGE_SIZE = 40

export function useMessages(conversationId: string) {
  const [messages, setMessages] = useState<MessageWithDetails[]>([])
  const [loading, setLoading] = useState(true)
  const [hasMore, setHasMore] = useState(true)
  const mountedRef = useRef(true)
  const oldestCreatedAt = useRef<string | null>(null)

  const fetchMessages = useCallback(async (before?: string) => {
    let query = supabase
      .from('messages')
      .select(MESSAGE_SELECT)
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE)

    if (before) query = query.lt('created_at', before)

    const { data, error } = await query
    if (error) console.error('[useMessages] fetch error:', JSON.stringify(error))
    if (!mountedRef.current) return

    const rows = (data ?? []) as MessageWithDetails[]
    // rows is DESC (newest first); capture oldest before reversing
    const oldest = rows[rows.length - 1]?.created_at ?? null
    const chronological = rows.slice().reverse()

    if (before) {
      setMessages(prev => [...chronological, ...prev])
      if (oldest) oldestCreatedAt.current = oldest
    } else {
      // Keep any optimistic (_sending) messages at the end
      setMessages(prev => {
        const sending = prev.filter(m => m._sending)
        return [...chronological, ...sending]
      })
      oldestCreatedAt.current = oldest
    }
    setHasMore(rows.length === PAGE_SIZE)
    setLoading(false)
  }, [conversationId])

  const loadMore = useCallback(async () => {
    if (!hasMore || !oldestCreatedAt.current) return
    await fetchMessages(oldestCreatedAt.current)
  }, [fetchMessages, hasMore])

  useEffect(() => {
    mountedRef.current = true
    setLoading(true)
    setMessages([])
    void fetchMessages()

    const channel = supabase
      .channel(`messages-${conversationId}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` },
        async (payload) => {
          const { data, error } = await supabase
            .from('messages')
            .select(MESSAGE_SELECT)
            .eq('id', payload.new.id)
            .single()
          if (!mountedRef.current) return
          if (data) {
            setMessages(prev =>
              prev.some(m => m.id === (data as MessageWithDetails).id)
                ? prev
                : [...prev.filter(m => !m._sending || m.sender_id !== payload.new.sender_id), data as MessageWithDetails]
            )
          } else if (error) {
            // Join failed — fall back to a full reload
            void fetchMessages()
          }
        })
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` },
        (payload) => {
          if (!mountedRef.current) return
          setMessages(prev => prev.map(m =>
            m.id === payload.new.id ? { ...m, ...(payload.new as Partial<MessageWithDetails>) } : m
          ))
        })
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'message_reactions' },
        () => { void fetchMessages() })
      .subscribe()

    return () => {
      mountedRef.current = false
      void supabase.removeChannel(channel)
    }
  }, [conversationId, fetchMessages])

  const sendMessage = useCallback(async (
    content: string | null,
    imageUrl: string | null = null,
    replyToId: string | null = null,
  ) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const tempId = `temp-${Date.now()}`
    const tempMessage: MessageWithDetails = {
      id: tempId,
      conversation_id: conversationId,
      sender_id: user.id,
      content: content || null,
      image_url: imageUrl,
      reply_to_id: replyToId,
      created_at: new Date().toISOString(),
      deleted_at: null,
      profiles: null,
      message_reactions: [],
      reply_to: null,
      _sending: true,
    }

    if (mountedRef.current) {
      setMessages(prev => [...prev, tempMessage])
    }

    const { data, error: sendError } = await supabase
      .from('messages')
      .insert({
        conversation_id: conversationId,
        sender_id: user.id,
        content: content || null,
        image_url: imageUrl,
        reply_to_id: replyToId,
      })
      .select(MESSAGE_SELECT)
      .single()

    if (sendError) console.error('[useMessages] send error:', JSON.stringify(sendError))

    if (mountedRef.current) {
      if (data) {
        // Replace temp message with confirmed message
        setMessages(prev => prev
          .filter(m => m.id !== tempId)
          .concat([data as MessageWithDetails])
          .filter((m, i, arr) => i === arr.findIndex(x => x.id === m.id))
        )
      } else {
        // Remove temp on failure
        setMessages(prev => prev.filter(m => m.id !== tempId))
      }
    }

    void supabase.rpc('mark_conversation_read', { p_conversation_id: conversationId })
  }, [conversationId])

  const deleteMessage = useCallback(async (messageId: string) => {
    await supabase
      .from('messages')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', messageId)
  }, [])

  const editMessage = useCallback(async (messageId: string, newContent: string) => {
    const now = new Date().toISOString()
    setMessages(prev => prev.map(m =>
      m.id === messageId ? { ...m, content: newContent, edited_at: now } : m
    ))
    await supabase
      .from('messages')
      .update({ content: newContent, edited_at: now })
      .eq('id', messageId)
  }, [])

  const toggleReaction = useCallback(async (messageId: string, emoji: string) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const existing = messages
      .find(m => m.id === messageId)
      ?.message_reactions.find(r => r.user_id === user.id && r.emoji === emoji)

    if (existing) {
      await supabase
        .from('message_reactions')
        .delete()
        .eq('message_id', messageId)
        .eq('user_id', user.id)
        .eq('emoji', emoji)
    } else {
      await supabase
        .from('message_reactions')
        .insert({ message_id: messageId, user_id: user.id, emoji })
    }
  }, [messages])

  const uploadImage = useCallback(async (uri: string): Promise<string | null> => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    const response = await fetch(uri)
    const blob = await response.blob()

    // Prefer the blob's MIME type (reliable on web blob/data URLs).
    // Fall back to the file extension for native file:// URIs where blob.type may be empty.
    const mimeType = blob.type || 'image/jpeg'
    const extFromMime = mimeType.split('/')[1]?.toLowerCase().replace('jpeg', 'jpg') ?? 'jpg'
    const VALID_EXTS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic'])
    const uriExt = uri.split('?')[0].split('.').pop()?.toLowerCase()
    const ext = (uriExt && VALID_EXTS.has(uriExt)) ? uriExt : extFromMime
    const contentType = mimeType

    const path = `${user.id}/${Date.now()}.${ext}`

    const { error } = await supabase.storage
      .from(CHAT_IMAGES_BUCKET)
      .upload(path, blob, { contentType })

    if (error) {
      console.error('[uploadImage] storage upload failed:', JSON.stringify(error))
      return null
    }

    const { data: { publicUrl } } = supabase.storage
      .from(CHAT_IMAGES_BUCKET)
      .getPublicUrl(path)

    return publicUrl
  }, [])

  const markRead = useCallback(async () => {
    await supabase.rpc('mark_conversation_read', { p_conversation_id: conversationId })
  }, [conversationId])

  return { messages, loading, hasMore, loadMore, sendMessage, deleteMessage, editMessage, toggleReaction, uploadImage, markRead }
}
