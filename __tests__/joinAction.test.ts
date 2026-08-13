import { resolveJoinAction, type JoinAction } from '../utils'

type State = Parameters<typeof resolveJoinAction>[0]

const base: State = {
  isAttending: false,
  isWaitlisted: false,
  isRequested: false,
  isDenied: false,
  isFull: false,
  requiresApproval: false,
}

const at = (over: Partial<State>) => resolveJoinAction({ ...base, ...over })

describe('resolveJoinAction — approval is independent of price', () => {
  it('offers a plain join on an open event with space', () => {
    expect(at({})).toBe('join')
  })

  it('offers a request when the host requires approval', () => {
    expect(at({ requiresApproval: true })).toBe('request')
  })

  it('offers a plain join on a FREE event that does NOT require approval', () => {
    // Previously equivalent to "price === 0", which is the behaviour we keep.
    expect(at({ requiresApproval: false })).toBe('join')
  })

  it('offers a request on a FREE event that DOES require approval', () => {
    // Impossible before this change — approval was inferred from price, so a
    // free event could never be screened.
    expect(at({ requiresApproval: true })).toBe('request')
  })
})

describe('resolveJoinAction — capacity beats approval', () => {
  it('waitlists a full event that requires approval', () => {
    // The regression. The old chain tested paid-ness first, so this returned
    // "request" and let the host approve past max_attendees.
    expect(at({ isFull: true, requiresApproval: true })).toBe('waitlist')
  })

  it('waitlists a full event that does not require approval', () => {
    expect(at({ isFull: true, requiresApproval: false })).toBe('waitlist')
  })

  it('never offers a plain join or request when full', () => {
    for (const requiresApproval of [true, false]) {
      expect(at({ isFull: true, requiresApproval })).not.toBe('join')
      expect(at({ isFull: true, requiresApproval })).not.toBe('request')
    }
  })
})

describe('resolveJoinAction — existing relationship wins over everything', () => {
  const overrides: Array<[Partial<State>, JoinAction]> = [
    [{ isAttending: true }, 'leave'],
    [{ isWaitlisted: true }, 'leave-waitlist'],
    [{ isRequested: true }, 'cancel-request'],
    [{ isDenied: true }, 'rerequest'],
  ]

  it.each(overrides)('%o resolves to %s regardless of capacity or approval', (over, expected) => {
    for (const isFull of [true, false]) {
      for (const requiresApproval of [true, false]) {
        expect(at({ ...over, isFull, requiresApproval })).toBe(expected)
      }
    }
  })

  it('prefers attending over a stale waitlist flag', () => {
    expect(at({ isAttending: true, isWaitlisted: true })).toBe('leave')
  })

  it('prefers a pending request over a previous denial', () => {
    // Re-requesting after a denial sets status back to 'requested'; the viewer
    // should see "Cancel Request", not "Request Again".
    expect(at({ isRequested: true, isDenied: true })).toBe('cancel-request')
  })
})

describe('resolveJoinAction — full state matrix is total', () => {
  it('returns a defined action for all 64 combinations', () => {
    const flags = ['isAttending', 'isWaitlisted', 'isRequested', 'isDenied', 'isFull', 'requiresApproval'] as const
    const valid: JoinAction[] = ['leave', 'leave-waitlist', 'cancel-request', 'rerequest', 'waitlist', 'request', 'join']
    let seen = 0
    for (let mask = 0; mask < 1 << flags.length; mask++) {
      const s = { ...base }
      flags.forEach((f, i) => { s[f] = Boolean(mask & (1 << i)) })
      const action = resolveJoinAction(s)
      expect(valid).toContain(action)
      seen++
    }
    expect(seen).toBe(64)
  })
})

describe('event page wires approval to the column, not to price', () => {
  // Guards the decoupling itself. resolveJoinAction can be perfectly correct
  // while the screen still feeds it `price > 0`, which is the bug being fixed.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { readFileSync } = require('fs')
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { resolve } = require('path')
  const source: string = readFileSync(resolve(__dirname, '../app/(app)/event/[id].tsx'), 'utf8')

  it('reads requires_approval from the event row', () => {
    expect(source).toMatch(/requiresApproval\s*=\s*event\?\.requires_approval/)
  })

  it('does not infer approval from price', () => {
    expect(source).not.toMatch(/requiresApproval\s*=\s*\(?event\?\.price/)
    expect(source).not.toMatch(/const isPaidEvent/)
  })

  it('delegates the branch order to resolveJoinAction', () => {
    expect(source).toMatch(/resolveJoinAction\(\{/)
  })
})

describe('host form persists the approval choice', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { readFileSync } = require('fs')
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { resolve } = require('path')
  const source: string = readFileSync(resolve(__dirname, '../app/(app)/host.tsx'), 'utf8')

  it('writes requires_approval on both create and edit', () => {
    // Two write paths — an insert and an update. Missing either means the
    // checkbox silently does nothing on that path.
    expect(source.match(/requires_approval: form\.requiresApproval/g) ?? []).toHaveLength(2)
  })

  it('hydrates the checkbox when editing an existing event', () => {
    expect(source).toMatch(/requiresApproval: data\.requires_approval/)
  })

  it('defaults new events to no approval, independent of price', () => {
    expect(source).toMatch(/requiresApproval: false/)
  })

  it('renders a toggle bound to the form field', () => {
    expect(source).toMatch(/value=\{form\.requiresApproval\}/)
    expect(source).toMatch(/setField\('requiresApproval'/)
  })
})
