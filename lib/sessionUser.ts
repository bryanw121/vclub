import type { User } from '@supabase/supabase-js'
import { supabase } from './supabase'

/**
 * Read the persisted session's user without calling `GET /auth/v1/user`.
 * `supabase.auth.getUser()` always hits the Auth server; list/filter code only
 * needs the user id for query params, and the client already attaches the JWT.
 */
export async function getSessionUser(): Promise<User | null> {
  const { data: { session } } = await supabase.auth.getSession()
  return session?.user ?? null
}
