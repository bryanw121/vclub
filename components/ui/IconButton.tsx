import { TouchableOpacity, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { shared, theme } from '../../constants'
import type { IconButtonProps } from '../../types'

/** Square bordered icon button (the notifications bell). 38pt by default; use 44 where touch targets matter. */
export function IconButton({ icon, onPress, label, size = 38, active, badge, testID }: IconButtonProps) {
  return (
    <TouchableOpacity
      testID={testID}
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={active === undefined ? undefined : { selected: active }}
      style={[shared.iconButton, { width: size, height: size }]}
    >
      <View>
        <Ionicons
          name={icon}
          size={size === 44 ? 20 : 18}
          color={active ? theme.colors.primary : theme.colors.text}
        />
        {!!badge && <View style={shared.iconButtonDot} testID={testID ? `${testID}-badge` : undefined} />}
      </View>
    </TouchableOpacity>
  )
}
