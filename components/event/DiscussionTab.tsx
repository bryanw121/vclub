import React from 'react'
import { View, Text, ScrollView, ActivityIndicator, RefreshControl } from 'react-native'
import { shared, theme } from '../../constants'
import type { EventCommentWithAuthor, MentionUser } from '../../types'
import { profileDisplayName } from '../../utils'
import { EventCommentRow } from '../EventCommentRow'
import { DiscussionComposer } from '../DiscussionComposer'

type Props = {
  scrollRef: React.RefObject<ScrollView | null>
  isActive: boolean
  refreshing: boolean
  onRefresh: () => void
  scrollToBottom: (animated: boolean) => void
  commentsLoading: boolean
  comments: EventCommentWithAuthor[]
  usernameToId: Map<string, string>
  userId: string | null
  isHostOrCohost: boolean
  onReply: (comment: EventCommentWithAuthor) => void
  onEdit: (comment: EventCommentWithAuthor) => void
  onDelete: (commentId: string) => void
  keyboardInset: number
  bottomInset: number
  onComposerLayout: (height: number) => void
  mentionableUsers: MentionUser[]
  onPost: (body: string, isAnnouncement: boolean, mentionIds: string[]) => Promise<void>
  replyToComment: EventCommentWithAuthor | null
  editingComment: EventCommentWithAuthor | null
  onClearReply: () => void
  onCancelEdit: () => void
}

export function DiscussionTab({
  scrollRef,
  isActive,
  refreshing,
  onRefresh,
  scrollToBottom,
  commentsLoading,
  comments,
  usernameToId,
  userId,
  isHostOrCohost,
  onReply,
  onEdit,
  onDelete,
  keyboardInset,
  bottomInset,
  onComposerLayout,
  mentionableUsers,
  onPost,
  replyToComment,
  editingComment,
  onClearReply,
  onCancelEdit,
}: Props) {
  return (
    <View style={[shared.screen, { flex: 1, minHeight: 0 }]}>
      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: 'flex-end',
          paddingTop: theme.spacing.lg,
          paddingHorizontal: theme.spacing.lg,
          paddingBottom: theme.spacing.xs,
        }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />}
        onContentSizeChange={() => {
          if (isActive) scrollToBottom(false)
        }}
      >
        {commentsLoading && comments.length === 0 ? (
          <View style={{ paddingVertical: theme.spacing.lg, alignItems: 'center' }}>
            <ActivityIndicator color={theme.colors.primary} />
          </View>
        ) : comments.length === 0 ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={shared.caption}>No messages yet. Be the first to comment.</Text>
          </View>
        ) : (
          <View style={{ gap: theme.spacing.xs }}>
            {comments.filter(c => !c.parent_id).map(c => (
              <EventCommentRow
                key={c.id}
                comment={c}
                replies={comments.filter(r => r.parent_id === c.id)}
                usernameToId={usernameToId}
                myId={userId}
                isHost={isHostOrCohost}
                onReply={onReply}
                onEdit={onEdit}
                onDelete={onDelete}
              />
            ))}
          </View>
        )}
      </ScrollView>

      {userId ? (
        <View
          style={{
            paddingHorizontal: theme.spacing.lg,
            paddingTop: theme.spacing.xs,
            paddingBottom:
              keyboardInset > 0
                ? keyboardInset + theme.spacing.sm
                : Math.max(bottomInset, theme.spacing.md),
          }}
        >
          <View onLayout={(e) => onComposerLayout(Math.ceil(e.nativeEvent.layout.height))}>
            <DiscussionComposer
              showAnnouncementToggle={isHostOrCohost}
              mentionableUsers={mentionableUsers}
              onPost={onPost}
              onFocusScroll={() => scrollRef.current?.scrollToEnd({ animated: true })}
              replyToAuthor={replyToComment ? (replyToComment.profiles ? profileDisplayName(replyToComment.profiles) : 'Member') : null}
              onClearReply={onClearReply}
              editingBody={editingComment?.body ?? null}
              onCancelEdit={onCancelEdit}
            />
          </View>
        </View>
      ) : (
        <Text style={[shared.caption, { paddingTop: theme.spacing.sm, paddingBottom: theme.spacing.lg }]}>Sign in to join the discussion.</Text>
      )}
    </View>
  )
}
