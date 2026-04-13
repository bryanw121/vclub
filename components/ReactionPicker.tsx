import React from 'react'
import { View, Text, TouchableOpacity, Pressable, Modal } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { theme } from '../constants/theme'
import { REACTION_EMOJIS } from './MessageBubble'
import type { MessageWithDetails } from '../types'

type Props = {
  visible: boolean
  message: MessageWithDetails | null
  position: { x: number; y: number }
  isOwn: boolean
  onReact: (messageId: string, emoji: string) => void
  onReply: (message: MessageWithDetails) => void
  onDelete: (messageId: string) => void
  onDismiss: () => void
}

export function ReactionPicker({ visible, message, position, isOwn, onReact, onReply, onDelete, onDismiss }: Props) {
  if (!message) return null

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <Pressable style={{ flex: 1 }} onPress={onDismiss}>
        <View style={{
          position: 'absolute',
          top: Math.max(8, position.y - 120),
          left: Math.min(Math.max(8, position.x - 120), 240),
          backgroundColor: theme.colors.card,
          borderRadius: theme.radius.xl,
          borderWidth: 1,
          borderColor: theme.colors.border,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.2,
          shadowRadius: 12,
          elevation: 12,
          overflow: 'hidden',
        }}>
          {/* Emoji row */}
          <View style={{ flexDirection: 'row', padding: theme.spacing.sm, gap: 4 }}>
            {REACTION_EMOJIS.map(emoji => (
              <TouchableOpacity
                key={emoji}
                onPress={() => {
                  onReact(message.id, emoji)
                  onDismiss()
                }}
                style={{
                  width: 38, height: 38, borderRadius: 19,
                  alignItems: 'center', justifyContent: 'center',
                }}
              >
                <Text style={{ fontSize: 22 }}>{emoji}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Divider */}
          <View style={{ height: 1, backgroundColor: theme.colors.border }} />

          {/* Actions */}
          <View style={{ paddingVertical: theme.spacing.xs }}>
            <TouchableOpacity
              onPress={() => {
                onReply(message)
                onDismiss()
              }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 10 }}
            >
              <Ionicons name="return-down-back" size={18} color={theme.colors.text} />
              <Text style={{ fontSize: theme.font.size.md, color: theme.colors.text }}>Reply</Text>
            </TouchableOpacity>

            {isOwn && (
              <TouchableOpacity
                onPress={() => {
                  onDelete(message.id)
                  onDismiss()
                }}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 10 }}
              >
                <Ionicons name="trash-outline" size={18} color={theme.colors.error ?? '#EF4444'} />
                <Text style={{ fontSize: theme.font.size.md, color: theme.colors.error ?? '#EF4444' }}>Delete</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Pressable>
    </Modal>
  )
}
