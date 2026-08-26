# OpenReply isolated pilot infrastructure

This directory is the deployable contract for a future OpenReply pilot. It is
not OpenReply source code and it does not enable Instagram delivery from
Veloce.

## Boundary

- Fork and pin [`diwenne/openreply`](https://github.com/diwenne/openreply) in a
  separate repository.
- Deploy the web/API process to a separate Vercel project.
- Deploy PostgreSQL, Redis, and the long-running worker to a separate Railway
  project.
- Never reuse Veloce Supabase, Redis, service accounts, cookies, or control
  plane secrets.
- Keep delivery disabled until the operator approves one private tester
  campaign.

The web app and worker must share the exact `DATABASE_URL`, `REDIS_URL`, and
`ENCRYPTION_KEY` values. The web app normally uses Railway public proxy URLs;
the Railway worker may use internal URLs. Store all values in the hosts'
secret stores, never in this repository.

## Tracked files

- `openreply-pilot.manifest.example.json` records architecture, routes, safety
  gates, and non-sensitive evidence.
- `openreply.env.example` is a names-only configuration inventory. Copy it to
  each host's secret manager and replace placeholders there.

## Validation

Validate the repository blueprint:

```bash
npm run verify:openreply-pilot
```

For a real pilot, copy the manifest outside the repository, set a reviewed
40-character upstream commit and the deployed HTTPS URL, then run:

```bash
npm run verify:openreply-pilot -- \
  --strict \
  --manifest /private/path/openreply-pilot.json \
  --url https://openreply.example.com
```

The live check performs only `GET /api/health`. It does not enqueue work,
publish a reply, or send a DM. Strict acceptance requires HTTP 200, valid JSON,
and `worker.healthy: true`.

## Meta endpoints

- OAuth callback: `https://<domain>/api/instagram/callback`
- Webhook callback: `https://<domain>/api/webhook`
- Webhook subscriptions: `comments` and `messages`

Use a Meta app tester and an Instagram Business or Creator account for the
first private pilot. Broader users require the applicable Meta review and
business verification.

## Rollback

Disable the campaign, pause the Railway worker, revoke the Instagram token/app
permissions, and rotate OpenReply-only secrets. Veloce remains operational
because it shares no runtime or credential with this deployment.
