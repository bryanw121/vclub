import type { ConversationRow } from '../types'

export function timeAgo(iso: string | null): string {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'now'
  if (mins < 60) return `${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d`
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' })
}

export function lastMessagePreview(row: ConversationRow, myId: string): string {
  if (!row.last_message_at) return 'No messages yet'
  if (row.last_message_deleted_at) return 'Deleted message'
  const prefix = row.last_sender_id === myId ? 'You: ' : ''
  if (row.last_message_image_url && !row.last_message_content) return `${prefix}📷 Image`
  return `${prefix}${row.last_message_content ?? ''}`
}
