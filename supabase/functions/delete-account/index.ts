/**
 * Edge Function: delete-account
 *
 * Permanently deletes the signed-in user's account (App Store 5.1.1(v), Google Play).
 *
 * POST { confirm: 'DELETE' } with the user's JWT ->
 *   200 { ok: true, plan }   plan = what was transferred / deleted (same shape as
 *                            get_account_deletion_preview, which the app showed first)
 *   400 missing confirmation, 401 not signed in, 500 failure (nothing deleted
 *   unless the final auth delete failed after the hand-over; retrying is safe)
 *
 * Steps:
 *   1. prepare_account_deletion(user) with the service role: one transaction
 *      that hands clubs / tournaments / upcoming events to a successor or
 *      deletes / cancels them, detaches past events, and clears every
 *      reference that would block step 3. It fails and rolls back rather than
 *      leave a blocking reference.
 *   2. Best effort: remove the person's uploads (avatars/<uid>/, chat-images/<uid>/).
 *   3. auth.admin.deleteUser(user): cascades to profiles and everything keyed on it.
 *
 * verify_jwt = true (supabase/config.toml): the gateway rejects calls without a
 * valid JWT; the user id comes from that JWT, never from the request body.
 */

import { getServiceClient } from '../_shared/supabase.ts'
import { corsHeaders, json } from '../_shared/http.ts'
import { bearerToken, isDeleteConfirmed, USER_FOLDER_BUCKETS } from '../_shared/accountDeletion.ts'

async function removeUserFolder(bucket: string, userId: string) {
  const storage = getServiceClient().storage.from(bucket)
  for (let round = 0; round < 20; round++) {
    const { data, error } = await storage.list(userId, { limit: 100 })
    if (error || !data?.length) return
    const paths = data.filter(f => f.name).map(f => `${userId}/${f.name}`)
    if (!paths.length) return
    const { error: removeError } = await storage.remove(paths)
    if (removeError) {
      console.warn(`[delete-account] could not remove ${bucket} files:`, removeError.message)
      return
    }
  }
}

Deno.serve(async (req) => {
  const cors = corsHeaders(req.headers.get('Origin'), Deno.env.get('ALLOWED_ORIGINS'))
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405, cors)

  const token = bearerToken(req.headers.get('Authorization'))
  if (!token) return json({ error: 'Sign in to delete your account.' }, 401, cors)

  let body: unknown = null
  try { body = await req.json() } catch { /* handled below */ }
  if (!isDeleteConfirmed(body)) return json({ error: 'Confirmation missing.' }, 400, cors)

  try {
    const service = getServiceClient()
    const { data: userData, error: userError } = await service.auth.getUser(token)
    const userId = userData?.user?.id
    if (userError || !userId) return json({ error: 'Sign in to delete your account.' }, 401, cors)

    const { data: plan, error: prepareError } = await service.rpc('prepare_account_deletion', { p_user: userId })
    if (prepareError) {
      console.error('[delete-account] prepare failed:', prepareError.message)
      return json({ error: 'Could not delete your account. Nothing was changed. Please try again.' }, 500, cors)
    }

    for (const bucket of USER_FOLDER_BUCKETS) await removeUserFolder(bucket, userId)

    const { error: deleteError } = await service.auth.admin.deleteUser(userId)
    if (deleteError) {
      console.error('[delete-account] auth delete failed:', deleteError.message)
      return json({ error: 'Could not finish deleting your account. Please try again.' }, 500, cors)
    }
    return json({ ok: true, plan }, 200, cors)
  } catch (e) {
    console.error('[delete-account] failed:', (e as Error)?.message)
    return json({ error: 'Could not delete your account. Please try again.' }, 500, cors)
  }
})
