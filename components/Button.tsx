import { TouchableOpacity, Text, ActivityIndicator, StyleProp, ViewStyle } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { shared, theme } from '../constants'
import type { IoniconName } from '../types'

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost'
type Size = 'sm' | 'md'
type Props = {
  label: string
  onPress: () => void
  loading?: boolean
  variant?: Variant
  disabled?: boolean
  /** 'md' (default) is the existing look; 'sm' is a compact 36pt-tall button. */
  size?: Size
  /** Leading icon, coloured to match the label. */
  icon?: IoniconName
  style?: StyleProp<ViewStyle>
  accessibilityLabel?: string
  /** Default true (stretch to the parent, as before). False shrinks to content. */
  fullWidth?: boolean
  testID?: string
}

export function Button({
  label, onPress, loading, variant = 'primary', disabled,
  size = 'md', icon, style, accessibilityLabel, fullWidth = true, testID,
}: Props) {
  const buttonStyle = {
    primary: shared.buttonPrimary,
    secondary: shared.buttonSecondary,
    danger: shared.buttonDanger,
    ghost: shared.buttonGhost,
  }[variant]
  const tinted = variant === 'secondary' || variant === 'ghost'
  const labelStyle = tinted ? shared.buttonLabelSecondary : shared.buttonLabelPrimary
  const inactive = !!(disabled || loading)
  const contentColor = tinted ? theme.colors.primary : theme.colors.onPrimary
  const iconSize = size === 'sm' ? 14 : 16

  return (
    <TouchableOpacity
      style={[
        shared.buttonBase,
        buttonStyle,
        size === 'sm' && shared.buttonSm,
        !fullWidth && shared.buttonAuto,
        !!icon && !loading && shared.buttonWithIcon,
        inactive && shared.buttonDisabled,
        style,
      ]}
      onPress={onPress}
      disabled={inactive}
      testID={testID}
      accessibilityLabel={accessibilityLabel}
      accessibilityState={inactive ? { disabled: true, busy: !!loading } : undefined}
    >
      {loading
        ? <ActivityIndicator color={tinted ? theme.colors.primary : theme.colors.white} />
        : (
          <>
            {icon && <Ionicons name={icon} size={iconSize} color={contentColor} />}
            <Text style={[labelStyle, size === 'sm' && shared.buttonLabelSm]}>{label}</Text>
          </>
        )
      }
    </TouchableOpacity>
  )
}
