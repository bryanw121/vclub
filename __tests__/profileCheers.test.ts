import { resolveReceivedCheersCount } from '../utils'

describe('resolveReceivedCheersCount', () => {
  it('uses the exact received-cheers count', () => {
    expect(resolveReceivedCheersCount({ count: 12, error: null }, 3)).toBe(12)
  })

  it('normalizes a successful null count to zero', () => {
    expect(resolveReceivedCheersCount({ count: null, error: null }, 3)).toBe(0)
  })

  it('keeps the last known count when refresh fails', () => {
    expect(resolveReceivedCheersCount({ count: null, error: new Error('offline') }, 12)).toBe(12)
  })
})
