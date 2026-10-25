import {
  applyMembershipUpdate,
  applyMessageToConversations,
  applyMessageUpdate,
  applyMessageUpdateToConversations,
  applyReactionChange,
  buildIncomingMessage,
  chatTopics,
  confirmSent,
  conversationsBindings,
  createDebouncedCall,
  mergeLatestPage,
  newMessageId,
  messagesBindings,
  reactionsBindings,
  silencesBindings,
  unreadTotal,
  upsertIncoming,
} from '../utils/chatUtils'
import type { ConversationRow, MessageRecord, MessageWithDetails } from '../types'

const noop = () => {}
const spec = (bs: { event: string; table: string; filter?: string; schema?: string }[]) =>
  bs.map(b => [b.event, b.schema ?? 'public', b.table, b.filter ?? ''].join('|')).sort()

// ── Topics & bindings ────────────────────────────────────────────────────────

describe('chat realtime topics', () => {
  it('scopes every topic to its conversation or user', () => {
    expect(chatTopics.messages('c1')).toBe('messages:c1')
    expect(chatTopics.reactions('c1')).toBe('reactions:c1')
    expect(chatTopics.conversations('u1')).toBe('conversations:u1')
    expect(chatTopics.silences('u1')).toBe('silences:u1')
  })

  it('never reuses a topic name across purposes', () => {
    const names = [
      chatTopics.messages('x'), chatTopics.reactions('x'), chatTopics.conversations('x'), chatTopics.silences('x'),
    ]
    expect(new Set(names).size).toBe(names.length)
  })

  it('gives every subscriber of a topic the identical binding set, whatever its handlers', () => {
    // lib/realtime requires identical bindings per topic (handlers may differ).
    const a = messagesBindings('c1', { onInsert: noop, onUpdate: noop })
    const b = messagesBindings('c1', { onInsert: () => 1, onUpdate: () => 2 })
    expect(spec(a)).toEqual(spec(b))
    expect(spec(conversationsBindings('u1', { onMessageInsert: noop, onMessageUpdate: noop, onMembershipUpdate: noop })))
      .toEqual(spec(conversationsBindings('u1', { onMessageInsert: () => 1, onMessageUpdate: () => 2, onMembershipUpdate: () => 3 })))
    expect(spec(silencesBindings('u1', { onChange: noop }))).toEqual(spec(silencesBindings('u1', { onChange: () => 1 })))
  })

  it('filters messages to the room and memberships / silences to the signed-in user', () => {
    expect(spec(messagesBindings('c1', { onInsert: noop, onUpdate: noop }))).toEqual([
      'INSERT|public|messages|conversation_id=eq.c1',
      'UPDATE|public|messages|conversation_id=eq.c1',
    ])
    expect(spec(conversationsBindings('u1', { onMessageInsert: noop, onMessageUpdate: noop, onMembershipUpdate: noop }))).toEqual([
      'INSERT|public|messages|',
      'UPDATE|public|conversation_members|user_id=eq.u1',
      'UPDATE|public|messages|',
    ])
    expect(spec(silencesBindings('u1', { onChange: noop }))).toEqual(['*|public|chat_silences|user_id=eq.u1'])
    expect(spec(reactionsBindings({ onChange: noop }))).toEqual(['*|public|message_reactions|'])
  })

  it('routes each binding to its own handler', () => {
    const onInsert = jest.fn()
    const onUpdate = jest.fn()
    const [ins, upd] = messagesBindings('c1', { onInsert, onUpdate })
    ins.handler({ n: 1 })
    upd.handler({ n: 2 })
    expect(onInsert).toHaveBeenCalledWith({ n: 1 })
    expect(onUpdate).toHaveBeenCalledWith({ n: 2 })
  })
})

// ── Payload → rows ───────────────────────────────────────────────────────────

const ME = 'me'
const THEM = 'them'
const themProfile = { id: THEM, username: 'jexy', first_name: 'Jex', last_name: null, avatar_url: null, selected_border: null }

function record(over: Partial<MessageRecord> = {}): MessageRecord {
  return {
    id: 'm-new', conversation_id: 'c1', sender_id: THEM, content: 'hi', image_url: null, reply_to_id: null,
    created_at: '2026-10-24T20:00:00.000Z', deleted_at: null, edited_at: null, ...over,
  }
}

function row(over: Partial<MessageWithDetails> = {}): MessageWithDetails {
  return { ...record(), id: 'm1', created_at: '2026-10-24T19:00:00.000Z', profiles: null, message_reactions: [], reply_to: null, ...over }
}

describe('buildIncomingMessage', () => {
  it('builds a full row from the payload, the cached sender and the loaded quote', () => {
    const quoted = row({ id: 'q1', content: 'original', sender_id: ME, profiles: { ...themProfile, id: ME, username: 'me' } })
    const built = buildIncomingMessage(record({ reply_to_id: 'q1' }), themProfile, [quoted])
    expect(built).toMatchObject({
      id: 'm-new', content: 'hi', sender_id: THEM, profiles: themProfile, message_reactions: [],
      reply_to: { id: 'q1', content: 'original', profiles: { id: ME, username: 'me' } },
    })
  })

  it('leaves sender / quote null when unknown so the caller can fetch them once', () => {
    const built = buildIncomingMessage(record({ reply_to_id: 'old' }), undefined, [])
    expect(built.profiles).toBeNull()
    expect(built.reply_to).toBeNull()
    expect(built.reply_to_id).toBe('old')
  })
})

describe('upsertIncoming / confirmSent', () => {
  const temp = row({ id: 'temp-1', sender_id: ME, content: 'yo', created_at: '2026-10-24T20:00:01.000Z', _sending: true })

  it('adds a new row newest-first', () => {
    const next = upsertIncoming([row()], buildIncomingMessage(record(), themProfile, []))
    expect(next.map(m => m.id)).toEqual(['m-new', 'm1'])
  })

  it('is idempotent for the same id and keeps reactions', () => {
    const withReaction = row({ id: 'm-new', created_at: record().created_at, message_reactions: [{ message_id: 'm-new', user_id: ME, emoji: '👍', created_at: 'x' }] })
    const next = upsertIncoming([withReaction], buildIncomingMessage(record({ content: 'hi' }), themProfile, []))
    expect(next).toHaveLength(1)
    expect(next[0].message_reactions).toHaveLength(1)
  })

  it('replaces the optimistic row when our own message echoes back first', () => {
    const echo = buildIncomingMessage(record({ id: 'real-1', sender_id: ME, content: 'yo', created_at: '2026-10-24T20:00:02.000Z' }), null, [])
    const afterEcho = upsertIncoming([temp, row()], echo)
    expect(afterEcho.map(m => m.id)).toEqual(['real-1', 'm1'])
    // ...and the insert response landing afterwards doesn't duplicate it.
    const afterConfirm = confirmSent(afterEcho, 'temp-1', { ...echo, profiles: themProfile })
    expect(afterConfirm.map(m => m.id)).toEqual(['real-1', 'm1'])
  })

  it('confirmSent swaps the temp row for the confirmed one', () => {
    const confirmed = row({ id: 'real-1', sender_id: ME, content: 'yo', created_at: '2026-10-24T20:00:02.000Z' })
    expect(confirmSent([temp, row()], 'temp-1', confirmed).map(m => m.id)).toEqual(['real-1', 'm1'])
  })
})

describe('applyMessageUpdate', () => {
  it('patches the edited row and quotes of it', () => {
    const target = row({ id: 'm1', content: 'old' })
    const quoting = row({ id: 'm2', reply_to_id: 'm1', reply_to: { id: 'm1', content: 'old', image_url: null, deleted_at: null, profiles: null } })
    const next = applyMessageUpdate([quoting, target], record({ id: 'm1', content: 'new', edited_at: '2026-10-24T21:00:00.000Z' }))
    expect(next[1]).toMatchObject({ content: 'new', edited_at: '2026-10-24T21:00:00.000Z' })
    expect(next[0].reply_to?.content).toBe('new')
  })

  it('returns the same array when the row isn\'t loaded', () => {
    const prev = [row()]
    expect(applyMessageUpdate(prev, record({ id: 'other' }))).toBe(prev)
  })
})

describe('applyReactionChange', () => {
  const rx = { message_id: 'm1', user_id: THEM, emoji: '🔥', created_at: '2026-10-24T20:00:00.000Z' }

  it('adds and removes from the payload, without refetching', () => {
    const added = applyReactionChange([row()], { eventType: 'INSERT', new: rx })
    expect(added[0].message_reactions).toEqual([rx])
    const removed = applyReactionChange(added, { eventType: 'DELETE', old: { message_id: 'm1', user_id: THEM, emoji: '🔥' } })
    expect(removed[0].message_reactions).toEqual([])
  })

  it('ignores duplicates (our optimistic toggle echoing back) and unloaded messages', () => {
    const prev = [row({ message_reactions: [rx] })]
    expect(applyReactionChange(prev, { eventType: 'INSERT', new: rx })).toBe(prev)
    expect(applyReactionChange(prev, { eventType: 'INSERT', new: { ...rx, message_id: 'elsewhere' } })).toBe(prev)
  })
})

describe('mergeLatestPage', () => {
  it('keeps older pages and pending rows, lets the fresh page win', () => {
    const pending = row({ id: 'temp-1', _failed: true, created_at: '2026-10-24T22:00:00.000Z' })
    const older = row({ id: 'old', created_at: '2026-10-01T00:00:00.000Z' })
    const stale = row({ id: 'm1', content: 'stale' })
    const page = [row({ id: 'm2', created_at: '2026-10-24T20:00:00.000Z' }), row({ id: 'm1', content: 'fresh' })]
    const next = mergeLatestPage([pending, stale, older], page)
    expect(next.map(m => m.id)).toEqual(['temp-1', 'm2', 'm1', 'old'])
    expect(next[2].content).toBe('fresh')
  })

  it('treats a failed or sending row the page already has (same client id) as sent', () => {
    const failed = row({ id: 'c-1', sender_id: ME, content: 'yo', _failed: true, created_at: '2026-10-24T22:00:00.000Z' })
    const sending = row({ id: 'c-2', sender_id: ME, content: 'yo2', _sending: true, created_at: '2026-10-24T22:00:01.000Z' })
    const page = [
      row({ id: 'c-2', sender_id: ME, content: 'yo2', created_at: '2026-10-24T22:00:01.000Z' }),
      row({ id: 'c-1', sender_id: ME, content: 'yo', created_at: '2026-10-24T22:00:00.000Z' }),
    ]
    const next = mergeLatestPage([sending, failed], page)
    expect(next.map(m => m.id)).toEqual(['c-2', 'c-1'])
    expect(next.every(m => !m._failed && !m._sending)).toBe(true)
  })
})

describe('upsertIncoming with client-generated ids', () => {
  it('turns a "failed" row into a sent one when its realtime echo arrives', () => {
    const failed = row({ id: 'c-1', sender_id: ME, content: 'yo', _failed: true, _sending: false, created_at: '2026-10-24T22:00:00.000Z' })
    const echo = buildIncomingMessage(record({ id: 'c-1', sender_id: ME, content: 'yo', created_at: '2026-10-24T22:00:00.000Z' }), null, [])
    const next = upsertIncoming([failed, row()], echo)
    expect(next.filter(m => m.id === 'c-1')).toHaveLength(1)
    expect(next.find(m => m.id === 'c-1')?._failed).toBeFalsy()
  })

  it('newMessageId returns a v4 UUID', () => {
    expect(newMessageId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    expect(newMessageId()).not.toBe(newMessageId())
  })
})

// ── Conversations store ──────────────────────────────────────────────────────

function conv(over: Partial<ConversationRow> = {}): ConversationRow {
  return {
    conversation_id: 'c1', type: 'dm', club_id: null, created_at: '2026-10-01T00:00:00.000Z',
    last_message_id: 'm1', last_message_content: 'old', last_message_image_url: null,
    last_message_at: '2026-10-24T19:00:00.000Z', last_message_deleted_at: null, last_sender_id: THEM,
    last_sender_username: null, last_sender_first_name: null, last_sender_last_name: null, unread_count: 0,
    other_user_id: THEM, other_user_username: 'jexy', other_user_first_name: null, other_user_last_name: null,
    other_user_avatar_url: null, other_user_selected_border: null, club_name: null, club_avatar_url: null,
    my_last_read_at: null, ...over,
  }
}

describe('applyMessageToConversations', () => {
  it('updates the preview, bumps unread for others and re-sorts', () => {
    const rows = [conv({ conversation_id: 'c0', last_message_at: '2026-10-24T19:30:00.000Z', last_message_id: 'x' }), conv()]
    const { rows: next, known, changed } = applyMessageToConversations(rows, record(), ME, { isOpen: false })
    expect(known && changed).toBe(true)
    expect(next[0]).toMatchObject({ conversation_id: 'c1', last_message_content: 'hi', last_message_id: 'm-new', unread_count: 1 })
  })

  it('is idempotent, so several subscribers can apply the same payload', () => {
    const once = applyMessageToConversations([conv()], record(), ME, { isOpen: false }).rows
    const twice = applyMessageToConversations(once, record(), ME, { isOpen: false })
    expect(twice.changed).toBe(false)
    expect(twice.rows[0].unread_count).toBe(1)
  })

  it('does not bump unread for our own messages or the open room', () => {
    expect(applyMessageToConversations([conv()], record({ sender_id: ME }), ME, { isOpen: false }).rows[0].unread_count).toBe(0)
    expect(applyMessageToConversations([conv()], record(), ME, { isOpen: true }).rows[0].unread_count).toBe(0)
  })

  it('reports an unknown conversation so the caller refetches', () => {
    expect(applyMessageToConversations([conv()], record({ conversation_id: 'new' }), ME, { isOpen: false }).known).toBe(false)
  })

  it('applies a delete of the last message to the preview', () => {
    const next = applyMessageUpdateToConversations([conv()], record({ id: 'm1', deleted_at: '2026-10-24T21:00:00.000Z' }))
    expect(next[0].last_message_deleted_at).toBe('2026-10-24T21:00:00.000Z')
  })
})

describe('applyMembershipUpdate', () => {
  it('zeroes unread when the read covers the last message', () => {
    const { rows, needsRefetch } = applyMembershipUpdate([conv({ unread_count: 3 })], { conversation_id: 'c1', last_read_at: '2026-10-24T19:00:01.000Z' })
    expect(rows[0].unread_count).toBe(0)
    expect(needsRefetch).toBe(false)
  })

  it('asks for a refetch when the read is older than the last message', () => {
    expect(applyMembershipUpdate([conv({ unread_count: 3 })], { conversation_id: 'c1', last_read_at: '2026-10-24T18:00:00.000Z' }).needsRefetch).toBe(true)
  })
})

describe('unreadTotal', () => {
  it('skips DMs with silenced people', () => {
    const rows = [conv({ unread_count: 2 }), conv({ conversation_id: 'c2', other_user_id: 'muted', unread_count: 5 }), conv({ conversation_id: 'c3', type: 'club', other_user_id: null, unread_count: 1 })]
    expect(unreadTotal(rows, new Set(['muted']))).toBe(3)
  })
})

// ── Debounce ─────────────────────────────────────────────────────────────────

describe('createDebouncedCall', () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())

  it('runs once, after the last schedule', () => {
    const fn = jest.fn()
    const call = createDebouncedCall(fn, 1000)
    call.schedule()
    jest.advanceTimersByTime(600)
    call.schedule()
    jest.advanceTimersByTime(999)
    expect(fn).not.toHaveBeenCalled()
    jest.advanceTimersByTime(1)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('flush runs a pending call now and is a no-op otherwise', () => {
    const fn = jest.fn()
    const call = createDebouncedCall(fn, 1000)
    call.flush()
    expect(fn).not.toHaveBeenCalled()
    call.schedule()
    call.flush()
    expect(fn).toHaveBeenCalledTimes(1)
    jest.advanceTimersByTime(2000)
    expect(fn).toHaveBeenCalledTimes(1)
  })
})
