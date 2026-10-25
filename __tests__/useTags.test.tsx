import React from 'react'
import { Text } from 'react-native'
import { render, act } from '@testing-library/react-native'
import { __resetQueryCache, getQueryData } from '../lib/query'
import { TAGS_KEY, fetchTags, useTags } from '../hooks/useTags'
import type { QueryResult } from '../lib/query'
import type { Tag } from '../types'

jest.mock('expo-router', () => ({ useFocusEffect: () => {} }))

type Result = { data: unknown; error: unknown }
let mockCalls: { columns: string; order?: [string, unknown] }[]
let mockQueued: Result[]

jest.mock('../lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      if (table !== 'tags') throw new Error(`unexpected table ${table}`)
      return {
        select: (columns: string) => {
          const call: { columns: string; order?: [string, unknown] } = { columns }
          mockCalls.push(call)
          return {
            order: (col: string, opts: unknown) => {
              call.order = [col, opts]
              return Promise.resolve(mockQueued.shift() ?? { data: [], error: null })
            },
          }
        },
      }
    },
  },
}))

const TAGS = [
  { id: 't1', name: 'Open Play', category: 'event_type', display_order: 1 },
  { id: 't2', name: 'B', category: 'skill_level', display_order: 2 },
] as unknown as Tag[]

let tags: QueryResult<Tag[]>

function Probe() {
  tags = useTags()
  return <Text>{tags.data ? tags.data.map(t => t.name).join(',') : tags.isLoading ? 'loading' : 'none'}</Text>
}

async function flush() {
  await act(async () => {
    for (let i = 0; i < 6; i++) await Promise.resolve()
  })
}

beforeEach(() => {
  __resetQueryCache()
  mockCalls = []
  mockQueued = []
})

describe('fetchTags', () => {
  it('selects explicit columns in display order', async () => {
    mockQueued = [{ data: TAGS, error: null }]
    await expect(fetchTags()).resolves.toEqual(TAGS)
    expect(mockCalls).toHaveLength(1)
    expect(mockCalls[0].columns).toBe('id, name, category, display_order')
    expect(mockCalls[0].columns).not.toContain('*')
    expect(mockCalls[0].order).toEqual(['display_order', { ascending: true }])
  })

  it('throws on a Supabase error so the cache keeps the last good list', async () => {
    mockQueued = [{ data: null, error: { message: 'down' } }]
    await expect(fetchTags()).rejects.toEqual({ message: 'down' })
  })
})

describe('useTags', () => {
  it('loads once and shares one cache entry between readers', async () => {
    mockQueued = [{ data: TAGS, error: null }]
    const view = render(<><Probe /><Probe /></>)
    await flush()
    expect(view.getAllByText('Open Play,B')).toHaveLength(2)
    expect(mockCalls).toHaveLength(1)
    expect(getQueryData(TAGS_KEY)).toEqual(TAGS)
  })

  it('is fresh for ten minutes: remounting does not refetch', async () => {
    mockQueued = [{ data: TAGS, error: null }]
    const first = render(<Probe />)
    await flush()
    first.unmount()
    render(<Probe />)
    await flush()
    expect(mockCalls).toHaveLength(1)
    expect(tags.data).toEqual(TAGS)
  })

  it('keeps showing the tags when a later refetch fails', async () => {
    mockQueued = [{ data: TAGS, error: null }, { data: null, error: { message: 'down' } }]
    render(<Probe />)
    await flush()
    await act(async () => { await tags.refetch({ force: true }) })
    expect(tags.data).toEqual(TAGS)
    expect(tags.error?.message).toBe('down')
  })
})
