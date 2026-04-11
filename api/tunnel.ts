import type { VercelRequest, VercelResponse } from '@vercel/node'

const SENTRY_HOST = 'sentry.io'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).end()
    return
  }

  try {
    const body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body)

    // The first line of a Sentry envelope is the header JSON containing the DSN
    const envelopeHeader = JSON.parse(body.split('\n')[0])
    const dsn = new URL(envelopeHeader.dsn as string)

    if (!dsn.hostname.endsWith(SENTRY_HOST)) {
      res.status(400).json({ error: 'Invalid DSN host' })
      return
    }

    const projectId = dsn.pathname.replace('/', '')
    const upstreamUrl = `https://${dsn.hostname}/api/${projectId}/envelope/`

    const upstream = await fetch(upstreamUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-sentry-envelope' },
      body,
    })

    res.status(upstream.status).end()
  } catch {
    res.status(400).end()
  }
}
