import React from 'react'
import { readFileSync } from 'fs'
import { join } from 'path'
import { act, render } from '@testing-library/react-native'
import { __resetQueryCache, getQueryData, setQueryData, useQuery } from '../lib/query'
import { useCacheUserScope, USER_SCOPED_PREFIXES } from '../hooks/useCacheUserScope'

jest.mock('expo-router', () => ({ useFocusEffect: () => {} }))
const mockSession = { userId: 'a' as string | null, loading: false, isGuest: false, session: null }
jest.mock('../contexts/session', () => ({ useSession: () => mockSession }))

function Scope() {
  useCacheUserScope()
  return null
}

function seed() {
  for (const p of USER_SCOPED_PREFIXES) setQueryData(`${p}:x`, 'old')
  setQueryData('feed:month:2030-01', 'feed')
  setQueryData('tags:all', 'tags')
}

async function flush() {
  await act(async () => { await new Promise(r => setTimeout(r, 0)) })
}

beforeEach(() => {
  __resetQueryCache()
  mockSession.userId = 'a'
  mockSession.loading = false
})

describe('useCacheUserScope', () => {
  it('drops user-scoped entries on sign-out, keeps feed (reset by useMonthEvents) and tags', () => {
    const view = render(<Scope />)
    seed()
    mockSession.userId = null
    view.rerender(<Scope />)
    for (const p of ['event', 'tournament', 'club', 'conversations', 'conversation', 'profile']) {
      expect(getQueryData(`${p}:x`)).toBeUndefined()
    }
    expect(getQueryData('feed:month:2030-01')).toBe('feed')
    expect(getQueryData('tags:all')).toBe('tags')
  })

  it('also drops them when switching to another user', () => {
    const view = render(<Scope />)
    seed()
    mockSession.userId = 'b'
    view.rerender(<Scope />)
    expect(getQueryData('profile:x')).toBeUndefined()
  })

  it('leaves the cache alone on the first restore and on re-renders with the same user', () => {
    mockSession.loading = true
    mockSession.userId = null
    const view = render(<Scope />)
    seed()
    mockSession.loading = false
    mockSession.userId = 'a'
    view.rerender(<Scope />)
    view.rerender(<Scope />)
    expect(getQueryData('event:x')).toBe('old')
  })

  it('refetches a still-mounted reader for the new user (e.g. an event page under the login screen)', async () => {
    mockSession.userId = null
    let fetches = 0
    function EventPage() {
      useQuery('event:e1', async () => { fetches++; return { viewer: mockSession.userId } })
      return null
    }
    const view = render(<><Scope /><EventPage /></>)
    await flush()
    expect(fetches).toBe(1)
    mockSession.userId = 'a'
    view.rerender(<><Scope /><EventPage /></>)
    await flush()
    expect(fetches).toBe(2)
    expect(getQueryData('event:e1')).toEqual({ viewer: 'a' })
  })

  it('is mounted from the root layout', () => {
    const layout = readFileSync(join(__dirname, '..', 'app/_layout.tsx'), 'utf8')
    expect(layout).toMatch(/useCacheUserScope\(\)/)
  })
})
