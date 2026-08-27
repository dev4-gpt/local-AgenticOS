# OpenReply — Instagram comment-to-DM automation

## Decision

**Staged, isolated marketing pilot. The deployment blueprint is ready, but no
account is connected and delivery remains disabled.** The upstream candidate
`c51f04d9423f3e38d1e9c13e8077bf0b8f40bfa7` passed 145 tests and typecheck on
2026-08-27, but its production dependency audit reported 3 critical and 10
high advisories. It is therefore recorded as blocked, not approved or
deployable. OpenReply is a self-hosted Instagram comment-to-DM application,
not a Veloce client-runtime capability. Its dashboard, worker, PostgreSQL
database, Redis queue, Meta permissions, and encryption key must remain in a
separate project and separate data stores.

Primary source: [diwenne/openreply](https://github.com/diwenne/openreply).
Read the upstream [setup guide](https://github.com/diwenne/openreply/blob/main/docs/setup.md)
at the time of implementation because Meta and host requirements change.

## Why it fits later

It can turn an opted-in Instagram comment such as `LINK` into a compliant DM
campaign and record delivery/link results. Veloce can use the resulting,
non-sensitive campaign evidence for a marketing dashboard, but must not take
over Meta authentication, message sending, or Instagram token storage.

```text
Instagram / Meta webhook
  -> standalone OpenReply web app (Vercel)
       -> PostgreSQL + Redis (standalone Railway project)
       -> standalone long-running worker
       -> Meta private reply API
  -> optional, approved aggregate metrics export
       -> Veloce marketing evidence record
```

There is deliberately no direct connection to `product-experience`, the
tenant runtime, Supabase credentials, or the control-plane provisioners.

## Preconditions before a pilot

- A Facebook account and an Instagram **Business or Creator** account.
- A Meta developer app configured for Instagram Login.
- A Resend account with a verified sender domain for magic-link login.
- A separate Vercel project for the web app.
- A separate Railway project with PostgreSQL, Redis, and an always-on worker.
- A single-account, internal pilot purpose and approved campaign copy.

For the first pilot, keep the Meta app in the self-owned/tester scope. Do not
offer the instance to other users or clients until the required Meta App Review
and business verification are complete.

## Implementation sequence

1. Fork the upstream repository into the Veloce GitHub organization; pin a
   reviewed commit with zero critical/high production dependency advisories
   and retain the MIT license/attribution. Do not deploy the currently blocked
   candidate recorded in the tracked manifest.
2. In a **new Railway project**, create PostgreSQL, Redis, and a worker
   service. The worker build command is `npm run db:generate`; start command
   is `npm run worker`.
3. Run the database migration once from a trusted local terminal using the
   database's public connection URL. Do not run migrations from Vercel.
4. In a **new Vercel project**, deploy the web app. Configure public Railway
   proxy URLs for the web app; the worker may use Railway internal URLs.
5. Generate and store all application secrets directly in Vercel/Railway:
   `NEXTAUTH_SECRET`, `CRON_SECRET`, `ENCRYPTION_KEY`, and
   `WEBHOOK_VERIFY_TOKEN`. The exact `ENCRYPTION_KEY` must match in the web
   app and worker. Never paste these into Veloce source, a ticket, or chat.
6. In Meta, configure the exact deployed URLs from OpenReply:
   - OAuth callback: `https://<openreply-domain>/api/instagram/callback`
   - Webhook callback: `https://<openreply-domain>/api/webhook`
   - Subscribe to the `comments` and `messages` webhook fields.
7. Add the owner's Instagram account as an Instagram Tester and accept the
   tester invite inside the Instagram mobile app.
8. Test with Meta's webhook test event, then one non-commercial private test
   campaign. Confirm `/api/health` reports a healthy worker, a queue job
   completes, and a `SENT` row appears in the DM log before any content
   promotion.

The tracked, secret-free deployment contract is in
[`infrastructure/openreply`](../../infrastructure/openreply/README.md). Validate
it with `npm run verify:openreply-pilot`. After a reviewed upstream commit and
deployed URL have been recorded in a private manifest, run the strict live
check with `npm run verify:openreply-pilot -- --strict --manifest <path>
--url https://<openreply-domain>`.

## Veloce integration contract (only after pilot evidence)

If OpenReply proves useful, add a small outbound metrics adapter—not database
sharing. The adapter may ingest aggregate campaign identifiers, counts,
timestamps, delivery state, click totals, and error categories. It must not
copy Instagram access tokens, DM bodies, commenter handles, raw webhook
payloads, email session data, or database/Redis URLs into Veloce.

All campaign activation, public replies, outbound DMs, and changes to Meta
permissions remain human-approved external actions.

## Rollback

Disable the campaign in OpenReply, pause the worker deployment, revoke the
Meta token/app permissions if needed, and revoke/rotate OpenReply-only
secrets. This must not affect the Veloce application or tenant runtime.
