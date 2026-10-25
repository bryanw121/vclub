import type { ComponentProps } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { shared, theme } from '../../constants'
import type { SettingsSection } from '../../utils/routes'

type Props = {
  onOpen: (section: SettingsSection) => void
}

type MenuItem = {
  title: string
  icon: ComponentProps<typeof Ionicons>['name']
  section: SettingsSection
}

const MENU_ITEMS: readonly MenuItem[] = [
  { title: 'Account Settings', icon: 'settings-outline', section: 'account' },
  { title: 'Silenced people', icon: 'eye-off-outline', section: 'silenced' },
  { title: 'Notifications', icon: 'notifications-outline', section: 'notifications' },
  { title: 'History', icon: 'time-outline', section: 'history' },
  { title: 'Cheers', icon: 'star-outline', section: 'cheers' },
  { title: 'Badges', icon: 'ribbon-outline', section: 'badges' },
  { title: 'Submit Feedback', icon: 'chatbubble-ellipses-outline', section: 'feedback' },
]

/** The settings shortcuts under the profile hero. Navigation is the caller's (`onOpen`). */
export function ProfileMenu({ onOpen }: Props) {
  return (
    <View style={[shared.card, { gap: 0, marginTop: theme.spacing.lg, padding: 0, overflow: 'hidden' }]}>
      {MENU_ITEMS.map((item, idx) => (
        <Pressable
          key={item.section}
          onPress={() => onOpen(item.section)}
          accessibilityRole="button"
          accessibilityLabel={item.title}
          style={({ pressed }) => [
            styles.row,
            idx < MENU_ITEMS.length - 1 && styles.rowBorder,
            pressed && { backgroundColor: theme.colors.background },
          ]}
        >
          <View style={styles.rowIcon}>
            <Ionicons name={item.icon} size={18} color={theme.colors.primary} />
          </View>
          <Text style={styles.rowTitle}>{item.title}</Text>
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
  rowTitle: {
    flex: 1,
    fontFamily: theme.fonts.bodyMedium,
    fontSize: theme.font.size.md,
    color: theme.colors.text,
  },
})
