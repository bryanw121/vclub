import { compareVersions, isBelowMinimum } from '../utils/appVersion'

describe('compareVersions', () => {
  it('compares numerically, not as strings', () => {
    expect(compareVersions('1.10.0', '1.9.0')).toBe(1)
    expect(compareVersions('1.9.9', '1.10.0')).toBe(-1)
  })
  it('treats missing parts as zero', () => {
    expect(compareVersions('1.2', '1.2.0')).toBe(0)
    expect(compareVersions('2', '1.99.99')).toBe(1)
  })
  it('ignores pre-release suffixes', () => {
    expect(compareVersions('1.2.0-beta.1', '1.2.0')).toBe(0)
  })
})

describe('isBelowMinimum', () => {
  it('blocks only when the install is older than the minimum', () => {
    expect(isBelowMinimum('1.0.0', '1.1.0')).toBe(true)
    expect(isBelowMinimum('1.1.0', '1.1.0')).toBe(false)
    expect(isBelowMinimum('1.2.0', '1.1.0')).toBe(false)
  })
  it('never blocks without a minimum', () => {
    expect(isBelowMinimum('1.0.0', null)).toBe(false)
    expect(isBelowMinimum('1.0.0', '')).toBe(false)
  })
})
