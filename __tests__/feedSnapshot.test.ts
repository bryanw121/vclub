import { usableSnapshot, SNAPSHOT_MAX_AGE_MS } from '../utils/feedSnapshot'

const NOW = 1_800_000_000_000
const event = { id: 'e1', title: 'Open play', event_date: '2026-10-30T00:00:00Z' }

describe('usableSnapshot', () => {
  it('accepts a recent snapshot for a guest or a user', () => {
    expect(usableSnapshot({ v: 1, savedAt: NOW - 1000, owner: null, months: { '2026-10': [event] } }, NOW)?.months['2026-10']).toHaveLength(1)
    expect(usableSnapshot({ v: 1, savedAt: NOW, owner: 'u1', months: { '2026-10': [] } }, NOW)?.owner).toBe('u1')
  })

  it('rejects old, other-version and malformed snapshots', () => {
    expect(usableSnapshot({ v: 1, savedAt: NOW - SNAPSHOT_MAX_AGE_MS - 1, owner: null, months: { '2026-10': [] } }, NOW)).toBeNull()
    expect(usableSnapshot({ v: 2, savedAt: NOW, owner: null, months: { '2026-10': [] } }, NOW)).toBeNull()
    expect(usableSnapshot({ v: 1, savedAt: NOW, owner: 5, months: { '2026-10': [] } }, NOW)).toBeNull()
    expect(usableSnapshot({ v: 1, savedAt: NOW, owner: null, months: {} }, NOW)).toBeNull()
    expect(usableSnapshot('nope', NOW)).toBeNull()
    expect(usableSnapshot(null, NOW)).toBeNull()
  })

  it('drops month entries that are not YYYY-MM arrays', () => {
    const s = usableSnapshot({ v: 1, savedAt: NOW, owner: null, months: { '2026-10': [event], bogus: [event], '2026-11': 'x' } }, NOW)
    expect(Object.keys(s!.months)).toEqual(['2026-10'])
  })
})
