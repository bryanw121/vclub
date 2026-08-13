import React from 'react'
import { ActivityIndicator, Pressable, Text } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { theme } from '../constants/theme'

/**
 * Header action button for the event page.
 *
 * Always at least 44pt tall (Apple HIG / Material / the ≥44pt rule in
 * CLAUDE.md). Labelled variants exist because the two actions hosts and
 * players actually reach for — Share and Edit — were previously unlabelled
 * 36pt glyphs sitting next to an identically-sized Delete.
 *
 * `variant`: primary = filled (Edit), secondary = outlined but clearly a
 * button (Share), plain = icon-only, reserved for back and the ⋯ overflow.
 */
export const HEADER_ACTION_MIN = 44

export function HeaderAction({
  icon, label, onPress, variant = 'plain', busy, tone, accessibilityLabel, onLayout, testID,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name']
  label?: string
  onPress: () => void
  variant?: 'primary' | 'secondary' | 'plain'
  busy?: boolean
  tone?: string
  accessibilityLabel?: string
  onLayout?: (e: any) => void
  /** Forwarded so e2e can target a specific header action (see event-edit-button). */
  testID?: string
}) {
  const filled = variant === 'primary'
  const outlined = variant === 'secondary'
  const fg = tone ?? (filled ? theme.colors.white : theme.colors.text)
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      onLayout={onLayout}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label ?? String(icon)}
      style={({ pressed }) => [
        {
          minHeight: HEADER_ACTION_MIN,
          minWidth: HEADER_ACTION_MIN,
          paddingHorizontal: label ? theme.spacing.md : 0,
          borderRadius: theme.radius.full,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: label ? 6 : 0,
        },
        filled && { backgroundColor: theme.colors.primary },
        outlined && {
          backgroundColor: theme.colors.card,
          borderWidth: 1,
          borderColor: theme.colors.border,
        },
        pressed && (filled ? { opacity: 0.85 } : { backgroundColor: theme.colors.primary + '14' }),
      ]}
    >
      {busy
        ? <ActivityIndicator size="small" color={fg} />
        : <Ionicons name={icon} size={19} color={fg} />}
      {!!label && (
        <Text
          numberOfLines={1}
          style={{
            fontFamily: theme.fonts.bodySemiBold,
            fontSize: theme.font.size.md,
            fontWeight: theme.font.weight.semibold,
            color: fg,
          }}
        >
          {label}
        </Text>
      )}
    </Pressable>
  )
}
