import { clubDetailKey, clubPostsKey, fetchClubDetail, fetchClubPosts } from '../hooks/useClub'

jest.mock('expo-router', () => ({ useFocusEffect: () => {} }))

type Result = { data?: unknown; error?: { message: string } | null; count?: number | null }

let mockLog: string[]
let mockFilters: { table: string; method: string; args: unknown[] }[]
let mockResults: Record<string, Result>

/** A query mockBuilder whose every method returns itself and which resolves to the table's canned result. */
function mockBuilder(table: string): unknown {
  const chain: Record<string, unknown> = {}
  const proxy: unknown = new Proxy(chain, {
    get(_t, prop: string) {
      if (prop === 'then') {
        return (resolve: (v: Result) => unknown, reject?: (e: unknown) => unknown) =>
          Promise.resolve(mockResults[table] ?? { data: null, error: null }).then(resolve, reject)
      }
      return (...args: unknown[]) => {
        mockFilters.push({ table, method: prop, args })
        return proxy
      }
    },
  })
  return proxy
}

jest.mock('../lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      mockLog.push(`from:${table}`)
      return mockBuilder(table)
    },
    rpc: (name: string) => {
      mockLog.push(`rpc:${name}`)
      return Promise.resolve({ data: [], error: null })
    },
  },
}))

const CLUB = {
  id: 'c1',
  name: 'Vex',
  club_members: [{ club_id: 'c1', user_id: 'u1', role: 'owner', joined_at: 'x', profiles: null }],
}

beforeEach(() => {
  mockLog = []
  mockFilters = []
  mockResults = {}
})

describe('cache keys', () => {
  it('nest under the club so one invalidate(queryKey("club", id)) covers header and feed', () => {
    expect(clubDetailKey('c1', 'u1').startsWith('club:c1:')).toBe(true)
    expect(clubPostsKey('c1', 'u1').startsWith('club:c1:')).toBe(true)
    expect(clubDetailKey('c1', null)).not.toBe(clubDetailKey('c1', 'u1'))
  })
})

describe('fetchClubDetail', () => {
  it('starts club, events and the past count together, then asks for previews once', async () => {
    mockResults.clubs = { data: CLUB, error: null }
    mockResults.events = { data: [{ id: 'e1' }], error: null, count: 3 }
    const detail = await fetchClubDetail('c1', 'u1')
    // Three requests start together; the previews RPC is the only one that waits.
    expect([...mockLog.slice(0, 3)].sort()).toEqual(['from:clubs', 'from:events', 'from:events'])
    expect(mockLog.slice(3)).toEqual(['rpc:get_event_card_attendee_previews'])
    expect(detail.club?.id).toBe('c1')
    expect(detail.upcomingEvents.map(e => e.id)).toEqual(['e1'])
    expect(detail.pastCount).toBe(3)
  })

  it('filters the attendance embed to the viewer only when signed in', async () => {
    mockResults.clubs = { data: CLUB, error: null }
    await fetchClubDetail('c1', 'u1')
    expect(mockFilters).toContainEqual({ table: 'events', method: 'eq', args: ['my_attendance.user_id', 'u1'] })
    mockFilters = []
    await fetchClubDetail('c1', null)
    expect(mockFilters.some(f => f.args[0] === 'my_attendance.user_id')).toBe(false)
  })

  it('returns club: null (and skips the previews request) when there is no such club', async () => {
    mockResults.clubs = { data: null, error: null }
    mockResults.events = { data: [], error: null, count: 0 }
    const detail = await fetchClubDetail('nope', null)
    expect(detail.club).toBeNull()
    expect(detail.upcomingEvents).toEqual([])
    expect(mockLog).not.toContain('rpc:get_event_card_attendee_previews')
  })

  it('throws when the club request fails, so the page can offer Retry', async () => {
    mockResults.clubs = { data: null, error: { message: 'boom' } }
    await expect(fetchClubDetail('c1', 'u1')).rejects.toEqual({ message: 'boom' })
  })
})

describe('fetchClubPosts', () => {
  it('folds the embedded my_likes rows into likedPostIds in one request', async () => {
    mockResults.club_posts = {
      data: [
        { id: 'p1', club_id: 'c1', body: 'a', club_post_likes: [{ count: 2 }], club_post_comments: [], my_likes: [{ club_post_id: 'p1' }] },
        { id: 'p2', club_id: 'c1', body: 'b', club_post_likes: [{ count: 0 }], club_post_comments: [], my_likes: [] },
      ],
      error: null,
    }
    const result = await fetchClubPosts('c1', 'u1')
    expect(mockLog).toEqual(['from:club_posts'])
    expect(result.likedPostIds).toEqual(['p1'])
    expect(result.posts.map(p => p.id)).toEqual(['p1', 'p2'])
    expect(result.posts.every(p => !('my_likes' in p))).toBe(true)
    expect(mockFilters).toContainEqual({ table: 'club_posts', method: 'eq', args: ['my_likes.user_id', 'u1'] })
  })

  it('throws on a Supabase error', async () => {
    mockResults.club_posts = { data: null, error: { message: 'denied' } }
    await expect(fetchClubPosts('c1', 'u1')).rejects.toEqual({ message: 'denied' })
  })
})
