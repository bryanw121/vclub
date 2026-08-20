/**
 * Edge Function: places-proxy
 *
 * Proxies Google Places API requests server-side to avoid CORS issues
 * and keep the API key out of the client bundle.
 *
 * POST body:
 *   { action: 'autocomplete', input: string, sessiontoken: string }
 *   { action: 'details', place_id: string, sessiontoken: string }
 *
 * Set GOOGLE_MAPS_KEY in Supabase Dashboard → Edge Functions → Secrets
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const LOCATION  = '30.2672,-97.7431' // Austin, TX
const RADIUS    = '50000'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  const GOOGLE_KEY = Deno.env.get('GOOGLE_MAPS_KEY')
  if (!GOOGLE_KEY) {
    return new Response(JSON.stringify({ error: 'Missing GOOGLE_MAPS_KEY secret' }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }

  try {
    const body = await req.json() as { action: string; input?: string; place_id?: string; sessiontoken: string }

    let url: string

    if (body.action === 'autocomplete' && body.input) {
      // NOTE: `types` is deliberately omitted. The legacy Autocomplete API accepts
      // exactly ONE type collection and they cannot be combined, so the previous
      // `types: 'establishment'` made street addresses impossible to return —
      // searching "1100 Congress Ave" found nothing while "Gregory Gym" worked.
      // Omitting it returns establishments AND addresses, which is what a venue
      // picker needs. Do not set it back to a single collection.
      const params = new URLSearchParams({
        input: body.input,
        location: LOCATION,
        radius: RADIUS,
        components: 'country:us',
        sessiontoken: body.sessiontoken,
        key: GOOGLE_KEY,
      })
      url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?${params}`
    } else if (body.action === 'details' && body.place_id) {
      const params = new URLSearchParams({
        place_id: body.place_id,
        fields: 'geometry',
        sessiontoken: body.sessiontoken,
        key: GOOGLE_KEY,
      })
      url = `https://maps.googleapis.com/maps/api/place/details/json?${params}`
    } else {
      return new Response(JSON.stringify({ error: 'Invalid action' }), {
        status: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      })
    }

    const res  = await fetch(url)
    const data = await res.json()

    return new Response(JSON.stringify(data), {
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }
})
