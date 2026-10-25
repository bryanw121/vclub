import { Text, View } from 'react-native'
import { shared } from '../../constants'
import { useOneTimeBanner } from '../../hooks/useOneTimeBanner'
import { IconButton } from './IconButton'
import type { BannerDef } from '../../types'

type Props = {
  banner: BannerDef
  /** Extra spacing from the screen (e.g. side margins on mobile). */
  style?: object
}

/**
 * Information someone needs once: shown the first time they open the screen
 * that renders it, then never again. Define banners in constants/banners.ts.
 */
export function OneTimeBanner({ banner, style }: Props) {
  const { visible, dismiss } = useOneTimeBanner(banner)
  if (!visible) return null
  return (
    <View style={[shared.oneTimeBanner, style]} accessibilityRole="summary" testID={`banner-${banner.id}`}>
      <View style={shared.oneTimeBannerText}>
        <Text style={shared.oneTimeBannerTitle}>{banner.title}</Text>
        <Text style={shared.oneTimeBannerBody}>{banner.body}</Text>
      </View>
      <IconButton icon="close" label="Dismiss" size={44} onPress={dismiss} testID={`banner-${banner.id}-dismiss`} />
    </View>
  )
}
