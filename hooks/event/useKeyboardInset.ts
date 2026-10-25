import { useEffect, useState } from 'react'
import { Keyboard, Platform, type KeyboardEvent } from 'react-native'

/**
 * Height of the on-screen keyboard while `active` (native only; web lets the
 * browser resize the viewport). Resets to 0 when inactive.
 */
export function useKeyboardInset(active: boolean): number {
  const [inset, setInset] = useState(0)
  useEffect(() => {
    if (!active) {
      setInset(0)
      return
    }
    if (Platform.OS === 'web') return
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow'
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide'
    const subShow = Keyboard.addListener(showEvt, (e: KeyboardEvent) => setInset(e.endCoordinates.height))
    const subHide = Keyboard.addListener(hideEvt, () => setInset(0))
    return () => {
      subShow.remove()
      subHide.remove()
      setInset(0)
    }
  }, [active])
  return inset
}
