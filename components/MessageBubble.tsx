import React from 'react'
import { View, Text, Image, Pressable, TouchableOpacity } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { theme } from '../constants/theme'
import type { MessageWithDetails } from '../types'

const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '🔥', '👏']

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? ''
function resolveAvatarUri(ref: string | null | undefined): string | null {
  if (!ref) return null
  if (/^https?:\/\//i.test(ref)) return ref
  return `${SUPABASE_URL}/storage/v1/render/image/public/avatars/${ref}?width=80&height=80&quality=70&resize=cover`
}

type Props = {
  message: MessageWithDetails
  isOwn: boolean
  showAvatar: boolean
  onLongPress: (message: MessageWithDetails, position: { x: number; y: number }) => void
  onReplyPress: (message: MessageWithDetails) => void
  onImagePress?: (url: string) => void
}

function displayName(p: { first_name: string | null; last_name: string | null; username: string } | null) {
  if (!p) return 'Unknown'
  return [p.first_name, p.last_name].filter(Boolean).join(' ') || p.username
}

export function MessageBubble({ message, isOwn, showAvatar, onLongPress, onReplyPress, onImagePress }: Props) {
  const deleted = !!message.deleted_at
  const hasText = !deleted && !!message.content
  const hasImage = !deleted && !!message.image_url

  // Group reactions by emoji
  const reactionGroups: Record<string, number> = {}
  for (const r of message.message_reactions) {
    reactionGroups[r.emoji] = (reactionGroups[r.emoji] ?? 0) + 1
  }
  const reactions = Object.entries(reactionGroups)

  const bubbleBg = isOwn ? theme.colors.primary : theme.colors.card
  const bubbleText = isOwn ? '#fff' : theme.colors.text

  return (
    <Pressable
      onLongPress={e => {
        if (!deleted) {
          const { pageX, pageY } = e.nativeEvent
          onLongPress(message, { x: pageX, y: pageY })
        }
      }}
      style={{
        flexDirection: isOwn ? 'row-reverse' : 'row',
        alignItems: 'flex-end',
        marginHorizontal: theme.spacing.md,
        marginBottom: 4,
        gap: 8,
      }}
    >
      {/* Avatar placeholder to keep layout consistent */}
      <View style={{ width: 28 }}>
        {!isOwn && showAvatar && (
          <View style={{
            width: 28, height: 28, borderRadius: 14,
            backgroundColor: theme.colors.border,
            alignItems: 'center', justifyContent: 'center',
            overflow: 'hidden',
          }}>
            {resolveAvatarUri(message.profiles?.avatar_url) ? (
              <Image source={{ uri: resolveAvatarUri(message.profiles?.avatar_url)! }} style={{ width: 28, height: 28 }} />
            ) : (
              <Ionicons name="person" size={14} color={theme.colors.subtext} />
            )}
          </View>
        )}
      </View>

      <View style={{ maxWidth: '72%', alignItems: isOwn ? 'flex-end' : 'flex-start' }}>
        {/* Sender name (only for club chats, non-own messages, when avatar is shown) */}
        {!isOwn && showAvatar && message.profiles && (
          <Text style={{
            fontSize: theme.font.size.xs,
            color: theme.colors.subtext,
            marginBottom: 2,
            marginLeft: 2,
          }}>
            {displayName(message.profiles)}
          </Text>
        )}

        {/* Reply quote */}
        {message.reply_to && message.reply_to.id && !deleted && (
          <TouchableOpacity
            onPress={() => onReplyPress(message)}
            style={{
              borderLeftWidth: 2,
              borderLeftColor: isOwn ? 'rgba(255,255,255,0.6)' : theme.colors.primary,
              paddingLeft: 8,
              marginBottom: 4,
              opacity: 0.8,
            }}
          >
            <Text style={{ fontSize: theme.font.size.xs, color: isOwn ? '#fff' : theme.colors.primary, fontWeight: theme.font.weight.semibold }}>
              {message.reply_to.profiles ? displayName(message.reply_to.profiles) : 'Message'}
            </Text>
            <Text style={{ fontSize: theme.font.size.xs, color: isOwn ? 'rgba(255,255,255,0.8)' : theme.colors.subtext }} numberOfLines={1}>
              {message.reply_to.deleted_at
                ? 'Deleted message'
                : message.reply_to.image_url && !message.reply_to.content
                  ? '📷 Image'
                  : message.reply_to.content ?? ''}
            </Text>
          </TouchableOpacity>
        )}

        {/* Bubble */}
        <View style={{
          backgroundColor: deleted ? 'transparent' : bubbleBg,
          borderRadius: 18,
          borderBottomLeftRadius: !isOwn ? 4 : 18,
          borderBottomRightRadius: isOwn ? 4 : 18,
          borderWidth: deleted ? 1 : 0,
          borderColor: theme.colors.border,
          overflow: 'hidden',
        }}>
          {deleted ? (
            <Text style={{
              fontSize: theme.font.size.sm,
              color: theme.colors.subtext,
              fontStyle: 'italic',
              paddingHorizontal: 12,
              paddingVertical: 8,
            }}>
              Message deleted
            </Text>
          ) : (
            <>
              {hasImage && (
                <Pressable onPress={() => onImagePress?.(message.image_url!)}>
                  <Image
                    source={{ uri: message.image_url! }}
                    style={{ width: 220, height: 180, borderRadius: hasText ? 0 : 18 }}
                    resizeMode="cover"
                  />
                </Pressable>
              )}
              {hasText && (
                <Text style={{
                  fontSize: theme.font.size.md,
                  color: bubbleText,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  lineHeight: 20,
                }}>
                  {message.content}
                </Text>
              )}
            </>
          )}
        </View>

        {/* Timestamp */}
        <Text style={{
          fontSize: 10,
          color: theme.colors.subtext,
          marginTop: 2,
          marginHorizontal: 4,
        }}>
          {formatTime(message.created_at)}
        </Text>

        {/* Reactions */}
        {reactions.length > 0 && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
            {reactions.map(([emoji, count]) => (
              <View key={emoji} style={{
                flexDirection: 'row', alignItems: 'center', gap: 2,
                backgroundColor: theme.colors.card,
                borderRadius: theme.radius.full,
                paddingHorizontal: 6, paddingVertical: 2,
                borderWidth: 1, borderColor: theme.colors.border,
              }}>
                <Text style={{ fontSize: 13 }}>{emoji}</Text>
                {count > 1 && (
                  <Text style={{ fontSize: 11, color: theme.colors.subtext }}>{count}</Text>
                )}
              </View>
            ))}
          </View>
        )}
      </View>
    </Pressable>
  )
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000)
  if (diffDays === 0) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }
  if (diffDays < 7) {
    return d.toLocaleDateString([], { weekday: 'short' }) + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

export { REACTION_EMOJIS }
