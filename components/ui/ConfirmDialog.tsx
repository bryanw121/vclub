import { Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import { shared, theme } from '../../constants'
import { Button } from '../Button'
import type { ConfirmDialogProps } from '../../types'

/**
 * Centered confirm/cancel dialog. Backdrop and card are siblings (not nested touchables)
 * so Cancel cannot bubble to the backdrop and double-close. While `loading`, the backdrop,
 * hardware back and Cancel are inert so a pending request cannot be abandoned half-way.
 */
export function ConfirmDialog({
  visible, title, body, confirmLabel, cancelLabel = 'Cancel',
  destructive, onConfirm, onCancel, loading,
}: ConfirmDialogProps) {
  const dismiss = () => { if (!loading) onCancel() }
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={dismiss}>
      <View style={shared.modalOverlayPlain} testID="confirm-dialog">
        <Pressable
          style={[StyleSheet.absoluteFillObject, { backgroundColor: theme.colors.overlay }]}
          onPress={dismiss}
          accessibilityLabel="Dismiss"
          testID="confirm-dialog-backdrop"
        />
        <View style={shared.dialogCard} accessibilityViewIsModal>
          <Text style={shared.dialogTitle} accessibilityRole="header">{title}</Text>
          {!!body && <Text style={shared.dialogBody}>{body}</Text>}
          <View style={shared.dialogActions}>
            <View style={shared.dialogAction}>
              <Button label={cancelLabel} variant="secondary" onPress={onCancel} disabled={loading} testID="confirm-dialog-cancel" />
            </View>
            <View style={shared.dialogAction}>
              <Button
                label={confirmLabel}
                variant={destructive ? 'danger' : 'primary'}
                onPress={onConfirm}
                loading={loading}
                testID="confirm-dialog-confirm"
              />
            </View>
          </View>
        </View>
      </View>
    </Modal>
  )
}
