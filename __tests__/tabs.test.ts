import { tabIndexFromPath } from '../utils/tabs'

describe('tabIndexFromPath', () => {
  it('maps URLs to pager tabs', () => {
    expect(tabIndexFromPath('/')).toBe(0)
    expect(tabIndexFromPath('/clubs')).toBe(1)
    expect(tabIndexFromPath('/club/abc')).toBe(1)
    expect(tabIndexFromPath('/chat')).toBe(2)
    expect(tabIndexFromPath('/profile')).toBe(3)
    expect(tabIndexFromPath('/settings/account')).toBe(3)
  })
})
