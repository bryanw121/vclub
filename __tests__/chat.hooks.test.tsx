import { act, renderHook } from '@testing-library/react-native'
import type { RealtimeBinding, RealtimeOptions } from '../lib/realtime'

// ── Mocks ────────────────────────────────────────────────────────────────────

type Result = { data: unknown; error: unknown }
type Call = { table: string; ops: Array<[string, unknown[]]> }

const calls: Call[] = []
/** Per-table responder: decides the result from the recorded chain. */
const tables: Record<string, (call: Call) => Result> = {}
const mockRpc = jest.fn<Promise<Result>, [string, unknown?]>()

function mockBuilder(table: string) {
  const call: Call = { table, ops: [] }
  calls.push(call)
  const resolve = () => Promise.resolve((tables[table] ?? (() => ({ data: [], error: null })))(call))
  const b: Record<string, unknown> = {}
  for (const op of ['select', 'eq', 'neq', 'order', 'limit', 'lt', 'in', 'or', 'insert', 'update', 'delete']) {
    b[op] = (...args: unknown[]) => {
      call.ops.push([op, args])
      return b
    }
  }
  b.single = () => { call.ops.push(['single', []]); return resolve() }
  b.maybeSingle = () => { call.ops.push(['maybeSingle', []]); return resolve() }
  b.then = (ok: (r: Result) => unknown, fail?: (e: unknown) => unknown) => resolve().then(ok, fail)
  return b
}

jest.mock('../lib/supabase', () => ({
  supabase: {
    rpc: (...args: [string, unknown?]) => mockRpc(...args),
    from: (table: string) => mockBuilder(table),
    storage: { from: () => ({ upload: async () => ({ error: null }), getPublicUrl: () => ({ data: { publicUrl: 'u' } }) }) },
  },
}))

/** Captured realtime mockSubscribers, by topic (lib/realtime itself has its own tests). */
const mockSubscribers = new Map<string, Array<{ bindings: { current: RealtimeBinding[] }; opts?: RealtimeOptions }>>()
jest.mock('../lib/realtime', () => {
  const React = require('react')
  return {
    useRealtimeChannel: (topic: string | null, bindings: RealtimeBinding[], opts?: RealtimeOptions) => {
      const ref = React.useRef(null)
      if (!ref.current) ref.current = { bindings: { current: bindings }, opts }
      ref.current.bindings.current = bindings
      ref.current.opts = opts
      const enabled = opts?.enabled ?? true
      React.useEffect(() => {
        if (!topic || !enabled) return
        const list = mockSubscribers.get(topic) ?? []
        list.push(ref.current)
        mockSubscribers.set(topic, list)
        return () => {
          const l = mockSubscribers.get(topic) ?? []
          mockSubscribers.set(topic, l.filter((s: unknown) => s !== ref.current))
        }
      }, [topic, enabled])
    },
  }
})

jest.mock('../contexts/session', () => ({
  useSession: () => ({ session: null, userId: 'me', isGuest: false, loading: false }),
}))
jest.mock('expo-router', () => ({ useFocusEffect: () => {} }))

/** Deliver a change to every subscriber of `topic` whose binding matches (as lib/realtime does). */
function emit(topic: string, table: string, event: 'INSERT' | 'UPDATE' | 'DELETE', payload: Record<string, unknown>) {
  for (const sub of mockSubscribers.get(topic) ?? []) {
    for (const b of sub.bindings.current) {
      if (b.table === table && (b.event === event || b.event === '*')) b.handler({ eventType: event, ...payload })
    }
  }
}

import { __resetQueryCache, getQueryData, setQueryData } from '../lib/query'
import {
  __resetConversationsStore,
  conversationsKey,
  markConversationReadLocally,
  profileBriefKey,
  useConversations,
  useConversationsQuery,
} from '../hooks/useConversations'
import { useMessages, MARK_READ_DEBOUNCE_MS } from '../hooks/useMessages'
import type { ConversationRow, MessageWithDetails } from '../types'

async function flush() {
  await act(async () => {
    for (let i = 0; i < 6; i++) await Promise.resolve()
  })
}

function conv(over: Partial<ConversationRow> = {}): ConversationRow {
  return {
    conversation_id: 'c1', type: 'dm', club_id: null, created_at: '2026-10-01T00:00:00.000Z',
    last_message_id: 'm1', last_message_content: 'old', last_message_image_url: null,
    last_message_at: '2026-10-24T19:00:00.000Z', last_message_deleted_at: null, last_sender_id: 'them',
    last_sender_username: null, last_sender_first_name: null, last_sender_last_name: null, unread_count: 0,
    other_user_id: 'them', other_user_username: 'jexy', other_user_first_name: null, other_user_last_name: null,
    other_user_avatar_url: null, other_user_selected_border: null, club_name: null, club_avatar_url: null,
    my_last_read_at: null, ...over,
  }
}

const them = { id: 'them', username: 'jexy', first_name: 'Jex', last_name: null, avatar_url: null, selected_border: null }

function msg(over: Partial<MessageWithDetails> = {}): MessageWithDetails {
  return {
    id: 'm1', conversation_id: 'c1', sender_id: 'them', content: 'hello', image_url: null, reply_to_id: null,
    created_at: '2026-10-24T19:00:00.000Z', deleted_at: null, edited_at: null, profiles: them, message_reactions: [],
    reply_to: null, ...over,
  }
}

const markReadCalls = () => mockRpc.mock.calls.filter(c => c[0] === 'mark_conversation_read').length
const conversationRpcCalls = () => mockRpc.mock.calls.filter(c => c[0] === 'get_my_conversations').length

beforeEach(() => {
  jest.useFakeTimers()
  __resetQueryCache()
  __resetConversationsStore()
  mockSubscribers.clear()
  calls.length = 0
  for (const k of Object.keys(tables)) delete tables[k]
  mockRpc.mockReset()
  mockRpc.mockImplementation(async (name: string) => {
    if (name === 'get_my_conversations') return { data: [conv()], error: null }
    return { data: null, error: null }
  })
})

afterEach(() => {
  jest.useRealTimers()
})

// ── Conversations store ──────────────────────────────────────────────────────

describe('shared conversations query', () => {
  it('fetches get_my_conversations once for the list, a second list and the badge', async () => {
    const list = renderHook(() => useConversations(true))
    const list2 = renderHook(() => useConversations(true))
    const badge = renderHook(() => useConversationsQuery(true))
    await flush()
    expect(conversationRpcCalls()).toBe(1)
    expect(list.result.current.conversations).toHaveLength(1)
    expect(badge.result.current.data).toHaveLength(1)
    // Both share one topic with identical bindings.
    expect(mockSubscribers.get('conversations:me')).toHaveLength(3)
    list2.unmount()
  })

  it('stays idle (cache only, no channel) while disabled', async () => {
    renderHook(() => useConversations(false))
    await flush()
    expect(conversationRpcCalls()).toBe(0)
    expect(mockSubscribers.get('conversations:me') ?? []).toHaveLength(0)
  })

  it('patches the list from a message payload, once, with no refetch', async () => {
    const list = renderHook(() => useConversations(true))
    renderHook(() => useConversationsQuery(true))
    await flush()
    act(() => {
      emit('conversations:me', 'messages', 'INSERT', {
        new: { id: 'm2', conversation_id: 'c1', sender_id: 'them', content: 'new!', image_url: null, reply_to_id: null, created_at: '2026-10-24T20:00:00.000Z', deleted_at: null, edited_at: null },
      })
    })
    jest.advanceTimersByTime(2000)
    await flush()
    const row = list.result.current.conversations[0]
    expect(row.last_message_content).toBe('new!')
    expect(row.unread_count).toBe(1) // two mockSubscribers ran the handler; applied once
    expect(conversationRpcCalls()).toBe(1)
  })

  it('ignores the echo of our own markRead, applies a read from another device', async () => {
    const list = renderHook(() => useConversations(true))
    await flush()
    act(() => {
      setQueryData<ConversationRow[]>(conversationsKey('me'), [conv({ unread_count: 2 })])
      markConversationReadLocally('me', 'c1')
    })
    expect(list.result.current.conversations[0].unread_count).toBe(0)
    act(() => {
      emit('conversations:me', 'conversation_members', 'UPDATE', { new: { conversation_id: 'c1', user_id: 'me', last_read_at: '2026-10-24T18:00:00.000Z' } })
    })
    jest.advanceTimersByTime(1000)
    await flush()
    expect(conversationRpcCalls()).toBe(1) // echo: no recount

    jest.advanceTimersByTime(11_000)
    act(() => {
      setQueryData<ConversationRow[]>(conversationsKey('me'), [conv({ unread_count: 2 })])
      emit('conversations:me', 'conversation_members', 'UPDATE', { new: { conversation_id: 'c1', user_id: 'me', last_read_at: '2026-10-24T19:30:00.000Z' } })
    })
    expect(list.result.current.conversations[0].unread_count).toBe(0)
    expect(conversationRpcCalls()).toBe(1)
  })

  it('refetches once (debounced) for a conversation it does not have', async () => {
    renderHook(() => useConversations(true))
    renderHook(() => useConversationsQuery(true))
    await flush()
    act(() => {
      emit('conversations:me', 'messages', 'INSERT', {
        new: { id: 'x', conversation_id: 'brand-new', sender_id: 'them', content: 'hey', image_url: null, reply_to_id: null, created_at: '2026-10-24T20:00:00.000Z', deleted_at: null, edited_at: null },
      })
    })
    expect(conversationRpcCalls()).toBe(1)
    act(() => { jest.advanceTimersByTime(500) })
    await flush()
    expect(conversationRpcCalls()).toBe(2)
  })

  it('refetches on reconnect', async () => {
    renderHook(() => useConversations(true))
    await flush()
    act(() => { mockSubscribers.get('conversations:me')![0].opts?.onReconnect?.() })
    act(() => { jest.advanceTimersByTime(500) })
    await flush()
    expect(conversationRpcCalls()).toBe(2)
  })
})

// ── Room ─────────────────────────────────────────────────────────────────────

function messagesSelects() {
  return calls.filter(c => c.table === 'messages' && c.ops.some(([op]) => op === 'select') && !c.ops.some(([op]) => op === 'insert'))
}

describe('useMessages', () => {
  beforeEach(() => {
    tables.messages = call => {
      if (call.ops.some(([op]) => op === 'lt')) return { data: [msg({ id: 'm0', created_at: '2026-10-20T00:00:00.000Z' })], error: null }
      return { data: [msg({ id: 'm2', created_at: '2026-10-24T19:10:00.000Z' }), msg()], error: null }
    }
    tables.profiles = () => ({ data: { id: 'stranger', username: 'new', first_name: null, last_name: null, avatar_url: null, selected_border: null }, error: null })
  })

  it('marks read once after the first page, not on pagination', async () => {
    // A full first page (40 rows), so there is an older page to load.
    const fullPage = Array.from({ length: 40 }, (_, i) =>
      msg({ id: `p${i}`, created_at: new Date(Date.UTC(2026, 9, 24, 19, 59 - i)).toISOString() }))
    tables.messages = call => (call.ops.some(([op]) => op === 'lt')
      ? { data: [msg({ id: 'm0', created_at: '2026-10-20T00:00:00.000Z' })], error: null }
      : { data: fullPage, error: null })
    const room = renderHook(() => useMessages('c1'))
    await flush()
    expect(room.result.current.messages).toHaveLength(40)
    expect(room.result.current.hasMore).toBe(true)
    expect(markReadCalls()).toBe(0)
    act(() => { jest.advanceTimersByTime(MARK_READ_DEBOUNCE_MS) })
    expect(markReadCalls()).toBe(1)

    await act(async () => { await room.result.current.loadMore() })
    act(() => { jest.advanceTimersByTime(5_000) })
    expect(room.result.current.messages).toHaveLength(41)
    expect(room.result.current.messages[40].id).toBe('m0')
    expect(markReadCalls()).toBe(1)
  })

  it('builds incoming rows from the payload (no refetch) and marks a burst read once', async () => {
    const room = renderHook(() => useMessages('c1'))
    await flush()
    act(() => { jest.advanceTimersByTime(MARK_READ_DEBOUNCE_MS) })
    const selectsBefore = messagesSelects().length
    const markBefore = markReadCalls()

    act(() => {
      for (let i = 3; i < 6; i++) {
        emit('messages:c1', 'messages', 'INSERT', {
          new: { id: `m${i}`, conversation_id: 'c1', sender_id: 'them', content: `n${i}`, image_url: null, reply_to_id: 'm1', created_at: `2026-10-24T20:0${i}:00.000Z`, deleted_at: null, edited_at: null },
        })
      }
    })
    expect(room.result.current.messages.slice(0, 3).map(m => m.id)).toEqual(['m5', 'm4', 'm3'])
    expect(room.result.current.messages[0].profiles?.username).toBe('jexy') // from the profile cache
    expect(room.result.current.messages[0].reply_to?.id).toBe('m1') // from the loaded rows
    expect(messagesSelects().length).toBe(selectsBefore)
    expect(calls.filter(c => c.table === 'profiles')).toHaveLength(0)

    act(() => { jest.advanceTimersByTime(MARK_READ_DEBOUNCE_MS) })
    expect(markReadCalls()).toBe(markBefore + 1)
  })

  it('fetches an unknown sender once and reuses it', async () => {
    const room = renderHook(() => useMessages('c1'))
    await flush()
    const ins = (id: string) => emit('messages:c1', 'messages', 'INSERT', {
      new: { id, conversation_id: 'c1', sender_id: 'stranger', content: id, image_url: null, reply_to_id: null, created_at: `2026-10-24T21:00:0${id.length}.000Z`, deleted_at: null, edited_at: null },
    })
    act(() => { ins('a') })
    await flush()
    act(() => { ins('bb') })
    await flush()
    expect(calls.filter(c => c.table === 'profiles')).toHaveLength(1)
    expect(getQueryData(profileBriefKey('stranger'))).toBeTruthy()
    expect(room.result.current.messages.filter(m => m.sender_id === 'stranger').every(m => m.profiles?.username === 'new')).toBe(true)
  })

  it('does not mark read for our own incoming echo', async () => {
    renderHook(() => useMessages('c1'))
    await flush()
    act(() => { jest.advanceTimersByTime(MARK_READ_DEBOUNCE_MS) })
    const before = markReadCalls()
    act(() => {
      emit('messages:c1', 'messages', 'INSERT', {
        new: { id: 'own', conversation_id: 'c1', sender_id: 'me', content: 'mine', image_url: null, reply_to_id: null, created_at: '2026-10-24T22:00:00.000Z', deleted_at: null, edited_at: null },
      })
    })
    act(() => { jest.advanceTimersByTime(MARK_READ_DEBOUNCE_MS * 2) })
    expect(markReadCalls()).toBe(before)
  })

  it('applies reaction payloads without refetching page 1', async () => {
    const room = renderHook(() => useMessages('c1'))
    await flush()
    const selectsBefore = messagesSelects().length
    act(() => {
      emit('reactions:c1', 'message_reactions', 'INSERT', { new: { message_id: 'm1', user_id: 'them', emoji: '🔥', created_at: 'x' } })
    })
    expect(room.result.current.messages.find(m => m.id === 'm1')?.message_reactions).toHaveLength(1)
    expect(messagesSelects().length).toBe(selectsBefore)
  })

  it('keeps a failed send in the list and retries it', async () => {
    let fail = true
    tables.messages = call => {
      if (call.ops.some(([op]) => op === 'insert')) {
        return fail
          ? { data: null, error: { message: 'offline' } }
          : { data: msg({ id: 'real', sender_id: 'me', content: 'yo', created_at: '2026-10-24T23:00:00.000Z' }), error: null }
      }
      return { data: [msg()], error: null }
    }
    const room = renderHook(() => useMessages('c1'))
    await flush()
    let ok: boolean | undefined
    await act(async () => { ok = await room.result.current.sendMessage('yo') })
    expect(ok).toBe(false)
    const failed = room.result.current.messages[0]
    expect(failed).toMatchObject({ content: 'yo', _failed: true, _sending: false })

    fail = false
    await act(async () => { ok = await room.result.current.retryMessage(failed.id) })
    expect(ok).toBe(true)
    expect(room.result.current.messages.map(m => m.id)).toEqual(['real', 'm1'])
  })

  it('rolls back an edit the server rejected', async () => {
    tables.messages = call => {
      if (call.ops.some(([op]) => op === 'update')) return { data: null, error: { message: 'nope' } }
      return { data: [msg({ sender_id: 'me' })], error: null }
    }
    const alert = jest.spyOn(require('react-native').Alert, 'alert').mockImplementation(() => {})
    const room = renderHook(() => useMessages('c1'))
    await flush()
    let ok: boolean | undefined
    await act(async () => { ok = await room.result.current.editMessage('m1', 'changed') })
    expect(ok).toBe(false)
    expect(room.result.current.messages[0].content).toBe('hello')
    expect(alert).toHaveBeenCalled()
    alert.mockRestore()
  })
})
