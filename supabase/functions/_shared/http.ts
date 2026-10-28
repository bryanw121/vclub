/**
 * CORS + JSON helpers for edge functions the app calls from a browser.
 * Pure (no Deno globals at module top level) so jest can import it.
 *
 * ALLOWED_ORIGINS (optional secret, comma-separated) restricts browser callers;
 * unset means `*`. Native apps send no Origin header and are unaffected.
 */

const ALLOW_HEADERS = 'authorization, x-client-info, apikey, content-type'

export function corsHeaders(origin: string | null, allowedOrigins: string | undefined): Record<string, string> {
  const allowed = (allowedOrigins ?? '').split(',').map(o => o.trim()).filter(Boolean)
  const base = { 'Access-Control-Allow-Headers': ALLOW_HEADERS, 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
  if (!allowed.length) return { ...base, 'Access-Control-Allow-Origin': '*' }
  const headers: Record<string, string> = { ...base, Vary: 'Origin' }
  if (origin && allowed.includes(origin)) headers['Access-Control-Allow-Origin'] = origin
  return headers
}

export function json(body: unknown, status: number, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...headers, 'Content-Type': 'application/json' } })
}
