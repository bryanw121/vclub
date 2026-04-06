import { useEffect, useState } from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { useRouter } from 'expo-router'
import { theme, shared } from '../constants'
import type { EventCommentWithAuthor } from '../types'
import { resolveProfileAvatarUriWithError, profileDisplayName } from '../utils'
import { ProfileAvatar } from './ProfileAvatar'

function formatCommentTime(iso: string): string {
  const normalized = /[Z+]/.test(iso) ? iso : iso + 'Z'
  const d = new Date(normalized)
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

type Props = { comment: EventCommentWithAuthor }

export function EventCommentRow({ comment }: Props) {
  const router = useRouter()
  const [avatarUri, setAvatarUri] = useState<string | null>(null)
  const p = comment.profiles

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { uri } = await resolveProfileAvatarUriWithError(p?.avatar_url)
      if (!cancelled) setAvatarUri(uri)
    })()
    return () => { cancelled = true }
  }, [p?.avatar_url])

  const name = p ? profileDisplayName(p) : 'Member'
  const isAnnouncement = comment.is_announcement

  function goProfile() {
    router.push(`/profile/${comment.user_id}` as any)
  }

  return (
    <View style={[styles.row, isAnnouncement && styles.rowAnnouncement]}>
      <TouchableOpacity onPress={goProfile} accessibilityRole="button" accessibilityLabel={`${name} profile`}>
        <ProfileAvatar uri={avatarUri} border={p?.selected_border ?? null} size={36} />
      </TouchableOpacity>
      <View style={styles.content}>
        {isAnnouncement && (
          <View style={styles.announcementBadge}>
            <Text style={styles.announcementBadgeText}>Announcement</Text>
          </View>
        )}
        <TouchableOpacity onPress={goProfile}>
          <Text style={styles.name} numberOfLines={1}>{name}</Text>
        </TouchableOpacity>
        <Text style={shared.body}>{comment.body}</Text>
        <Text style={styles.time}>{formatCommentTime(comment.created_at)}</Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
  },
  rowAnnouncement: {
    backgroundColor: theme.colors.announcementHighlight,
    borderRadius: theme.radius.md,
    paddingVertical: theme.spacing.sm,
    marginVertical: theme.spacing.xxs,
  },
  announcementBadge: {
    alignSelf: 'flex-start',
    backgroundColor: theme.colors.primary + '22',
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xxs,
    borderRadius: theme.radius.sm,
    marginBottom: theme.spacing.xs,
  },
  announcementBadgeText: {
    fontSize: theme.font.size.xs,
    fontWeight: theme.font.weight.semibold,
    color: theme.colors.primary,
    letterSpacing: 0.3,
  },
  content: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    fontSize: theme.font.size.md,
    fontWeight: theme.font.weight.semibold,
    color: theme.colors.text,
    marginBottom: theme.spacing.xxs,
  },
  time: {
    fontSize: theme.font.size.sm,
    color: theme.colors.subtext,
    marginTop: theme.spacing.xs,
  },
})
