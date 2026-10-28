/**
 * Edge Function: login-with-username
 *
 * Signs a user in by username + password without ever telling the caller the
 * account's email. The username is resolved to an email here, with the service
 * role (get_email_by_username is not executable by clients), and the password
 * is checked by Supabase Auth. The response is either the new session or a
 * generic "Incorrect username or password", identical for an unknown username
 * and a wrong password, and padded to a minimum duration so timing does not
 * tell them apart either.
 *
 * POST { username, password } -> 200 { access_token, refresh_token, expires_in, expires_at, token_type }
 *                              -> 401 { error: 'Incorrect username or password' }
 *                              -> 429 { error } when Supabase Auth rate-limits
 *
 * The app then calls supabase.auth.setSession({ access_token, refresh_token }).
 *
 * Deployed with verify_jwt = false (supabase/config.toml): the caller is not
 * signed in yet. Nothing here is privileged beyond the email lookup, whose
 * result never leaves the function.
 *
 * Rate limiting: Supabase Auth limits /token per IP, and all username sign-ins
 * reach Auth from this function's IP. To make Auth count the user's IP
 * instead, enable "IP address forwarding" (Auth > Rate Limits) and give the
 * function a secret API key; until then, see #11 for the function's own limit.
 */

import { createAnonClient, getServiceClient } from '../_shared/supabase.ts'
import { corsHeaders, json } from '../_shared/http.ts'
import { GENERIC_LOGIN_ERROR, parseLoginBody, remainingDelayMs } from '../_shared/usernameLogin.ts'

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

Deno.serve(async (req) => {
  const cors = corsHeaders(req.headers.get('Origin'), Deno.env.get('ALLOWED_ORIGINS'))
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405, cors)

  const startedAt = Date.now()
  const finish = async (body: unknown, status: number) => {
    await sleep(remainingDelayMs(startedAt, Date.now(), Math.floor(Math.random() * 150)))
    return json(body, status, cors)
  }

  let input
  try {
    input = parseLoginBody(await req.json())
  } catch {
    input = null
  }
  if (!input) return finish({ error: GENERIC_LOGIN_ERROR }, 401)

  try {
    const { data: email, error: lookupError } = await getServiceClient()
      .rpc('get_email_by_username', { p_username: input.username })
    if (lookupError) {
      console.error('[login-with-username] lookup failed:', lookupError.message)
      return finish({ error: 'Sign-in is unavailable right now. Please try again.' }, 500)
    }
    if (typeof email !== 'string' || !email) return finish({ error: GENERIC_LOGIN_ERROR }, 401)

    const { data, error } = await createAnonClient().auth.signInWithPassword({ email, password: input.password })
    if (error || !data.session) {
      if (error?.status === 429) return finish({ error: 'Too many sign-in attempts. Please wait a minute and try again.' }, 429)
      return finish({ error: GENERIC_LOGIN_ERROR }, 401)
    }
    const s = data.session
    return finish({
      access_token: s.access_token,
      refresh_token: s.refresh_token,
      expires_in: s.expires_in,
      expires_at: s.expires_at,
      token_type: s.token_type,
    }, 200)
  } catch (e) {
    console.error('[login-with-username] failed:', (e as Error)?.message)
    return finish({ error: 'Sign-in is unavailable right now. Please try again.' }, 500)
  }
})
