import { Platform, useWindowDimensions, View } from 'react-native'
import { shared, theme } from '../../constants'
import type { ScreenContainerProps } from '../../types'
import { BREAKPOINTS } from '../../constants/layout'


/**
 * Keeps content readable on a wide desktop browser (centered, `maxWidth` wide).
 * On native and on narrow web it is just a flex:1 View.
 */
export function ScreenContainer({ children, maxWidth = 960, padded }: ScreenContainerProps) {
  const { width } = useWindowDimensions()
  const padding = padded ? { padding: theme.spacing.lg } : null
  if (Platform.OS === 'web' && width >= BREAKPOINTS.sidebar) {
    return (
      <View style={shared.screenContainerWide}>
        <View style={[shared.screenContainerInner, { maxWidth }, padding]}>{children}</View>
      </View>
    )
  }
  return <View style={[{ flex: 1 }, padding]}>{children}</View>
}
