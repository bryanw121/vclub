import { useEffect, useRef } from 'react'
import { Animated, Text, View, Platform } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { theme } from '../constants/theme'

type Variant = 'error' | 'success' | 'info'

type Props = {
  message: string
  variant?: Variant
  visible: boolean
  onHide: () => void
  duration?: number
}

const VARIANTS: Record<Variant, { bg: string; icon: string; color: string }> = {
  error:   { bg: '#FFF0F0', icon: 'alert-circle',       color: theme.colors.error },
  success: { bg: '#F0FFF4', icon: 'checkmark-circle',   color: theme.colors.success },
  info:    { bg: '#F3F0FF', icon: 'information-circle', color: theme.colors.primary },
}

export function Toast({ message, variant = 'error', visible, onHide, duration = 3500 }: Props) {
  const insets = useSafeAreaInsets()
  const opacity = useRef(new Animated.Value(0)).current
  const translateY = useRef(new Animated.Value(-12)).current

  useEffect(() => {
    if (!visible) return

    Animated.parallel([
      Animated.timing(opacity,     { toValue: 1, duration: 220, useNativeDriver: true }),
      Animated.timing(translateY,  { toValue: 0, duration: 220, useNativeDriver: true }),
    ]).start()

    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(opacity,    { toValue: 0, duration: 200, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: -12, duration: 200, useNativeDriver: true }),
      ]).start(() => onHide())
    }, duration)

    return () => clearTimeout(timer)
  }, [visible])

  if (!visible) return null

  const { bg, icon, color } = VARIANTS[variant]

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        top: insets.top + theme.spacing.sm,
        left: theme.spacing.md,
        right: theme.spacing.md,
        zIndex: 9999,
        opacity,
        transform: [{ translateY }],
        borderRadius: theme.radius.lg,
        backgroundColor: bg,
        borderWidth: 1,
        borderColor: color + '33',
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.sm,
        paddingHorizontal: theme.spacing.md,
        paddingVertical: theme.spacing.sm + 2,
        ...Platform.select({
          ios: {
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.1,
            shadowRadius: 12,
          },
          android: { elevation: 6 },
          web: { boxShadow: '0 4px 16px rgba(0,0,0,0.10)' } as any,
        }),
      }}
    >
      <Ionicons name={icon as any} size={20} color={color} />
      <Text style={{
        flex: 1,
        fontSize: theme.font.size.sm,
        fontWeight: theme.font.weight.medium,
        color: theme.colors.text,
        lineHeight: theme.font.lineHeight.tight,
      }}>
        {message}
      </Text>
    </Animated.View>
  )
}
