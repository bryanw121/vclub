import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  View, Text, FlatList, ScrollView, TextInput, TouchableOpacity,
  KeyboardAvoidingView, Platform, ActivityIndicator,
  Image, Pressable, Modal, Alert, RefreshControl,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useLocalSearchParams, useRouter, Stack } from 'expo-router'

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? ''
function resolveAvatarUri(ref: string | null | undefined): string | null {
  if (!ref) return null
  if (/^https?:\/\//i.test(ref)) return ref
  return `${SUPABASE_URL}/storage/v1/render/image/public/avatars/${ref}?width=80&height=80&quality=70&resize=cover`
}
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import * as ImagePicker from 'expo-image-picker'
import { supabase } from '../../../lib/supabase'
import { theme, shared } from '../../../constants'
import {
  DM_BAD_WORD_PROMPT_COOLDOWN_MS,
  dmMessageContainsBadWord,
  loadDmBadWordPromptAt,
  saveDmBadWordPromptAt,
} from '../../../constants/dmBadWords'
import { useAuth } from '../../../hooks/useAuth'
import { useMessages } from '../../../hooks/useMessages'
import { useSilencedUsers } from '../../../hooks/useSilencedUsers'
import { AnchorOptionsMenu, type AnchorRect } from '../../../components/AnchorOptionsMenu'
import { MessageBubble } from '../../../components/MessageBubble'
import { ReactionPicker } from '../../../components/ReactionPicker'
import type { ConversationRow, MessageWithDetails, MentionUser } from '../../../types'

const AVATAR_SIZE = 36

function displayName(p: { first_name: string | null; last_name: string | null; username: string } | null) {
  if (!p) return ''
  return [p.first_name, p.last_name].filter(Boolean).join(' ') || p.username
}

export default function ChatRoomScreen() {
  const isWeb = Platform.OS === 'web'
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const flatListRef = useRef<FlatList>(null)
  const webScrollRef = useRef<ScrollView>(null)
  const inputRef = useRef<import('react-native').TextInput>(null)


  const { session } = useAuth()
  const myId = session?.user?.id ?? null
  const [convRow, setConvRow] = useState<ConversationRow | null>(null)
  const [text, setText] = useState('')
  const [imageUri, setImageUri] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [uploadingImage, setUploadingImage] = useState(false)
  const [replyTo, setReplyTo] = useState<MessageWithDetails | null>(null)
  const [editingMessage, setEditingMessage] = useState<MessageWithDetails | null>(null)

  // @mention state (club chats only — DMs don't use mentions)
  const [mentionableUsers, setMentionableUsers] = useState<MentionUser[]>([])
  const [activeMention, setActiveMention] = useState<{ query: string; atIndex: number } | null>(null)
  const cursorPosRef = useRef(0)

  // Reaction picker state
  const [pickerVisible, setPickerVisible] = useState(false)
  const [pickerMessage, setPickerMessage] = useState<MessageWithDetails | null>(null)
  const [pickerPos, setPickerPos] = useState({ x: 0, y: 0 })
  const focusInputAfterPickerRef = useRef(false)

  // Full-screen image viewer
  const [viewingImage, setViewingImage] = useState<string | null>(null)

  const headerKebabRef = useRef<View>(null)
  const [headerMenuVisible, setHeaderMenuVisible] = useState(false)
  const [headerMenuAnchor, setHeaderMenuAnchor] = useState<AnchorRect | null>(null)
  const [unsportsmanlikeModalVisible, setUnsportsmanlikeModalVisible] = useState(false)
  const badWordPromptedMessageIdsRef = useRef<Set<string>>(new Set())
  const lastBadWordPromptAtRef = useRef(0)
  const [badWordPromptCooldownReady, setBadWordPromptCooldownReady] = useState(false)

  const {
    messages, loading, hasMore, loadMore, refresh,
    sendMessage, deleteMessage, editMessage, toggleReaction, uploadImage, markRead,
  } = useMessages(id)
  const [listRefreshing, setListRefreshing] = useState(false)
  const { silencedUserIds, silenceUser } = useSilencedUsers()

  // Load club members for @mention autocomplete (club chats only)
  useEffect(() => {
    if (!convRow || convRow.type !== 'club' || !convRow.club_id) return
    async function loadMembers() {
      const { data } = await supabase
        .from('club_members')
        .select('profiles!club_members_user_id_fkey(id, username, first_name, last_name)')
        .eq('club_id', convRow!.club_id!)
        .neq('user_id', myId ?? '')
      const users: MentionUser[] = (data ?? []).flatMap((row: any) => {
        const p = row.profiles
        if (!p) return []
        const displayName = [p.first_name, p.last_name].filter(Boolean).join(' ') || p.username
        return [{ id: p.id, username: p.username, displayName }]
      })
      setMentionableUsers(users)
    }
    void loadMembers()
  }, [convRow?.club_id, myId])

  // Load conversation metadata for the header
  useEffect(() => {
    async function loadConv() {
      const { data } = await supabase.rpc('get_my_conversations')
      const rows = (data ?? []) as ConversationRow[]
      setConvRow(rows.find(r => r.conversation_id === id) ?? null)
    }
    void loadConv()
  }, [id])

  useEffect(() => {
    setHeaderMenuVisible(false)
    setHeaderMenuAnchor(null)
  }, [id])

  useEffect(() => {
    badWordPromptedMessageIdsRef.current = new Set()
    lastBadWordPromptAtRef.current = 0
    setUnsportsmanlikeModalVisible(false)
    setBadWordPromptCooldownReady(false)
    void loadDmBadWordPromptAt(id).then(ts => {
      lastBadWordPromptAtRef.current = ts
      setBadWordPromptCooldownReady(true)
    })
  }, [id])

  const handleChatRoomRefresh = useCallback(async () => {
    setListRefreshing(true)
    try {
      await refresh()
      const { data } = await supabase.rpc('get_my_conversations')
      const rows = (data ?? []) as ConversationRow[]
      setConvRow(rows.find(r => r.conversation_id === id) ?? null)
    } finally {
      setListRefreshing(false)
    }
  }, [id, refresh])

  // Silenced DMs are hidden from the list; kick out if opened via deep link or stale route.
  useEffect(() => {
    if (!convRow || convRow.type !== 'dm' || !convRow.other_user_id) return
    if (!silencedUserIds.has(convRow.other_user_id)) return
    router.replace('/(app)/(tabs)/chat' as any)
  }, [convRow, silencedUserIds, router])

  // Focus input after reaction picker fully closes
  useEffect(() => {
    if (!pickerVisible && focusInputAfterPickerRef.current) {
      focusInputAfterPickerRef.current = false
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [pickerVisible])

  // Mark read when screen opens and whenever new messages arrive
  useEffect(() => {
    if (messages.length > 0) void markRead()
  }, [messages.length, markRead])

  const headerTitle = convRow
    ? (convRow.type === 'club'
        ? (convRow.club_name ?? 'Club Chat')
        : displayName({
            first_name: convRow.other_user_first_name,
            last_name: convRow.other_user_last_name,
            username: convRow.other_user_username ?? '',
          }))
    : '…'

  const headerAvatar = resolveAvatarUri(
    convRow?.type === 'dm' ? convRow.other_user_avatar_url : convRow?.club_avatar_url
  )

  const isClub = convRow?.type === 'club'

  function detectMention(t: string, cursor: number) {
    if (mentionableUsers.length === 0) { setActiveMention(null); return }
    const before = t.slice(0, cursor)
    const match = before.match(/(^|\s)@(\w*)$/)
    if (match) setActiveMention({ query: match[2], atIndex: before.lastIndexOf('@') })
    else setActiveMention(null)
  }

  function handleTextChange(t: string) {
    setText(t)
    detectMention(t, cursorPosRef.current)
  }

  function handleSelectionChange(e: any) {
    const pos: number = e.nativeEvent.selection.start
    cursorPosRef.current = pos
    detectMention(text, pos)
  }

  function selectMention(user: MentionUser) {
    if (!activeMention) return
    const before = text.slice(0, activeMention.atIndex)
    const after = text.slice(cursorPosRef.current)
    const newText = `${before}@${user.username} ${after}`
    setText(newText)
    cursorPosRef.current = activeMention.atIndex + user.username.length + 2
    setActiveMention(null)
  }

  const mentionSuggestions = useMemo(() => {
    if (!activeMention || mentionableUsers.length === 0) return []
    const q = activeMention.query.toLowerCase()
    return mentionableUsers
      .filter(u => !q || u.displayName.toLowerCase().includes(q) || u.username.toLowerCase().includes(q))
      .slice(0, 6)
  }, [activeMention, mentionableUsers])

  async function handleSend() {
    const trimmed = text.trim()
    if (editingMessage) {
      if (!trimmed) return
      const editing = editingMessage
      setText('')
      inputRef.current?.clear()
      setEditingMessage(null)
      await editMessage(editing.id, trimmed)
      return
    }
    if (!trimmed && !imageUri) return
    const mentionIds = mentionableUsers.length > 0
      ? [...new Set(
          [...trimmed.matchAll(/@(\w+)/g)]
            .map(m => mentionableUsers.find(u => u.username === m[1])?.id)
            .filter((mid): mid is string => Boolean(mid)),
        )]
      : []
    setText('')
    inputRef.current?.clear()
    setImageUri(null)
    setReplyTo(null)
    setActiveMention(null)
    setSending(true)
    try {
      let uploadedUrl: string | null = null
      if (imageUri) {
        setUploadingImage(true)
        uploadedUrl = await uploadImage(imageUri)
        setUploadingImage(false)
      }
      await sendMessage(trimmed || null, uploadedUrl, replyTo, mentionIds)
    } finally {
      setSending(false)
    }
  }

  async function handlePickImage() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      allowsEditing: false,
    })
    if (!result.canceled && result.assets[0]) {
      setImageUri(result.assets[0].uri)
    }
  }

  function handleLongPress(message: MessageWithDetails, position: { x: number; y: number }) {
    setPickerMessage(message)
    setPickerPos(position)
    setPickerVisible(true)
  }

  const confirmSilenceUser = useCallback((senderId: string) => {
    Alert.alert(
      'Silence this user?',
      'Their chat messages will be hidden. Events and club activity stay the same. Undo anytime under Profile → Silenced people.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Silence', style: 'destructive', onPress: () => { void silenceUser(senderId) } },
      ],
    )
  }, [silenceUser])

  const submitStubDmReport = useCallback(() => {
    if (!convRow || convRow.type !== 'dm') return
    const name = displayName({
      first_name: convRow.other_user_first_name,
      last_name: convRow.other_user_last_name,
      username: convRow.other_user_username ?? 'player',
    })
    Alert.alert('Report submitted', `${name} has been reported to the Vclub team.`)
  }, [convRow])

  const confirmReportDmUser = useCallback(() => {
    if (!convRow || convRow.type !== 'dm') return
    const name = displayName({
      first_name: convRow.other_user_first_name,
      last_name: convRow.other_user_last_name,
      username: convRow.other_user_username ?? 'player',
    })

    Alert.alert(
      'Report this player?',
      `Send a moderation report about ${name} to the Vclub team?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Report',
          style: 'destructive',
          onPress: submitStubDmReport,
        },
      ],
    )
  }, [convRow, submitStubDmReport])

  const dmHeaderMenuOptions = useMemo(() => {
    if (!convRow || convRow.type !== 'dm' || !convRow.other_user_id || !myId || convRow.other_user_id === myId) return []
    const oid = convRow.other_user_id
    return [
      { key: 'profile', label: 'View profile', onPress: () => router.push(`/profile/${oid}` as any) },
      { key: 'report', label: 'Report player', destructive: true, onPress: confirmReportDmUser },
      { key: 'silence', label: 'Silence user', destructive: true, onPress: () => confirmSilenceUser(oid) },
    ]
  }, [convRow, myId, router, confirmSilenceUser, confirmReportDmUser])

  // Incoming DM text contained a bad word — prompt at most once per cooldown; still dedupe per message id.
  useEffect(() => {
    if (!badWordPromptCooldownReady || loading || !myId || convRow?.type !== 'dm') return
    if (unsportsmanlikeModalVisible) return

    const now = Date.now()
    for (const m of messages) {
      if (m._sending) continue
      if (m.sender_id === myId) continue
      if (m.deleted_at) continue
      if (!dmMessageContainsBadWord(m.content)) continue
      if (badWordPromptedMessageIdsRef.current.has(m.id)) continue
      badWordPromptedMessageIdsRef.current.add(m.id)
      if (now - lastBadWordPromptAtRef.current < DM_BAD_WORD_PROMPT_COOLDOWN_MS) continue
      lastBadWordPromptAtRef.current = now
      void saveDmBadWordPromptAt(id, now)
      setUnsportsmanlikeModalVisible(true)
      return
    }
  }, [messages, loading, myId, convRow?.type, unsportsmanlikeModalVisible, badWordPromptCooldownReady, id])

  function openHeaderOptionsMenu() {
    headerKebabRef.current?.measureInWindow((x, y, w, h) => {
      setHeaderMenuAnchor({ x, y, width: w, height: h })
      setHeaderMenuVisible(true)
    })
  }

  // Native FlatList renderer (inverted, descending order)
  const renderMessage = useCallback(({ item, index }: { item: MessageWithDetails; index: number }) => {
    const isOwn = item.sender_id === myId
    // With inverted list, data is newest-first; index+1 is the older (visually above) message
    const prevItem = index < messages.length - 1 ? messages[index + 1] : null
    const showAvatar = !isOwn && (prevItem?.sender_id !== item.sender_id || !prevItem)
    const senderSilenced = !isOwn && silencedUserIds.has(item.sender_id)
    const replySilenced = !!(item.reply_to?.profiles?.id && silencedUserIds.has(item.reply_to.profiles.id))
    return (
      <MessageBubble
        message={item}
        isOwn={isOwn}
        showAvatar={isClub || false}
        contentSuppressed={senderSilenced}
        replyContentSuppressed={replySilenced}
        onViewPeerProfilePress={isClub ? (uid => router.push(`/profile/${uid}` as any)) : undefined}
        onSilencePeerPress={isClub ? confirmSilenceUser : undefined}
        onLongPress={handleLongPress}
        onReplyPress={msg => setReplyTo(msg)}
        onImagePress={setViewingImage}
      />
    )
  }, [myId, messages, isClub, silencedUserIds, router, confirmSilenceUser])

  // Web messages in ascending order (oldest → newest top → bottom)
  const ascendingMessages = useMemo(() => [...messages].reverse(), [messages])

  // On web we use a plain ScrollView (not FlatList) so all items are in the DOM.
  // useLayoutEffect fires before paint, so scrollToEnd positions us at the bottom
  // before the user ever sees the list.
  useLayoutEffect(() => {
    if (!isWeb || loading || messages.length === 0) return
    webScrollRef.current?.scrollToEnd({ animated: false })
  }, [isWeb, loading, messages.length])

  const canSend = editingMessage
    ? text.trim().length > 0
    : (text.trim().length > 0 || !!imageUri) && !sending

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Header */}
      <View style={{
        flexDirection: 'row', alignItems: 'center',
        paddingTop: insets.top + 8,
        paddingBottom: theme.spacing.md,
        paddingHorizontal: theme.spacing.md,
        borderBottomWidth: 1, borderBottomColor: theme.colors.border,
        backgroundColor: theme.colors.background,
        gap: theme.spacing.sm,
      }}>
        <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/(app)/(tabs)/chat' as any)} style={{ padding: 4 }} hitSlop={8}>
          <Ionicons name="chevron-back" size={24} color={theme.colors.primary} />
        </TouchableOpacity>

        {/* Avatar */}
        <View style={{
          width: AVATAR_SIZE, height: AVATAR_SIZE,
          borderRadius: isClub ? 10 : AVATAR_SIZE / 2,
          backgroundColor: theme.colors.border,
          alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
        }}>
          {headerAvatar ? (
            <Image source={{ uri: headerAvatar }} style={{ width: AVATAR_SIZE, height: AVATAR_SIZE }} />
          ) : (
            <Ionicons name={isClub ? 'people' : 'person'} size={18} color={theme.colors.subtext} />
          )}
        </View>

        <Text style={{ flex: 1, fontFamily: theme.fonts.display, fontSize: theme.font.size.lg, letterSpacing: -0.3, color: theme.colors.text }} numberOfLines={1}>
          {headerTitle}
        </Text>

        {dmHeaderMenuOptions.length > 0 ? (
          <View ref={headerKebabRef} collapsable={false}>
            <TouchableOpacity
              onPress={openHeaderOptionsMenu}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityRole="button"
              accessibilityLabel="Conversation options"
            >
              <Ionicons name="ellipsis-vertical" size={22} color={theme.colors.text} />
            </TouchableOpacity>
          </View>
        ) : null}
      </View>

      {/* Messages */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : Platform.OS === 'android' ? 'height' : undefined}
        keyboardVerticalOffset={0}
      >
        {loading ? (
          <View style={shared.centered}>
            <ActivityIndicator color={theme.colors.primary} />
          </View>
        ) : isWeb ? (
          // Web: plain ScrollView — all items in DOM so useLayoutEffect scrollToEnd works before paint
          <ScrollView
            ref={webScrollRef}
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingVertical: theme.spacing.md }}
            onScroll={e => {
              if (e.nativeEvent.contentOffset.y <= 80 && hasMore) void loadMore()
            }}
            scrollEventThrottle={100}
            refreshControl={
              <RefreshControl
                refreshing={listRefreshing}
                onRefresh={() => void handleChatRoomRefresh()}
                tintColor={theme.colors.primary}
              />
            }
          >
            {hasMore && (
              <View style={{ alignItems: 'center', paddingVertical: 8 }}>
                <ActivityIndicator size="small" color={theme.colors.subtext} />
              </View>
            )}
            {ascendingMessages.map((item, index) => {
              const isOwn = item.sender_id === myId
              const prevItem = index > 0 ? ascendingMessages[index - 1] : null
              const showAvatar = !isOwn && (prevItem?.sender_id !== item.sender_id || !prevItem)
              const senderSilenced = !isOwn && silencedUserIds.has(item.sender_id)
              const replySilenced = !!(item.reply_to?.profiles?.id && silencedUserIds.has(item.reply_to.profiles.id))
              return (
                <MessageBubble
                  key={item.id}
                  message={item}
                  isOwn={isOwn}
                  showAvatar={isClub || false}
                  contentSuppressed={senderSilenced}
                  replyContentSuppressed={replySilenced}
                  onViewPeerProfilePress={isClub ? (uid => router.push(`/profile/${uid}` as any)) : undefined}
                  onSilencePeerPress={isClub ? confirmSilenceUser : undefined}
                  onLongPress={handleLongPress}
                  onReplyPress={msg => setReplyTo(msg)}
                  onImagePress={setViewingImage}
                />
              )
            })}
          </ScrollView>
        ) : (
          // Native: inverted FlatList with newest-first data
          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={m => m.id}
            renderItem={renderMessage}
            inverted
            contentContainerStyle={{ paddingVertical: theme.spacing.md }}
            refreshControl={
              <RefreshControl
                refreshing={listRefreshing}
                onRefresh={() => void handleChatRoomRefresh()}
                tintColor={theme.colors.primary}
              />
            }
            onEndReached={hasMore ? loadMore : undefined}
            onEndReachedThreshold={0.2}
            ListFooterComponent={hasMore ? (
              <View style={{ alignItems: 'center', paddingVertical: 8 }}>
                <ActivityIndicator size="small" color={theme.colors.subtext} />
              </View>
            ) : null}
          />
        )}

        {/* Reply banner */}
        {replyTo && (
          <View style={{
            flexDirection: 'row', alignItems: 'center',
            backgroundColor: theme.colors.card,
            borderTopWidth: 1, borderTopColor: theme.colors.border,
            paddingHorizontal: theme.spacing.md, paddingVertical: 8,
            gap: theme.spacing.sm,
          }}>
            <Ionicons name="return-down-back" size={16} color={theme.colors.primary} />
            <View style={{ flex: 1, borderLeftWidth: 2, borderLeftColor: theme.colors.primary, paddingLeft: 8 }}>
              <Text style={{ fontSize: theme.font.size.xs, color: theme.colors.primary, fontWeight: theme.font.weight.semibold }}>
                Replying to {replyTo.profiles ? displayName(replyTo.profiles) : 'message'}
              </Text>
              <Text style={{ fontSize: theme.font.size.xs, color: theme.colors.subtext }} numberOfLines={1}>
                {replyTo.profiles?.id && myId && replyTo.profiles.id !== myId && silencedUserIds.has(replyTo.profiles.id)
                  ? 'Hidden'
                  : (replyTo.content ?? (replyTo.image_url ? '📷 Image' : ''))}
              </Text>
            </View>
            <TouchableOpacity onPress={() => setReplyTo(null)} hitSlop={8}>
              <Ionicons name="close" size={18} color={theme.colors.subtext} />
            </TouchableOpacity>
          </View>
        )}

        {/* Edit banner */}
        {editingMessage && (
          <View style={{
            flexDirection: 'row', alignItems: 'center',
            backgroundColor: theme.colors.card,
            borderTopWidth: 1, borderTopColor: theme.colors.border,
            paddingHorizontal: theme.spacing.md, paddingVertical: 8,
            gap: theme.spacing.sm,
          }}>
            <Ionicons name="pencil-outline" size={16} color={theme.colors.primary} />
            <View style={{ flex: 1, borderLeftWidth: 2, borderLeftColor: theme.colors.primary, paddingLeft: 8 }}>
              <Text style={{ fontSize: theme.font.size.xs, color: theme.colors.primary, fontWeight: theme.font.weight.semibold }}>
                Editing message
              </Text>
              <Text style={{ fontSize: theme.font.size.xs, color: theme.colors.subtext }} numberOfLines={1}>
                {editingMessage.content ?? ''}
              </Text>
            </View>
            <TouchableOpacity onPress={() => { setEditingMessage(null); setText(''); inputRef.current?.clear() }} hitSlop={8}>
              <Ionicons name="close" size={18} color={theme.colors.subtext} />
            </TouchableOpacity>
          </View>
        )}

        {/* Image preview */}
        {imageUri && (
          <View style={{
            flexDirection: 'row', alignItems: 'center',
            backgroundColor: theme.colors.card,
            borderTopWidth: 1, borderTopColor: theme.colors.border,
            paddingHorizontal: theme.spacing.md, paddingVertical: 8,
            gap: theme.spacing.sm,
          }}>
            <Image source={{ uri: imageUri }} style={{ width: 60, height: 60, borderRadius: 8 }} resizeMode="cover" />
            <TouchableOpacity onPress={() => setImageUri(null)} hitSlop={8} style={{ position: 'absolute', top: 4, left: 56 }}>
              <View style={{ backgroundColor: theme.colors.subtext, borderRadius: 10, width: 20, height: 20, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="close" size={12} color="#fff" />
              </View>
            </TouchableOpacity>
          </View>
        )}

        {/* @mention suggestion dropdown (club chat only) */}
        {mentionSuggestions.length > 0 && (
          <View style={{
            borderTopWidth: 1, borderTopColor: theme.colors.border,
            backgroundColor: theme.colors.card,
            maxHeight: 200, overflow: 'hidden',
          }}>
            <ScrollView keyboardShouldPersistTaps="always" bounces={false}>
              {mentionSuggestions.map((u, idx) => (
                <TouchableOpacity
                  key={u.id}
                  onPress={() => selectMention(u)}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: 10,
                    paddingHorizontal: 16, paddingVertical: 10,
                    borderBottomWidth: idx < mentionSuggestions.length - 1 ? 1 : 0,
                    borderBottomColor: theme.colors.border, minHeight: 44,
                  }}
                >
                  <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: theme.colors.border, alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="person" size={16} color={theme.colors.subtext} />
                  </View>
                  <View>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: theme.colors.text }}>{u.displayName}</Text>
                    <Text style={{ fontSize: 12, color: theme.colors.subtext }}>@{u.username}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Input bar — pill composer */}
        <View style={{
          flexDirection: 'row', alignItems: 'flex-end',
          paddingHorizontal: theme.spacing.md,
          paddingTop: theme.spacing.sm,
          paddingBottom: insets.bottom + theme.spacing.sm,
          borderTopWidth: 1, borderTopColor: theme.colors.border,
          backgroundColor: theme.colors.background,
          gap: theme.spacing.sm,
        }}>
          <TouchableOpacity onPress={handlePickImage} style={{ paddingBottom: 9 }} hitSlop={8}>
            <Ionicons name="image-outline" size={22} color={theme.colors.subtext} />
          </TouchableOpacity>

          {/* Pill input container */}
          <View style={{
            flex: 1,
            flexDirection: 'row', alignItems: 'flex-end',
            backgroundColor: theme.colors.card,
            borderRadius: 22,
            borderWidth: 1,
            borderColor: theme.colors.border,
            paddingLeft: 14,
            paddingRight: 4,
            paddingVertical: 4,
            minHeight: 40,
            maxHeight: 120,
          }}>
            <TextInput
              ref={inputRef}
              value={text}
              onChangeText={handleTextChange}
              onSelectionChange={isClub ? handleSelectionChange : undefined}
              placeholder="Message…"
              placeholderTextColor={theme.colors.subtext}
              multiline
              style={{
                flex: 1,
                paddingTop: 7,
                paddingBottom: 7,
                fontFamily: theme.fonts.body,
                fontSize: theme.font.size.md,
                color: theme.colors.text,
                minHeight: 32,
              }}
              onSubmitEditing={Platform.OS === 'web' ? handleSend : undefined}
              blurOnSubmit={Platform.OS === 'web'}
            />
            <TouchableOpacity
              onPress={handleSend}
              disabled={!canSend}
              style={{
                width: 32, height: 32, borderRadius: 16,
                backgroundColor: canSend ? theme.colors.primary : 'transparent',
                alignItems: 'center', justifyContent: 'center',
                alignSelf: 'flex-end',
                marginBottom: 0,
              }}
            >
              {sending || uploadingImage ? (
                <ActivityIndicator size="small" color={canSend ? '#fff' : theme.colors.subtext} />
              ) : (
                <Ionicons name="send" size={16} color={canSend ? '#fff' : theme.colors.subtext} />
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>

      {/* Reaction / action picker */}
      <AnchorOptionsMenu
        visible={headerMenuVisible}
        anchor={headerMenuAnchor}
        options={dmHeaderMenuOptions}
        onDismiss={() => {
          setHeaderMenuVisible(false)
          setHeaderMenuAnchor(null)
        }}
      />

      <ReactionPicker
        visible={pickerVisible}
        message={pickerMessage}
        position={pickerPos}
        viewerUserId={myId}
        onReact={(msgId, emoji) => void toggleReaction(msgId, emoji)}
        onReply={msg => {
          setReplyTo(msg)
          focusInputAfterPickerRef.current = true
        }}
        onEdit={msg => {
          setEditingMessage(msg)
          setText(msg.content ?? '')
          setTimeout(() => inputRef.current?.focus(), 50)
        }}
        onDelete={msgId => void deleteMessage(msgId)}
        onDismiss={() => setPickerVisible(false)}
      />

      {/* Full-screen image viewer */}
      {viewingImage && (
        <Modal visible animationType="fade" onRequestClose={() => setViewingImage(null)}>
          <Pressable
            style={{ flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' }}
            onPress={() => setViewingImage(null)}
          >
            <Image source={{ uri: viewingImage }} style={{ width: '100%', height: '80%' }} resizeMode="contain" />
          </Pressable>
        </Modal>
      )}

      {/* Unsportsmanlike language (DM) — bad-word prompt */}
      <Modal
        visible={unsportsmanlikeModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setUnsportsmanlikeModalVisible(false)}
      >
        <Pressable
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.55)',
            alignItems: 'center',
            justifyContent: 'center',
            padding: theme.spacing.lg,
          }}
          onPress={() => setUnsportsmanlikeModalVisible(false)}
        >
          <View
            style={{
              width: '100%',
              maxWidth: 360,
              backgroundColor: theme.colors.card,
              borderRadius: theme.radius.xl,
              borderWidth: 1,
              borderColor: theme.colors.border,
              padding: theme.spacing.lg,
              gap: theme.spacing.md,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: theme.spacing.sm }}>
              <Text
                style={{
                  flex: 1,
                  fontFamily: theme.fonts.displaySemiBold,
                  fontSize: theme.font.size.lg,
                  color: theme.colors.text,
                  lineHeight: theme.font.lineHeight.normal,
                }}
              >
                This player may be unsportsmanlike. Would you like to report this user?
              </Text>
              <TouchableOpacity
                onPress={() => setUnsportsmanlikeModalVisible(false)}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel="Close"
              >
                <Ionicons name="close" size={26} color={theme.colors.subtext} />
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              onPress={() => {
                setUnsportsmanlikeModalVisible(false)
                // Defer so the modal can dismiss before the system alert appears.
                setTimeout(() => confirmReportDmUser(), 0)
              }}
              style={{
                minHeight: 48,
                borderRadius: theme.radius.md,
                backgroundColor: theme.colors.primary,
                alignItems: 'center',
                justifyContent: 'center',
                paddingVertical: theme.spacing.sm + 2,
              }}
            >
              <Text style={{ fontFamily: theme.fonts.bodySemiBold, fontSize: theme.font.size.md, color: theme.colors.white }}>
                Report
              </Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>
    </View>
  )
}
