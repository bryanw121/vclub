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
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'

interface MessagePayload {
  id: string
  conversation_id: string
  sender_id: string
  content: string | null
  image_url: string | null
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  const body = await req.json()
  const message: MessagePayload = body.record

  if (!message?.conversation_id || !message?.sender_id) {
    return new Response('Invalid payload', { status: 400 })
  }

  // Get sender profile for the notification title
  const { data: sender } = await supabase
    .from('profiles')
    .select('username, first_name, last_name')
    .eq('id', message.sender_id)
    .single()

  const senderName = sender
    ? ([sender.first_name, sender.last_name].filter(Boolean).join(' ') || sender.username)
    : 'Someone'

  // Get conversation info (for club chat: club name)
  const { data: conv } = await supabase
    .from('conversations')
    .select('type, clubs(name)')
    .eq('id', message.conversation_id)
    .single()

  // Get push tokens for all members except the sender
  const { data: members } = await supabase
    .from('conversation_members')
    .select('user_id')
    .eq('conversation_id', message.conversation_id)
    .neq('user_id', message.sender_id)

  if (!members?.length) return new Response('No recipients', { status: 200 })

  const memberIds = members.map((m: { user_id: string }) => m.user_id)

  const { data: tokenRows } = await supabase
    .from('push_tokens')
    .select('token')
    .in('user_id', memberIds)

  const tokens = (tokenRows ?? []).map((r: { token: string }) => r.token)
  if (!tokens.length) return new Response('No tokens', { status: 200 })

  // Build notification body
  const isClub = conv?.type === 'club'
  const clubName = isClub ? (conv as any)?.clubs?.name : null

  const notifTitle = isClub
    ? `${senderName} in ${clubName ?? 'Club Chat'}`
    : senderName

  const notifBody = message.image_url && !message.content
    ? '📷 Image'
    : (message.content ?? '')

  // Send via Expo push API (handles both APNs and FCM)
  const notifications = tokens.map((token: string) => ({
    to: token,
    title: notifTitle,
    body: notifBody,
    data: { conversation_id: message.conversation_id },
    sound: 'default',
    badge: 1,
  }))

  await fetch(EXPO_PUSH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(notifications),
  })

  return new Response('OK', { status: 200 })
})
