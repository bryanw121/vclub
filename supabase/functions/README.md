# Edge functions

| Function | Caller | Auth | `verify_jwt` |
| --- | --- | --- | --- |
| `send-chat-push` | Database Webhook on `messages` INSERT | service-role bearer or `x-webhook-secret` | `false` |
| `check-push-receipts` | pg_cron every 30 min (migration `20261024120500_push_receipts.sql`) | service-role bearer or `x-webhook-secret` | `false` |
| `places-proxy` | the app, via `supabase.functions.invoke('places-proxy')` | user JWT checked by the gateway | `true` |

`verify_jwt` is declared in [`../config.toml`](../config.toml) and applied on deploy.
Shared code lives in `_shared/` (`supabase.ts`: service-role client, Expo constants;
`webhook.ts`: request authentication). Imports of local files need the `.ts` extension.

## Webhook authentication

`send-chat-push` and `check-push-receipts` run with `verify_jwt = false`, so they
check the request themselves with `requireWebhookAuth` (`_shared/webhook.ts`).
A request is accepted when **either**

- `Authorization: Bearer <token>` equals the function's `SUPABASE_SERVICE_ROLE_KEY`
  (Supabase injects this secret into every function; nothing to set), **or**
- `x-webhook-secret: <secret>` equals the `WEBHOOK_SECRET` function secret.

Anything else gets `401`. Comparison is constant-time. The bearer must be the exact
service-role key the function sees at runtime.

`WEBHOOK_SECRET` is new and **optional**. The existing service-role bearer keeps
working, so nothing has to change for pushes to keep flowing. Set one if you would
rather not put the service-role key in a Dashboard webhook header:

```bash
supabase secrets set WEBHOOK_SECRET="$(openssl rand -hex 32)"
```

then in Dashboard → Database → Webhooks → the `messages` INSERT webhook, replace the
`Authorization` header with `x-webhook-secret: <the same value>`.

pg_cron keeps using the service-role bearer from Vault (`service_role_key`).

### Limits

`send-chat-push` skips a message id it handled in the last 10 minutes, to absorb
webhook retries. The memory is per function instance and is lost on cold start, so
it is best effort only; a durable guarantee would need a column on `messages`.

## `places-proxy`

Needs the `GOOGLE_MAPS_KEY` secret. `ALLOWED_ORIGINS` is optional: a comma-separated
list of browser origins allowed by CORS (for example
`https://app.example.com,http://localhost:8081`). Unset means `*`. Native apps send no
`Origin` header and are unaffected.

## Deploying

From the repo root, logged in with `supabase login` and linked with
`supabase link --project-ref <ref>`:

```bash
supabase functions deploy send-chat-push
supabase functions deploy check-push-receipts
supabase functions deploy places-proxy
# or all at once:
supabase functions deploy
```

Deploy applies `verify_jwt` from `config.toml`. After the first deploy from this
config, check Dashboard → Edge Functions that the two push functions show JWT
verification off and `places-proxy` on.

Quick check of a deployed push function (expect `401`, then not `401`):

```bash
curl -i -X POST "https://<ref>.supabase.co/functions/v1/check-push-receipts"
curl -i -X POST "https://<ref>.supabase.co/functions/v1/check-push-receipts" \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY"
```
