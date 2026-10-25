import { useEffect, useReducer } from 'react'
import type { RemoveDialogAction as Action, RemoveDialogState as State, RemoveTarget } from '../../types'

// target / armed always change together (open → arm → close), so one reducer.

const initial: State = { target: null, armed: false }

function reducer(s: State, a: Action): State {
  switch (a.type) {
    case 'open': return s.target ? s : { target: a.target, armed: false }
    case 'arm': return s.target ? { ...s, armed: true } : s
    case 'close': return initial
  }
}

/** How long after opening the dialog ignores presses. */
export const REMOVE_DIALOG_ARM_MS = 250

/**
 * Open/close state for the host's "Remove attendee?" confirm. The dialog
 * ignores presses for the first 250ms so the ghost mouseup/pointerup from the
 * X that opened it can't immediately confirm or dismiss it.
 */
export function useRemoveDialog() {
  const [state, dispatch] = useReducer(reducer, initial)

  useEffect(() => {
    if (state.target === null) return
    const t = setTimeout(() => dispatch({ type: 'arm' }), REMOVE_DIALOG_ARM_MS)
    return () => clearTimeout(t)
  }, [state.target])

  return {
    target: state.target,
    armed: state.armed,
    open: (target: RemoveTarget) => dispatch({ type: 'open', target }),
    close: () => dispatch({ type: 'close' }),
  }
}
