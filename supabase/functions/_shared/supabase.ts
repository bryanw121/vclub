/**
 * Shared by the edge functions that talk to the database or to Expo.
 * Import with an explicit `.ts` extension (Deno requires it):
 *   import { getServiceClient } from '../_shared/supabase.ts'
 */

// Keep this in step with "@supabase/supabase-js" in package.json
// (__tests__/edgeFunctions.test.ts fails when they drift apart).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.99.3'

export const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'
export const EXPO_RECEIPTS_URL = 'https://exp.host/--/api/v2/push/getReceipts'
/** Expo accepts at most 100 messages per send request. */
export const EXPO_BATCH_SIZE = 100
/** Expo accepts at most 1000 ticket ids per getReceipts request. */
export const RECEIPT_BATCH = 1000

let client: ReturnType<typeof createClient> | null = null

/**
 * Service-role client (bypasses RLS). Created on first use rather than at
 * import time so a missing secret surfaces as a logged 500 for that request
 * instead of a function that fails to boot.
 */
export function getServiceClient() {
  if (client) return client
  const url = Deno.env.get('SUPABASE_URL')
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set')
  client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  return client
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}
