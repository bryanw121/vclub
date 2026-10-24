/**
 * Edge Function: send-chat-push
 *
 * Triggered by a Supabase Database Webhook on messages INSERT.
 * Sends Expo push notifications to all conversation members except the sender.
 *
 * Set up the webhook in Supabase Dashboard → Database → Webhooks:
 *   Table: messages
 *   Events: INSERT
 *   URL: https://<project-ref>.supabase.co/functions/v1/send-chat-push
 *   Headers: Authorization: Bearer <service-role-key>
 *
 * Reliability rules (Expo push docs):
 *   - At most 100 messages per request, so tokens are sent in chunks.
 *   - Each message gets a ticket back. A ticket error of DeviceNotRegistered means
 *     the app was uninstalled or the token rotated: that token is deleted so we stop
 *     sending to it. Ticket ids are stored in push_receipts so check-push-receipts
 *     can read delivery receipts later (Expo keeps them ~24h).
 *   - Members who muted the sender (chat_silences) get no push.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'
const EXPO_BATCH_SIZE = 100

interface MessagePayload {
  id: string
  conversation_id: string
  sender_id: string
  content: string | null
  image_url: string | null
}

type ExpoTicket =
  | { status: 'ok'; id: string }
  | { status: 'error'; message: string; details?: { error?: string } }

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  const body = await req.json()
  const message: MessagePayload = body.record

  if (!message?.conversation_id || !message?.sender_id) {
    return new Response('Invalid payload', { status: 400 })
  }

  // Sender, conversation and members are independent: fetch them together.
  const [{ data: sender }, { data: conv }, { data: members }] = await Promise.all([
    supabase.from('profiles').select('username, first_name, last_name').eq('id', message.sender_id).single(),
    supabase.from('conversations').select('type, clubs(name)').eq('id', message.conversation_id).single(),
    supabase.from('conversation_members').select('user_id').eq('conversation_id', message.conversation_id).neq('user_id', message.sender_id),
  ])

  if (!members?.length) return new Response('No recipients', { status: 200 })

  const memberIds = members.map((m: { user_id: string }) => m.user_id)

  // Skip members who muted the sender.
  const { data: silencedRows } = await supabase
    .from('chat_silences')
    .select('user_id')
    .eq('silenced_user_id', message.sender_id)
    .in('user_id', memberIds)
  const muted = new Set((silencedRows ?? []).map((r: { user_id: string }) => r.user_id))
  const recipientIds = memberIds.filter((id: string) => !muted.has(id))
  if (!recipientIds.length) return new Response('All recipients muted the sender', { status: 200 })

  const { data: tokenRows } = await supabase
    .from('push_tokens')
    .select('token')
    .in('user_id', recipientIds)

  const tokens = [...new Set((tokenRows ?? []).map((r: { token: string }) => r.token))]
  if (!tokens.length) return new Response('No tokens', { status: 200 })

  const senderName = sender
    ? ([sender.first_name, sender.last_name].filter(Boolean).join(' ') || sender.username)
    : 'Someone'
  const isClub = conv?.type === 'club'
  const clubName = isClub ? (conv as any)?.clubs?.name : null
  const notifTitle = isClub ? `${senderName} in ${clubName ?? 'Club Chat'}` : senderName
  const notifBody = message.image_url && !message.content ? '📷 Image' : (message.content ?? '')

  const deadTokens: string[] = []
  const receipts: { ticket_id: string; token: string }[] = []

  for (const batch of chunk(tokens, EXPO_BATCH_SIZE)) {
    const notifications = batch.map((token) => ({
      to: token,
      title: notifTitle,
      body: notifBody,
      data: { conversation_id: message.conversation_id },
      sound: 'default',
      badge: 1,
    }))

    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(notifications),
      })
      const json = await res.json().catch(() => null)
      const tickets: ExpoTicket[] = json?.data ?? []
      // Tickets come back in the same order as the messages sent.
      tickets.forEach((t, i) => {
        const token = batch[i]
        if (t.status === 'ok') receipts.push({ ticket_id: t.id, token })
        else if (t.details?.error === 'DeviceNotRegistered') deadTokens.push(token)
        else console.warn('push ticket error', t.message, t.details?.error)
      })
    } catch (e) {
      console.error('push batch failed', e)
    }
  }

  if (deadTokens.length) {
    await supabase.from('push_tokens').delete().in('token', deadTokens)
  }
  if (receipts.length) {
    // Optional table: if the migration hasn't been applied yet, just skip.
    const { error } = await supabase.from('push_receipts').insert(receipts)
    if (error) console.warn('push_receipts insert skipped:', error.message)
  }

  return new Response(JSON.stringify({ sent: receipts.length, removedTokens: deadTokens.length, muted: muted.size }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
})
