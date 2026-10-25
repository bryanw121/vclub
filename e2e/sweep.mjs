/**
 * Delete leftover e2e events.
 *
 * The events suite creates `[e2e] ...` events in beforeAll and deletes them in
 * afterAll, but a crashed or cancelled run skips afterAll. CI runs this as a
 * final `if: always()` step; run it locally with `npm run e2e:sweep`.
 *
 * Signs in as the e2e account (E2E_USERNAME / E2E_PASSWORD) and deletes events
 * THAT ACCOUNT hosts whose title starts with "[e2e]". RLS means it cannot touch
 * anyone else's events. Exits non-zero on failure.
 *
 * Plain Node (no TypeScript) so it runs on Node 20 in CI without a loader.
 */
import { createClient } from '@supabase/supabase-js'

try {
  // Node >= 20.12. Does not override variables already set (CI sets them).
  process.loadEnvFile('.env')
} catch {
  // No .env file: rely on the process environment.
}

const TITLE_PREFIX = '[e2e]'

function required(name) {
  const value = process.env[name]
  if (!value) {
    console.error(`e2e:sweep: missing ${name} (set it in .env or the environment; see .env.example)`)
    process.exit(1)
  }
  return value
}

const url = required('EXPO_PUBLIC_SUPABASE_URL')
const anonKey = required('EXPO_PUBLIC_SUPABASE_ANON_KEY')
const username = required('E2E_USERNAME')
const password = required('E2E_PASSWORD')

const supabase = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })

async function main() {
  const { data: email, error: rpcError } = await supabase.rpc('get_email_by_username', { p_username: username })
  if (rpcError || !email) throw new Error(`could not resolve the e2e account email: ${rpcError?.message ?? 'not found'}`)

  const { data: auth, error: signInError } = await supabase.auth.signInWithPassword({ email, password })
  if (signInError || !auth.user) throw new Error(`sign-in failed: ${signInError?.message ?? 'no user'}`)

  try {
    const { data, error } = await supabase
      .from('events')
      .delete()
      .eq('created_by', auth.user.id)
      .like('title', `${TITLE_PREFIX}%`)
      .select('id')
    if (error) throw new Error(`delete failed: ${error.message}`)
    console.log(`e2e:sweep: removed ${data?.length ?? 0} leftover ${TITLE_PREFIX} event(s)`)
  } finally {
    await supabase.auth.signOut({ scope: 'local' })
  }
}

main().catch((e) => {
  console.error(`e2e:sweep: ${e instanceof Error ? e.message : e}`)
  process.exit(1)
})
