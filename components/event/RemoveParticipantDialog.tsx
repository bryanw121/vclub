import React from 'react'
import { ConfirmDialog } from '../ui'
import type { RemoveTarget } from '../../types'

type Props = {
  target: RemoveTarget | null
  /** False for the first moments after opening: presses are ignored (ghost-click guard). */
  armed: boolean
  removing: boolean
  onCancel: () => void
  onConfirm: () => void
}

/** Host confirm for removing an attendee or +1 from the roster. */
export function RemoveParticipantDialog({ target, armed, removing, onCancel, onConfirm }: Props) {
  return (
    <ConfirmDialog
      visible={target !== null}
      title={target?.kind === 'guest' ? 'Remove guest?' : 'Remove attendee?'}
      body="This person will be removed from the event. They can rejoin if there is space."
      confirmLabel="Remove"
      destructive
      loading={removing}
      onCancel={() => { if (armed) onCancel() }}
      onConfirm={() => { if (armed && !removing) onConfirm() }}
    />
  )
}
