import {
  bumpVersion,
  getVersion,
  subscribe,
  eventKey,
  shouldRefetch,
  __resetDataVersions,
} from '../lib/dataVersion'

beforeEach(() => {
  __resetDataVersions()
})

describe('eventKey', () => {
  it('namespaces ids so an event cannot collide with another entity type', () => {
    expect(eventKey('abc')).toBe('event:abc')
    expect(eventKey('abc')).not.toBe('abc')
  })
})

describe('bumpVersion / getVersion', () => {
  it('starts every key at 0', () => {
    expect(getVersion(eventKey('e1'))).toBe(0)
  })

  it('increments only the bumped key', () => {
    bumpVersion(eventKey('e1'))
    expect(getVersion(eventKey('e1'))).toBe(1)
    expect(getVersion(eventKey('e2'))).toBe(0)
  })

  it('accumulates across repeated bumps', () => {
    bumpVersion(eventKey('e1'))
    bumpVersion(eventKey('e1'))
    bumpVersion(eventKey('e1'))
    expect(getVersion(eventKey('e1'))).toBe(3)
  })
})

describe('subscribe', () => {
  it('notifies listeners on bump', () => {
    const listener = jest.fn()
    subscribe(listener)
    bumpVersion(eventKey('e1'))
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('notifies every listener', () => {
    const a = jest.fn()
    const b = jest.fn()
    subscribe(a)
    subscribe(b)
    bumpVersion(eventKey('e1'))
    expect(a).toHaveBeenCalledTimes(1)
    expect(b).toHaveBeenCalledTimes(1)
  })

  it('stops notifying after unsubscribe', () => {
    const listener = jest.fn()
    const unsubscribe = subscribe(listener)
    unsubscribe()
    bumpVersion(eventKey('e1'))
    expect(listener).not.toHaveBeenCalled()
  })

  it('survives a listener that unsubscribes itself during the notification', () => {
    // React can detach a subscriber while the store is iterating (unmount inside
    // a render pass). Mutating the live set here would skip the next listener.
    const calls: string[] = []
    const unsubA = subscribe(() => {
      calls.push('a')
      unsubA()
    })
    subscribe(() => calls.push('b'))
    expect(() => bumpVersion(eventKey('e1'))).not.toThrow()
    expect(calls).toEqual(['a', 'b'])
  })
})

describe('shouldRefetch', () => {
  const base = { version: 0, seenVersion: 0, lastFetchedAt: 1_000, now: 1_000, staleAfterMs: 30_000 }

  it('skips a fresh fetch when nothing was mutated', () => {
    expect(shouldRefetch({ ...base, now: 1_000 + 29_000 })).toBe(false)
  })

  it('refetches once the staleness window has passed', () => {
    expect(shouldRefetch({ ...base, now: 1_000 + 30_001 })).toBe(true)
  })

  it('refetches on a version change even one millisecond after fetching', () => {
    // This is the #34 regression: an edit round-trip finishes well inside the
    // staleness window, so only the version signal can catch it.
    expect(shouldRefetch({ ...base, version: 1, seenVersion: 0, now: 1_001 })).toBe(true)
  })

  it('does not refetch again once the new version has been seen', () => {
    expect(shouldRefetch({ ...base, version: 1, seenVersion: 1, now: 1_001 })).toBe(false)
  })

  it('catches a version that jumped by more than one (two saves before returning)', () => {
    expect(shouldRefetch({ ...base, version: 3, seenVersion: 1, now: 1_001 })).toBe(true)
  })

  it('treats the exact boundary as not-yet-stale', () => {
    expect(shouldRefetch({ ...base, now: 1_000 + 30_000 })).toBe(false)
  })
})

describe('end-to-end signal: edit screen writes, detail screen reads', () => {
  it('a mutation to one event does not force a refetch of a different event', () => {
    const key = eventKey('other')
    const seen = getVersion(key)
    bumpVersion(eventKey('edited'))
    expect(
      shouldRefetch({
        version: getVersion(key),
        seenVersion: seen,
        lastFetchedAt: 1_000,
        now: 1_100,
        staleAfterMs: 30_000,
      }),
    ).toBe(false)
  })

  it('a mutation to the viewed event forces a refetch immediately', () => {
    const key = eventKey('viewed')
    const seen = getVersion(key)
    bumpVersion(key)
    expect(
      shouldRefetch({
        version: getVersion(key),
        seenVersion: seen,
        lastFetchedAt: 1_000,
        now: 1_100,
        staleAfterMs: 30_000,
      }),
    ).toBe(true)
  })
})
