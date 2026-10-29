import type { ComponentProps } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { Text } from '../ui/Text'
import Ionicons from '@expo/vector-icons/Ionicons'
import { shared, theme, TIGHT_TEXT_SCALE } from '../../constants'
import type { SettingsSection } from '../../utils/routes'

type Props = {
  onOpen: (section: SettingsSection) => void
  /** "Take the tour" row: restarts the intro tour. */
  onTakeTour: () => void
  onOpenTerms: () => void
  onOpenPrivacy: () => void
  /** Pending incoming friend requests, shown as a count on the Friends row. */
  friendRequestCount?: number
}

type MenuItem = {
  title: string
  icon: ComponentProps<typeof Ionicons>['name']
  section: SettingsSection
}

const MENU_ITEMS: readonly MenuItem[] = [
  { title: 'Friends', icon: 'people-outline', section: 'friends' },
  { title: 'Account Settings', icon: 'settings-outline', section: 'account' },
  { title: 'Silenced people', icon: 'eye-off-outline', section: 'silenced' },
  { title: 'Notifications', icon: 'notifications-outline', section: 'notifications' },
  { title: 'Display', icon: 'text-outline', section: 'display' },
  { title: 'History', icon: 'time-outline', section: 'history' },
  { title: 'Cheers', icon: 'star-outline', section: 'cheers' },
  { title: 'Badges', icon: 'ribbon-outline', section: 'badges' },
  { title: 'Submit Feedback', icon: 'chatbubble-ellipses-outline', section: 'feedback' },
]

/** The settings shortcuts under the profile hero. Navigation is the caller's (`onOpen`). */
export function ProfileMenu({ onOpen, onTakeTour, onOpenTerms, onOpenPrivacy, friendRequestCount = 0 }: Props) {
  const rows = [
    ...MENU_ITEMS.map(item => ({ key: item.section, title: item.title, icon: item.icon, onPress: () => onOpen(item.section) })),
    { key: 'tour', title: 'Take the tour', icon: 'compass-outline' as MenuItem['icon'], onPress: onTakeTour },
    { key: 'terms', title: 'Terms and Conditions', icon: 'document-text-outline' as MenuItem['icon'], onPress: onOpenTerms },
    { key: 'privacy', title: 'Privacy Policy', icon: 'shield-checkmark-outline' as MenuItem['icon'], onPress: onOpenPrivacy },
  ]
  return (
    <View style={[shared.card, { gap: 0, marginTop: theme.spacing.lg, padding: 0, overflow: 'hidden' }]}>
      {rows.map((row, idx) => (
        <Pressable
          key={row.key}
          onPress={row.onPress}
          accessibilityRole="button"
          accessibilityLabel={row.title}
          testID={row.key === 'tour' ? 'take-tour' : `profile-menu-${row.key}`}
          style={({ pressed }) => [
            styles.row,
            idx < rows.length - 1 && styles.rowBorder,
            pressed && { backgroundColor: theme.colors.background },
          ]}
        >
          <View style={styles.rowIcon}>
            <Ionicons name={row.icon} size={18} color={theme.colors.primary} />
          </View>
          <Text style={styles.rowTitle}>{row.title}</Text>
          {row.key === 'friends' && friendRequestCount > 0 && (
            <View style={styles.countPip} accessibilityLabel={`${friendRequestCount} friend ${friendRequestCount === 1 ? 'request' : 'requests'}`} testID="profile-menu-friends-count">
              <Text style={styles.countText} maxFontSizeMultiplier={TIGHT_TEXT_SCALE}>{friendRequestCount > 9 ? '9+' : friendRequestCount}</Text>
            </View>
          )}
          <Ionicons name="chevron-forward" size={16} color={theme.colors.subtext} />
        </Pressable>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    gap: theme.spacing.md,
    backgroundColor: theme.colors.card,
  },
  rowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  rowIcon: {
    width: 34,
    height: 34,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.primary + '14',
    alignItems: 'center',
    justifyContent: 'center',
  },
  countPip: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: 6,
    borderRadius: 11,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countText: {
    fontFamily: theme.fonts.bodyBold,
    fontSize: theme.font.size.xs,
    color: theme.colors.white,
  },
  rowTitle: {
    flex: 1,
    fontFamily: theme.fonts.bodyMedium,
    fontSize: theme.font.size.md,
    color: theme.colors.text,
  },
})
