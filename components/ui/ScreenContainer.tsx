import { Platform, useWindowDimensions, View } from 'react-native'
import { shared, theme } from '../../constants'
import type { ScreenContainerProps } from '../../types'

// Sidebar-layout breakpoint from CLAUDE.md. Phase B: import BREAKPOINTS from constants/layout.
const WIDE_WEB_MIN_WIDTH = 768

/**
 * Keeps content readable on a wide desktop browser (centered, `maxWidth` wide).
 * On native and on narrow web it is just a flex:1 View.
 */
export function ScreenContainer({ children, maxWidth = 960, padded }: ScreenContainerProps) {
  const { width } = useWindowDimensions()
  const padding = padded ? { padding: theme.spacing.lg } : null
  if (Platform.OS === 'web' && width >= WIDE_WEB_MIN_WIDTH) {
    return (
      <View style={shared.screenContainerWide}>
        <View style={[shared.screenContainerInner, { maxWidth }, padding]}>{children}</View>
      </View>
    )
  }
  return <View style={[{ flex: 1 }, padding]}>{children}</View>
}
