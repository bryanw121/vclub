import React from 'react'
import { View, Text, ScrollView, ActivityIndicator } from 'react-native'
import { RefreshControl } from '../RefreshControl'
import { shared, theme } from '../../constants'
import type { MentionUser } from '../../types'
import type { EventCommentsApi, EventData } from '../../types'
import { profileDisplayName } from '../../utils'
import { EventCommentRow } from '../EventCommentRow'
import { DiscussionComposer } from '../DiscussionComposer'

type Props = {
  discussion: EventCommentsApi
  /** Viewer id and pull-to-refresh. */
  data: EventData
  isHostOrCohost: boolean
  usernameToId: Map<string, string>
  mentionableUsers: MentionUser[]
  scrollRef: React.RefObject<ScrollView | null>
  isActive: boolean
  scrollToBottom: (animated: boolean) => void
  keyboardInset: number
  bottomInset: number
  onComposerLayout: (height: number) => void
}

export function DiscussionTab({
  discussion,
  data,
  isHostOrCohost,
  usernameToId,
  mentionableUsers,
  scrollRef,
  isActive,
  scrollToBottom,
  keyboardInset,
  bottomInset,
  onComposerLayout,
}: Props) {
  const { refreshing, refresh: onRefresh, userId } = data
  const {
    comments, loading: commentsLoading, post: onPost, remove: onDelete,
    replyTo: replyToComment, editing: editingComment, setReplyTo: onReply, setEditing: onEdit,
  } = discussion
  const onClearReply = () => onReply(null)
  const onCancelEdit = () => onEdit(null)
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
