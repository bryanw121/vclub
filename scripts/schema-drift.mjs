#!/usr/bin/env node
/**
 * Fails when the live and beta Supabase projects' schemas differ.
 *
 * Both projects expose public.schema_fingerprint() (migration
 * 20261026100000_schema_fingerprint.sql): an md5 per schema object (tables,
 * columns, constraints, indexes, views, functions, triggers, policies, grants,
 * realtime publication, storage buckets, cron jobs, reference-table rows). This
 * calls it on both with their public anon keys and prints every object that is
 * missing on one side or defined differently.
 *
 * Runs in CI on every PR/push (Web build job) and daily (schema-drift.yml). A
 * failure means a migration reached one project but not the other: apply the
 * same SQL to the other project (see CLAUDE.md, "Schema migrations").
 *
 * The anon keys are public by design (they ship in every client bundle).
 */

const PROJECTS = {
  live: {
    url: process.env.LIVE_SUPABASE_URL || 'https://rmelsdqgrpfjzqisycdl.supabase.co',
    key: process.env.LIVE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJtZWxzZHFncnBmanpxaXN5Y2RsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQwNDU5NTYsImV4cCI6MjA4OTYyMTk1Nn0.rGzfRBxg16pC4L8YqP0PF81MDweamPzqj1Y-6zFkoDU',
  },
  beta: {
    url: process.env.BETA_SUPABASE_URL || 'https://uifolvbwtrbcmfrvelnl.supabase.co',
    key: process.env.BETA_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVpZm9sdmJ3dHJiY21mcnZlbG5sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI5NTY2OTUsImV4cCI6MjEwODUzMjY5NX0.8CcvfSOI3LNZ8KQ9OadOyN2dVy8lYiBeSVFzfC5ihh8',
  },
}

/**
 * Differences that are intentional. Keep this list short and explain each one.
 * Keys are fingerprint keys; the value says which project may have it alone.
 */
const ALLOWED = {
  // Sends kudos reminder notifications to real attendees; beta must never notify anyone.
  'cron:kudos-reminders': 'live',
}

async function fingerprint(name) {
  const { url, key } = PROJECTS[name]
  const res = await fetch(`${url}/rest/v1/rpc/schema_fingerprint`, {
    method: 'POST',
    headers: { apikey: key, authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: '{}',
    signal: AbortSignal.timeout(30_000),
  })
  if (!res.ok) throw new Error(`${name}: schema_fingerprint HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`)
  return res.json()
}

/** Pure: the list of differences between two fingerprints, minus ALLOWED ones. */
export function diffFingerprints(live, beta, allowed = ALLOWED) {
  const out = []
  for (const k of [...new Set([...Object.keys(live), ...Object.keys(beta)])].sort()) {
    const inLive = k in live
    const inBeta = k in beta
    if (inLive && inBeta && live[k] === beta[k]) continue
    const only = inLive && !inBeta ? 'live' : !inLive && inBeta ? 'beta' : null
    if (only && allowed[k] === only) continue
    out.push({ key: k, kind: only ? `only on ${only}` : 'defined differently' })
  }
  return out
}

async function main() {
  const [live, beta] = await Promise.all([fingerprint('live'), fingerprint('beta')])
  const diffs = diffFingerprints(live, beta)
  if (!diffs.length) {
    console.log(`Schemas match: ${Object.keys(live).length} objects compared (live vs beta).`)
    return
  }
  console.error(`Schema drift: ${diffs.length} object(s) differ between live and beta:`)
  for (const d of diffs) console.error(`  ${d.key}  (${d.kind})`)
  console.error('\nApply the same migration to both projects (CLAUDE.md, "Schema migrations"), then re-run.')
  if (process.env.GITHUB_ACTIONS) {
    console.log(`::error title=Schema drift::${diffs.length} schema object(s) differ between live and beta: ${diffs.slice(0, 10).map(d => d.key).join(', ')}`)
  }
  process.exitCode = 1
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(e => { console.error(e.message); process.exitCode = 1 })
}
