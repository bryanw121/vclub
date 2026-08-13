/**
 * Ephemeral event fixtures for events e2e.
 * Created in beforeAll / removed in afterAll so the shared DB doesn't need
 * permanent pilot-visible seed events.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { existsSync, readFileSync } from 'fs'
import { resolve } from 'path'

export const OPEN_PLAY_EVENT = '[e2e] Open Play'
export const TOURNAMENT_EVENT = '[e2e] Tournament'

const E2E_USERNAME = 'bryanw121'
const E2E_PASSWORD = 'password'
const TITLE_PREFIX = '[e2e]'

const OPEN_PLAY_TAG = 'Open Play'
const TOURNAMENT_TAG = 'Tournament'

/** Load EXPO_PUBLIC_* from .env when running Playwright locally (CI sets them in the workflow). */
function loadLocalEnv() {
  if (process.env.EXPO_PUBLIC_SUPABASE_URL && process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY) return
  const envPath = resolve(process.cwd(), '.env')
  if (!existsSync(envPath)) return
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq < 0) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    } else {
      // Match dotenv's handling of unquoted values such as
      // KEY=actual-value # local note.
      value = value.replace(/\s+#.*$/, '').trim()
    }
    if (process.env[key] === undefined) process.env[key] = value
  }
}

function daysFromNow(days: number, hour = 19): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  d.setHours(hour, 0, 0, 0)
  d.setSeconds(0, 0)
  return d.toISOString()
}

async function signInE2eClient(): Promise<{ supabase: SupabaseClient; userId: string }> {
  loadLocalEnv()
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL
  const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) {
    throw new Error(
      'Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY (set in CI secrets or local .env)',
    )
  }

  const supabase = createClient(url, anonKey)
  const { data: email, error: rpcError } = await supabase.rpc('get_email_by_username', {
    p_username: E2E_USERNAME,
  })
  if (rpcError || !email) {
    throw new Error(`Could not resolve email for ${E2E_USERNAME}: ${rpcError?.message ?? 'not found'}`)
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email: email as string,
    password: E2E_PASSWORD,
  })
  if (error || !data.user) {
    throw new Error(`E2E sign-in failed: ${error?.message ?? 'no user'}`)
  }

  return { supabase, userId: data.user.id }
}

async function deleteE2eEvents(supabase: SupabaseClient, userId: string) {
  const { error } = await supabase
    .from('events')
    .delete()
    .eq('created_by', userId)
    .like('title', `${TITLE_PREFIX}%`)
  if (error) throw new Error(`Failed to clean e2e events: ${error.message}`)
}

export async function seedEventFixtures(): Promise<void> {
  const { supabase, userId } = await signInE2eClient()

  // Scrub leftovers from a prior crashed run, then create a fresh pair.
  await deleteE2eEvents(supabase, userId)

  const { data: tags, error: tagsError } = await supabase
    .from('tags')
    .select('id, name')
    .in('name', [OPEN_PLAY_TAG, TOURNAMENT_TAG])
  if (tagsError) throw new Error(`Failed to load tags: ${tagsError.message}`)

  const openPlayTagId = tags?.find(t => t.name === OPEN_PLAY_TAG)?.id
  const tournamentTagId = tags?.find(t => t.name === TOURNAMENT_TAG)?.id
  if (!openPlayTagId || !tournamentTagId) {
    throw new Error('Missing Open Play / Tournament tags in database')
  }

  const rows = [
    {
      title: OPEN_PLAY_EVENT,
      description: 'Ephemeral e2e fixture — safe to ignore.',
      location: 'E2E Gym',
      event_date: daysFromNow(2),
      duration_minutes: 120,
      max_attendees: null,
      created_by: userId,
    },
    {
      title: TOURNAMENT_EVENT,
      description: 'Ephemeral e2e fixture — safe to ignore.',
      location: 'E2E Gym',
      event_date: daysFromNow(3),
      duration_minutes: 120,
      max_attendees: 24,
      created_by: userId,
    },
  ]

  const { data: inserted, error: insertError } = await supabase.from('events').insert(rows).select('id, title')
  if (insertError || !inserted) {
    throw new Error(`Failed to insert e2e events: ${insertError?.message ?? 'no rows'}`)
  }

  const tagRows = inserted.flatMap(event => {
    const tagId = event.title === OPEN_PLAY_EVENT ? openPlayTagId : tournamentTagId
    return [{ event_id: event.id, tag_id: tagId }]
  })
  const { error: tagInsertError } = await supabase.from('event_tags').insert(tagRows)
  if (tagInsertError) {
    await deleteE2eEvents(supabase, userId)
    throw new Error(`Failed to tag e2e events: ${tagInsertError.message}`)
  }

  // The default global scope revokes every session for this user, including
  // the browser state shared by the Playwright projects.
  await supabase.auth.signOut({ scope: 'local' })
}

export async function cleanupEventFixtures(): Promise<void> {
  const { supabase, userId } = await signInE2eClient()
  await deleteE2eEvents(supabase, userId)
  await supabase.auth.signOut({ scope: 'local' })
}
