import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  View, Text, FlatList, TouchableOpacity, TextInput,
  ActivityIndicator, Image, Modal, Pressable, Alert, Platform, RefreshControl,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useRouter, useFocusEffect, Stack } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { supabase } from '../../../lib/supabase'
import { theme, shared } from '../../../constants'
import { useConversations } from '../../../hooks/useConversations'
import { useSilencedUsers } from '../../../hooks/useSilencedUsers'
import { useTabsContext } from '../../../contexts/tabs'
import { timeAgo, lastMessagePreview } from '../../../utils/chatUtils'
import type { ConversationRow, Profile } from '../../../types'

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? ''
function resolveAvatarUri(ref: string | null | undefined): string | null {
  if (!ref) return null
  if (/^https?:\/\//i.test(ref)) return ref
  return `${SUPABASE_URL}/storage/v1/render/image/public/avatars/${ref}?width=120&height=120&quality=70&resize=cover`
}

function conversationTitle(row: ConversationRow): string {
  if (row.type === 'club') return row.club_name ?? 'Club Chat'
  const parts = [row.other_user_first_name, row.other_user_last_name].filter(Boolean)
  return parts.length ? parts.join(' ') : (row.other_user_username ?? 'Direct Message')
}

// ── User search for starting a new DM ─────────────────────────────────────────
function NewDMModal({ visible, onDismiss, onSelect, silencedUserIds }: {
  visible: boolean
  onDismiss: () => void
  onSelect: (userId: string) => void
  silencedUserIds: Set<string>
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Profile[]>([])
  const [searching, setSearching] = useState(false)

  useEffect(() => {
    if (!query.trim()) { setResults([]); return }
    const t = setTimeout(async () => {
      setSearching(true)
      const { data: { user } } = await supabase.auth.getUser()
      const { data } = await supabase
        .from('profiles')
        .select('id, username, first_name, last_name, avatar_url')
        .or(`username.ilike.%${query.trim()}%,first_name.ilike.%${query.trim()}%,last_name.ilike.%${query.trim()}%`)
        .neq('id', user?.id ?? '')
        .limit(20)
      setResults((data ?? []) as Profile[])
      setSearching(false)
    }, 300)
    return () => clearTimeout(t)
  }, [query])

  function handleDismiss() {
    setQuery('')
    setResults([])
    onDismiss()
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleDismiss}>
      <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
        <View style={{
          flexDirection: 'row', alignItems: 'center',
          paddingHorizontal: theme.spacing.md, paddingTop: theme.spacing.lg, paddingBottom: theme.spacing.md,
          borderBottomWidth: 1, borderBottomColor: theme.colors.border,
          gap: theme.spacing.md,
        }}>
          <TextInput
            autoFocus
            placeholder="Search by name or username…"
            placeholderTextColor={theme.colors.subtext}
            value={query}
            onChangeText={setQuery}
            style={{
              flex: 1, height: 40,
              backgroundColor: theme.colors.card,
              borderRadius: theme.radius.lg,
              paddingHorizontal: 14,
              fontSize: theme.font.size.md,
              color: theme.colors.text,
            }}
          />
          <TouchableOpacity onPress={handleDismiss}>
            <Text style={{ color: theme.colors.primary, fontSize: theme.font.size.md }}>Cancel</Text>
          </TouchableOpacity>
        </View>

        {searching ? (
          <View style={{ padding: theme.spacing.xl, alignItems: 'center' }}>
            <ActivityIndicator color={theme.colors.primary} />
          </View>
        ) : (
          <FlatList
            data={results.filter(p => !silencedUserIds.has(p.id))}
            keyExtractor={p => p.id}
            renderItem={({ item }) => {
              const name = [item.first_name, item.last_name].filter(Boolean).join(' ') || item.username
              return (
                <TouchableOpacity
                  onPress={() => {
                    handleDismiss()
                    onSelect(item.id)
                  }}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md,
                    paddingHorizontal: theme.spacing.lg, paddingVertical: theme.spacing.md,
                    borderBottomWidth: 1, borderBottomColor: theme.colors.border,
                  }}
                >
                  <View style={{
                    width: 44, height: 44, borderRadius: 22,
                    backgroundColor: theme.colors.border,
                    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
                  }}>
                    {resolveAvatarUri(item.avatar_url) ? (
                      <Image source={{ uri: resolveAvatarUri(item.avatar_url)! }} style={{ width: 44, height: 44 }} />
                    ) : (
                      <Ionicons name="person" size={22} color={theme.colors.subtext} />
                    )}
                  </View>
                  <View>
                    <Text style={{ fontSize: theme.font.size.md, fontWeight: theme.font.weight.medium, color: theme.colors.text }}>
                      {name}
                    </Text>
                    <Text style={{ fontSize: theme.font.size.sm, color: theme.colors.subtext }}>@{item.username}</Text>
                  </View>
                </TouchableOpacity>
              )
            }}
            ListEmptyComponent={query.trim() ? (
              <Text style={[shared.caption, { textAlign: 'center', padding: theme.spacing.xl }]}>
                No users found
              </Text>
            ) : null}
          />
        )}
      </View>
    </Modal>
  )
}

// ── Chat list screen ───────────────────────────────────────────────────────────
export default function ChatScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { tabBarHeight } = useTabsContext()
  const { conversations, loading, refetch, clearUnread } = useConversations()
  const { silencedUserIds, silenceUser } = useSilencedUsers()
  const [myId, setMyId] = useState<string | null>(null)
  const [newDMVisible, setNewDMVisible] = useState(false)
  const [listRefreshing, setListRefreshing] = useState(false)

  const handleChatListRefresh = useCallback(async () => {
    setListRefreshing(true)
    try {
      await refetch()
    } finally {
      setListRefreshing(false)
    }
  }, [refetch])

  const visibleConversations = useMemo(() => {
    const filtered = conversations.filter(row => {
      if (row.type !== 'dm') return true
      if (!row.other_user_id) return true
      return !silencedUserIds.has(row.other_user_id)
    })
    // Unread conversations first, then by most recent message
    return filtered.sort((a, b) => {
      const aUnread = (a.unread_count ?? 0) > 0
      const bUnread = (b.unread_count ?? 0) > 0
      if (aUnread !== bUnread) return aUnread ? -1 : 1
      return (b.last_message_at ?? '').localeCompare(a.last_message_at ?? '')
    })
  }, [conversations, silencedUserIds])

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setMyId(user?.id ?? null))
  }, [])

  useFocusEffect(useCallback(() => {
    void refetch()
  }, [refetch]))

  async function openDM(otherUserId: string) {
    const { data: convId } = await supabase.rpc('find_or_create_dm', { other_user_id: otherUserId })
    if (convId) router.push(`/chat/${convId}` as any)
  }

  function openConversation(row: ConversationRow) {
    clearUnread(row.conversation_id)
    router.push(`/chat/${row.conversation_id}` as any)
  }

  function confirmSilenceFromList(otherUserId: string, label: string) {
    Alert.alert(
      'Silence this user?',
      `${label} — their chat messages will be hidden. Undo under Profile → Silenced people.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Silence', style: 'destructive', onPress: () => { void silenceUser(otherUserId) } },
      ],
    )
  }

  function renderRow({ item }: { item: ConversationRow }) {
    const title = conversationTitle(item)
    const preview = myId ? lastMessagePreview(item, myId, silencedUserIds) : ''
    const time = timeAgo(item.last_message_at)
    const hasUnread = (item.unread_count ?? 0) > 0
    const avatarUrl = resolveAvatarUri(item.type === 'dm' ? item.other_user_avatar_url : item.club_avatar_url)
    const isClub = item.type === 'club'

    const canSilenceDm = item.type === 'dm' && item.other_user_id && myId && item.other_user_id !== myId

    return (
      <Pressable
        onPress={() => openConversation(item)}
        onLongPress={canSilenceDm ? () => confirmSilenceFromList(item.other_user_id!, conversationTitle(item)) : undefined}
        {...(Platform.OS === 'web' && canSilenceDm
          ? {
              onContextMenu: (e: { preventDefault?: () => void }) => {
                e.preventDefault?.()
                confirmSilenceFromList(item.other_user_id!, conversationTitle(item))
              },
            }
          : {})}
        delayLongPress={480}
        style={({ pressed }) => ({
          flexDirection: 'row', alignItems: 'center',
          paddingHorizontal: theme.spacing.lg,
          paddingVertical: theme.spacing.md,
          gap: theme.spacing.md,
          borderBottomWidth: 1, borderBottomColor: theme.colors.border,
          opacity: pressed ? 0.88 : 1,
        })}
      >
        {/* Avatar */}
        <View style={{
          width: 52, height: 52, borderRadius: isClub ? 14 : 26,
          backgroundColor: theme.colors.border,
          alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
          flexShrink: 0,
        }}>
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={{ width: 52, height: 52 }} />
          ) : (
            <Ionicons name={isClub ? 'people' : 'person'} size={26} color={theme.colors.subtext} />
          )}
        </View>

        {/* Content */}
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <Text
              style={{ fontFamily: hasUnread ? theme.fonts.displaySemiBold : theme.fonts.displayMedium, fontSize: theme.font.size.md, color: theme.colors.text, flex: 1 }}
              numberOfLines={1}
            >
              {title}
            </Text>
            <Text style={{ fontFamily: theme.fonts.body, fontSize: theme.font.size.xs, color: hasUnread ? theme.colors.primary : theme.colors.subtext, flexShrink: 0 }}>
              {time}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 }}>
            <Text
              style={{ flex: 1, fontFamily: hasUnread ? theme.fonts.bodyMedium : theme.fonts.body, fontSize: theme.font.size.sm, color: hasUnread ? theme.colors.text : theme.colors.subtext }}
              numberOfLines={1}
            >
              {preview}
            </Text>
            {hasUnread && (
              <View style={{
                minWidth: 20, height: 20, borderRadius: 10,
                backgroundColor: theme.colors.primary,
                alignItems: 'center', justifyContent: 'center',
                paddingHorizontal: 5, flexShrink: 0,
              }}>
                <Text style={{ fontFamily: theme.fonts.bodyBold, fontSize: 11, color: '#fff' }}>
                  {item.unread_count > 99 ? '99+' : item.unread_count}
                </Text>
              </View>
            )}
          </View>
        </View>
      </Pressable>
    )
  }

  return (
    <View style={[shared.screen, { paddingTop: insets.top }]}>
      <Stack.Screen options={{ headerShown: false }} />
      {/* Header */}
      <View style={{ paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.md, paddingBottom: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <View>
            <Text style={{ fontFamily: theme.fonts.body, fontSize: 11, fontWeight: '700', color: theme.colors.subtext, letterSpacing: 1, textTransform: 'uppercase' }}>
              Direct messages
            </Text>
            <Text style={{ fontFamily: theme.fonts.display, fontWeight: '700', fontSize: 34, letterSpacing: -1.2, color: theme.colors.text, lineHeight: 38, marginTop: 1 }}>
              Chat
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => setNewDMVisible(true)}
            hitSlop={8}
            style={{
              width: 38, height: 38, borderRadius: 12,
              backgroundColor: theme.colors.primary,
              alignItems: 'center', justifyContent: 'center',
              marginBottom: 4,
            }}
          >
            <Ionicons name="add" size={22} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* Search bar */}
        <TouchableOpacity
          onPress={() => setNewDMVisible(true)}
          style={{
            flexDirection: 'row', alignItems: 'center', gap: 8,
            backgroundColor: theme.colors.card,
            borderWidth: 1, borderColor: theme.colors.border,
            borderRadius: 12,
            paddingHorizontal: 12, paddingVertical: 10,
            marginTop: theme.spacing.sm,
          }}
        >
          <Ionicons name="search-outline" size={16} color={theme.colors.subtext} />
          <Text style={{ fontFamily: theme.fonts.body, fontSize: 13, color: theme.colors.subtext }}>Search people</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={shared.centered}>
          <ActivityIndicator color={theme.colors.primary} />
        </View>
      ) : (
        <FlatList
          data={visibleConversations}
          keyExtractor={r => r.conversation_id}
          renderItem={renderRow}
          contentContainerStyle={{ paddingBottom: tabBarHeight + 16 }}
          refreshControl={
            <RefreshControl
              refreshing={listRefreshing}
              onRefresh={() => void handleChatListRefresh()}
              tintColor={theme.colors.primary}
            />
          }
          ListHeaderComponent={visibleConversations.length === 0 ? (
            <View style={[shared.centered, { paddingTop: 60 }]}>
              <Ionicons name="chatbubbles-outline" size={48} color={theme.colors.border} />
              <Text style={[shared.body, { marginTop: theme.spacing.md, color: theme.colors.subtext, textAlign: 'center', paddingHorizontal: theme.spacing.xl }]}>
                {conversations.length > 0
                  ? 'No conversations here. Direct chats with people you silenced stay hidden until you unsilence them under Profile → Silenced people.'
                  : 'No messages yet.\nTap the icon above to start a conversation.'}
              </Text>
            </View>
          ) : null}
        />
      )}

      <NewDMModal
        visible={newDMVisible}
        onDismiss={() => setNewDMVisible(false)}
        onSelect={openDM}
        silencedUserIds={silencedUserIds}
      />
    </View>
  )
}
