import { TouchableOpacity, Text, ActivityIndicator } from 'react-native'
import { shared } from '../constants'
import { theme } from '../constants'

type Variant = 'primary' | 'secondary' | 'danger'

type Props = {
  label: string
  onPress: () => void
  loading?: boolean
  variant?: Variant
  disabled?: boolean
}

export function Button({ label, onPress, loading, variant = 'primary', disabled }: Props) {
  const buttonStyle = {
    primary: shared.buttonPrimary,
    secondary: shared.buttonSecondary,
    danger: shared.buttonDanger,
  }[variant]

  const labelStyle = variant === 'primary' || variant === 'danger'
    ? shared.buttonLabelPrimary
    : shared.buttonLabelSecondary

  return (
    <TouchableOpacity
      style={[shared.buttonBase, buttonStyle, (disabled || loading) && shared.buttonDisabled]}
      onPress={onPress}
      disabled={disabled || loading}
    >
      {loading
        ? <ActivityIndicator color={variant === 'primary' ? theme.colors.white : theme.colors.primary} />
        : <Text style={labelStyle}>{label}</Text>
      }
    </TouchableOpacity>
  )
}
