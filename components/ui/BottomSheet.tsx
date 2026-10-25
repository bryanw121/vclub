import { KeyboardAvoidingView, Modal, Platform, Text, TouchableOpacity, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { shared, theme } from '../../constants'
import type { BottomSheetProps } from '../../types'

/**
 * Slide-up sheet on a transparent Modal: tap the empty area above it (or hardware back) to dismiss.
 * Like the tournament sheets it replaces, there is no dimming scrim. Padding-bottom adds the
 * safe-area inset, and the sheet lifts above the keyboard on native.
 */
export function BottomSheet({ visible, onDismiss, title, children }: BottomSheetProps) {
  const insets = useSafeAreaInsets()
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onDismiss}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={shared.sheetRoot}>
        <TouchableOpacity
          style={{ flex: 1 }}
          activeOpacity={1}
          onPress={onDismiss}
          accessibilityLabel="Dismiss"
          testID="bottom-sheet-backdrop"
        />
        <View style={[shared.sheetCard, { paddingBottom: insets.bottom + theme.spacing.lg }]} testID="bottom-sheet">
          <View style={shared.sheetHandle} />
          {!!title && <Text style={shared.sheetTitle} accessibilityRole="header">{title}</Text>}
          {children}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}
