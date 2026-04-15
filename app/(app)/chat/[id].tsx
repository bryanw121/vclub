import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  View, Text, FlatList, TextInput, TouchableOpacity,
  KeyboardAvoidingView, Platform, ActivityIndicator,
  Image, Pressable, Modal, Alert,
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
import { useAuth } from '../../../hooks/useAuth'
import { useMessages } from '../../../hooks/useMessages'
import { useSilencedUsers } from '../../../hooks/useSilencedUsers'
import { AnchorOptionsMenu, type AnchorRect } from '../../../components/AnchorOptionsMenu'
import { MessageBubble } from '../../../components/MessageBubble'
import { ReactionPicker } from '../../../components/ReactionPicker'
import type { ConversationRow, MessageWithDetails } from '../../../types'

const AVATAR_SIZE = 36

function displayName(p: { first_name: string | null; last_name: string | null; username: string } | null) {
  if (!p) return ''
  return [p.first_name, p.last_name].filter(Boolean).join(' ') || p.username
}

export default function ChatRoomScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const flatListRef = useRef<FlatList>(null)
  const inputRef = useRef<import('react-native').TextInput>(null)

  const { session } = useAuth()
  const myId = session?.user?.id ?? null
  const [convRow, setConvRow] = useState<ConversationRow | null>(null)
  const [text, setText] = useState('')
  const [imageUri, setImageUri] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [uploadingImage, setUploadingImage] = useState(false)
  const [replyTo, setReplyTo] = useState<MessageWithDetails | null>(null)

  // Reaction picker state
  const [pickerVisible, setPickerVisible] = useState(false)
  const [pickerMessage, setPickerMessage] = useState<MessageWithDetails | null>(null)
  const [pickerPos, setPickerPos] = useState({ x: 0, y: 0 })

  // Full-screen image viewer
  const [viewingImage, setViewingImage] = useState<string | null>(null)

  const headerKebabRef = useRef<View>(null)
  const [headerMenuVisible, setHeaderMenuVisible] = useState(false)
  const [headerMenuAnchor, setHeaderMenuAnchor] = useState<AnchorRect | null>(null)

  const {
    messages, loading, hasMore, loadMore,
    sendMessage, deleteMessage, toggleReaction, uploadImage, markRead,
  } = useMessages(id)
  const { silencedUserIds, silenceUser } = useSilencedUsers()

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

  // Silenced DMs are hidden from the list; kick out if opened via deep link or stale route.
  useEffect(() => {
    if (!convRow || convRow.type !== 'dm' || !convRow.other_user_id) return
    if (!silencedUserIds.has(convRow.other_user_id)) return
    router.replace('/(app)/(tabs)/chat' as any)
  }, [convRow, silencedUserIds, router])

  // Mark read when screen opens and whenever new messages arrive
  useEffect(() => {
    if (messages.length > 0) void markRead()
  }, [messages.length, markRead])

  // Scroll to bottom on new messages
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100)
    }
  }, [messages.length])

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

  async function handleSend() {
    const trimmed = text.trim()
    if (!trimmed && !imageUri) return
    setText('')
    inputRef.current?.clear()
    setImageUri(null)
    setReplyTo(null)
    setSending(true)
    try {
      let uploadedUrl: string | null = null
      if (imageUri) {
        setUploadingImage(true)
        uploadedUrl = await uploadImage(imageUri)
        setUploadingImage(false)
      }
      await sendMessage(trimmed || null, uploadedUrl, replyTo?.id ?? null)
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

  const dmHeaderMenuOptions = useMemo(() => {
    if (!convRow || convRow.type !== 'dm' || !convRow.other_user_id || !myId || convRow.other_user_id === myId) return []
    const oid = convRow.other_user_id
    return [
      { key: 'profile', label: 'View profile', onPress: () => router.push(`/profile/${oid}` as any) },
      { key: 'silence', label: 'Silence user', destructive: true, onPress: () => confirmSilenceUser(oid) },
    ]
  }, [convRow, myId, router, confirmSilenceUser])

  function openHeaderOptionsMenu() {
    headerKebabRef.current?.measureInWindow((x, y, w, h) => {
      setHeaderMenuAnchor({ x, y, width: w, height: h })
      setHeaderMenuVisible(true)
    })
  }

  const renderMessage = useCallback(({ item, index }: { item: MessageWithDetails; index: number }) => {
    const isOwn = item.sender_id === myId
    const prevItem = index > 0 ? messages[index - 1] : null
    // Show avatar when the sender changes or when it's the first message in a sequence
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

  const canSend = (text.trim().length > 0 || !!imageUri) && !sending

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

        <Text style={{ flex: 1, fontSize: theme.font.size.lg, fontWeight: theme.font.weight.semibold, color: theme.colors.text }} numberOfLines={1}>
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
        ) : (
          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={m => m.id}
            renderItem={renderMessage}
            contentContainerStyle={{ paddingVertical: theme.spacing.md }}
            onStartReached={hasMore ? loadMore : undefined}
            onStartReachedThreshold={0.2}
            ListHeaderComponent={hasMore ? (
              <View style={{ alignItems: 'center', paddingVertical: 8 }}>
                <ActivityIndicator size="small" color={theme.colors.subtext} />
              </View>
            ) : null}
            maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
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

        {/* Input bar */}
        <View style={{
          flexDirection: 'row', alignItems: 'flex-end',
          paddingHorizontal: theme.spacing.md,
          paddingTop: theme.spacing.sm,
          paddingBottom: insets.bottom + theme.spacing.sm,
          borderTopWidth: 1, borderTopColor: theme.colors.border,
          backgroundColor: theme.colors.background,
          gap: theme.spacing.sm,
        }}>
          <TouchableOpacity onPress={handlePickImage} style={{ paddingBottom: 10 }} hitSlop={8}>
            <Ionicons name="image-outline" size={24} color={theme.colors.subtext} />
          </TouchableOpacity>

          <TextInput
            ref={inputRef}
            value={text}
            onChangeText={setText}
            placeholder="Message…"
            placeholderTextColor={theme.colors.subtext}
            multiline
            style={{
              flex: 1,
              minHeight: 40, maxHeight: 120,
              backgroundColor: theme.colors.card,
              borderRadius: 20,
              paddingHorizontal: 14,
              paddingTop: 10, paddingBottom: 10,
              fontSize: theme.font.size.md,
              color: theme.colors.text,
            }}
            onSubmitEditing={Platform.OS === 'web' ? handleSend : undefined}
            blurOnSubmit={Platform.OS === 'web'}
          />

          <TouchableOpacity
            onPress={handleSend}
            disabled={!canSend}
            style={{
              width: 38, height: 38, borderRadius: 19,
              backgroundColor: canSend ? theme.colors.primary : theme.colors.border,
              alignItems: 'center', justifyContent: 'center',
              marginBottom: 2,
            }}
          >
            {sending || uploadingImage ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons name="send" size={18} color="#fff" />
            )}
          </TouchableOpacity>
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
        onReply={msg => setReplyTo(msg)}
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
    </View>
  )
}
