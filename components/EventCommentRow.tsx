import { useEffect, useState } from 'react'
import { Platform, View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import * as Linking from 'expo-linking'
import { useRouter } from 'expo-router'
import { theme, shared } from '../constants'
import type { EventCommentWithAuthor } from '../types'
import { resolveProfileAvatarUriSmall, profileDisplayName } from '../utils'
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

// Splits body into plain text, URLs, and @mention segments for inline rendering.
const SEGMENT_RE = /(https?:\/\/[^\s]+|@\w+)/g

function CommentBody({
  body,
  usernameToId,
}: {
  body: string
  usernameToId?: Map<string, string>
}) {
  const router = useRouter()
  const parts = body.split(SEGMENT_RE)

  return (
    <Text style={shared.body}>
      {parts.map((part, i) => {
        // URL
        if (/^https?:\/\//.test(part)) {
          return (
            <Text
              key={i}
              style={styles.link}
              onPress={() => {
                if (Platform.OS === 'web') {
                  window.open(part, '_blank', 'noopener,noreferrer')
                } else {
                  void Linking.openURL(part)
                }
              }}
              accessibilityRole="link"
            >
              {part}
            </Text>
          )
        }
        // @mention — only tappable if the username resolves to a known profile
        if (/^@\w+$/.test(part) && usernameToId) {
          const username = part.slice(1)
          const profileId = usernameToId.get(username)
          if (profileId) {
            return (
              <Text
                key={i}
                style={styles.mention}
                onPress={() => router.push(`/profile/${profileId}` as any)}
                accessibilityRole="link"
                accessibilityLabel={`View profile of ${username}`}
              >
                {part}
              </Text>
            )
          }
        }
        return part
      })}
    </Text>
  )
}

type Props = {
  comment: EventCommentWithAuthor
  usernameToId?: Map<string, string>
}

export function EventCommentRow({ comment, usernameToId }: Props) {
  const router = useRouter()
  const [avatarUri, setAvatarUri] = useState<string | null>(null)
  const p = comment.profiles

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { uri } = await resolveProfileAvatarUriSmall(p?.avatar_url)
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
        <CommentBody body={comment.body} usernameToId={usernameToId} />
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
  link: {
    color: theme.colors.primary,
    textDecorationLine: 'underline',
  },
  mention: {
    color: theme.colors.primary,
    fontWeight: '600',
  },
})
