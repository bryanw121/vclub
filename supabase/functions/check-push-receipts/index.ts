/**
 * Edge Function: check-push-receipts
 *
 * Reads Expo delivery receipts for pushes sent at least 15 minutes ago, deletes
 * tokens Apple/Google report as no longer registered, and clears checked tickets.
 * Run it every 30 minutes with pg_cron (see migration 20261024120500_push_receipts.sql).
 *
 * Expo keeps receipts for about 24 hours and accepts up to 1000 ids per request.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

const EXPO_RECEIPTS_URL = 'https://exp.host/--/api/v2/push/getReceipts'
const RECEIPT_BATCH = 1000

type Receipt = { status: 'ok' } | { status: 'error'; message: string; details?: { error?: string } }

Deno.serve(async () => {
  const cutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString()
  const { data: rows, error } = await supabase
    .from('push_receipts')
    .select('ticket_id, token')
    .lt('created_at', cutoff)
    .limit(RECEIPT_BATCH)
  if (error) return new Response(error.message, { status: 500 })
  if (!rows?.length) return new Response(JSON.stringify({ checked: 0 }), { status: 200 })

  const res = await fetch(EXPO_RECEIPTS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ ids: rows.map((r) => r.ticket_id) }),
  })
  const json = await res.json().catch(() => null)
  const receipts: Record<string, Receipt> = json?.data ?? {}

  const tokenByTicket = new Map(rows.map((r) => [r.ticket_id, r.token]))
  const deadTokens: string[] = []
  let errors = 0
  for (const [ticketId, receipt] of Object.entries(receipts)) {
    if (receipt.status !== 'error') continue
    errors++
    if (receipt.details?.error === 'DeviceNotRegistered') {
      const token = tokenByTicket.get(ticketId)
      if (token) deadTokens.push(token)
    } else {
      console.warn('push receipt error', receipt.message, receipt.details?.error)
    }
  }

  if (deadTokens.length) await supabase.from('push_tokens').delete().in('token', deadTokens)
  // Receipts that came back, and tickets older than a day (receipt expired), are done.
  const done = Object.keys(receipts)
  if (done.length) await supabase.from('push_receipts').delete().in('ticket_id', done)
  await supabase.from('push_receipts').delete().lt('created_at', new Date(Date.now() - 24 * 3600 * 1000).toISOString())

  return new Response(JSON.stringify({ checked: rows.length, errors, removedTokens: deadTokens.length }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
})
