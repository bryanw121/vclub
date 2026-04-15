import { timeAgo, lastMessagePreview } from '../utils/chatUtils'
import type { ConversationRow } from '../types'

// ── timeAgo ──────────────────────────────────────────────────────────────────

describe('timeAgo', () => {
  it('returns empty string for null', () => {
    expect(timeAgo(null)).toBe('')
  })

  it('returns "now" for timestamps less than 1 minute ago', () => {
    const iso = new Date(Date.now() - 30_000).toISOString()
    expect(timeAgo(iso)).toBe('now')
  })

  it('returns minutes for timestamps less than 1 hour ago', () => {
    const iso = new Date(Date.now() - 5 * 60_000).toISOString()
    expect(timeAgo(iso)).toBe('5m')
  })

  it('returns hours for timestamps less than 24 hours ago', () => {
    const iso = new Date(Date.now() - 3 * 3600_000).toISOString()
    expect(timeAgo(iso)).toBe('3h')
  })

  it('returns days for timestamps less than 7 days ago', () => {
    const iso = new Date(Date.now() - 2 * 86_400_000).toISOString()
    expect(timeAgo(iso)).toBe('2d')
  })

  it('returns locale date string for timestamps 7+ days ago', () => {
    const iso = new Date(Date.now() - 10 * 86_400_000).toISOString()
    const result = timeAgo(iso)
    // Should be something like "Jun 5" rather than a relative unit
    expect(result).toMatch(/\w{3}\s\d+/)
  })
})

// ── lastMessagePreview ────────────────────────────────────────────────────────

function makeRow(overrides: Partial<ConversationRow> = {}): ConversationRow {
  return {
    conversation_id: 'conv-1',
    type: 'dm',
    club_id: null,
    created_at: new Date().toISOString(),
    last_message_id: 'msg-1',
    last_message_content: null,
    last_message_image_url: null,
    last_message_at: new Date().toISOString(),
    last_message_deleted_at: null,
    last_sender_id: 'other-user',
    last_sender_username: null,
    last_sender_first_name: null,
    last_sender_last_name: null,
    unread_count: 0,
    other_user_id: 'other-user',
    other_user_username: 'jane',
    other_user_first_name: 'Jane',
    other_user_last_name: 'Doe',
    other_user_avatar_url: null,
    other_user_selected_border: null,
    club_name: null,
    club_avatar_url: null,
    my_last_read_at: null,
    ...overrides,
  }
}

describe('lastMessagePreview', () => {
  const MY_ID = 'my-user'

  it('returns "No messages yet" when last_message_at is null', () => {
    const row = makeRow({ last_message_at: null })
    expect(lastMessagePreview(row, MY_ID)).toBe('No messages yet')
  })

  it('returns "Deleted message" when last message is deleted', () => {
    const row = makeRow({ last_message_deleted_at: new Date().toISOString() })
    expect(lastMessagePreview(row, MY_ID)).toBe('Deleted message')
  })

  it('prefixes "You: " when the last sender is the current user', () => {
    const row = makeRow({ last_sender_id: MY_ID, last_message_content: 'Hello' })
    expect(lastMessagePreview(row, MY_ID)).toBe('You: Hello')
  })

  it('shows content without prefix when another user sent the message', () => {
    const row = makeRow({ last_sender_id: 'other-user', last_message_content: 'Hello' })
    expect(lastMessagePreview(row, MY_ID)).toBe('Hello')
  })

  it('shows image placeholder when message is image-only', () => {
    const row = makeRow({
      last_sender_id: 'other-user',
      last_message_content: null,
      last_message_image_url: 'https://example.com/img.jpg',
    })
    expect(lastMessagePreview(row, MY_ID)).toBe('📷 Image')
  })

  it('prefixes "You: " on image-only message from current user', () => {
    const row = makeRow({
      last_sender_id: MY_ID,
      last_message_content: null,
      last_message_image_url: 'https://example.com/img.jpg',
    })
    expect(lastMessagePreview(row, MY_ID)).toBe('You: 📷 Image')
  })

  it('hides club thread preview when last sender is silenced', () => {
    const silenced = new Set(['creepy-user'])
    const row = makeRow({
      type: 'club',
      club_id: 'club-1',
      club_name: 'Spikers',
      other_user_id: null,
      last_sender_id: 'creepy-user',
      last_message_content: 'spam',
    })
    expect(lastMessagePreview(row, MY_ID, silenced)).toBe('Message hidden')
  })

  it('does not hide DM preview by silenced set (DM rows are filtered in UI)', () => {
    const silenced = new Set(['other-user'])
    const row = makeRow({ last_sender_id: 'other-user', last_message_content: 'hi' })
    expect(lastMessagePreview(row, MY_ID, silenced)).toBe('hi')
  })
})
