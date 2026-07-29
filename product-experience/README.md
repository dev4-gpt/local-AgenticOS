# Veloce AgenticOS Product Experience

This is the editorial front door for Veloce AgenticOS. It is safe to deploy as
a public Next.js/Vercel surface because its server routes store lead capture
server-side when Supabase is configured. Optional Resend notification is also
server-side; no browser bundle receives either credential.

Current production link: <https://product-experience-five.vercel.app>

It is not the persistent client runtime. Do not point it at the private 3939
operator workspace in production.

Current runtime dropdown:

- `Request runtime` -> <https://product-experience-five.vercel.app/start>
- `Client login` -> <https://veloce-cloud-test-mquo4bf7aq-el.a.run.app/login?next=%2F>

The `Client login` URL is the first internal GCP Cloud Run test runtime. It is
not the permanent shared runtime for all future clients.

## Gated Runtime Intake

`/start` collects the requirements for an approved, isolated client runtime.
It intentionally does not collect credentials, passwords, API keys, or private
documents. The form posts to `/api/deployment-request`, which inserts into the
Supabase `deployment_requests` table when server env vars are configured.

Approved runtimes are provisioned through the root repo's GCP flow:

```bash
npm run provision:gcp-client -- --config client-blueprints/acme.gcp.json
```

The current internal test runtime has already been provisioned from the private
manifest:

```bash
npm run provision:gcp-client -- \
  --config .private-client-kits/veloce-cloud-test.gcp.json \
  --phase deploy \
  --apply
```

Current Cloud Run service:
<https://veloce-cloud-test-1075094991117.asia-south1.run.app>

Before enabling the store, run:

```sql
-- product-experience/supabase-deployment-requests.sql
```

## Environment

Set these in Vercel when lead capture is ready:

```bash
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
```

To receive one notification for every stored public lead and `/start` runtime
request, configure these additional Vercel Production variables after verifying
the sender domain in Resend:

```bash
RESEND_API_KEY=
LEAD_NOTIFICATION_FROM="Veloce Leads <leads@your-domain.example>"
LEAD_NOTIFICATION_TO="your-inbox@example.com"
```

Lead storage is deliberately independent of notification delivery: a Resend
outage cannot discard a submitted lead. Notification email contains only the
contact identity, source, and reply-to address; the full record remains in
Supabase.

Production notification verification on 2026-07-29: Resend verified the
`veloceos.cloud` sender domain; one synthetic non-personal lead returned
`notification: sent`, arrived at the configured operator inbox, and was deleted
from Supabase with HTTP 204. No key or recipient address is recorded here.

Set this only after an authenticated, client-safe runtime exists:

```bash
NEXT_PUBLIC_APP_URL=
```

For a single approved test runtime:

```bash
NEXT_PUBLIC_CLIENT_RUNTIME_URL=https://veloce-cloud-test-mquo4bf7aq-el.a.run.app/login?next=%2F
NEXT_PUBLIC_ALLOW_LOCAL_CLIENT_RUNTIME_LINK=0
```

For an owner-only local test, you may temporarily set both values in the
Vercel project:

```bash
NEXT_PUBLIC_CLIENT_RUNTIME_URL=http://127.0.0.1:3940/login?next=%2F
NEXT_PUBLIC_ALLOW_LOCAL_CLIENT_RUNTIME_LINK=1
```

That link opens the visitor's own computer, so it is useful only when you are
testing from the same machine. Replace it with the Cloud Run URL before
sharing the product page publicly and set the flag back to `0`.

The source has a production-safe Cloud Run fallback in `Header.tsx`, but Vercel
environment variables should still be the source of truth once multiple client
links exist.

When `NEXT_PUBLIC_APP_URL` is unset, feature cards route to the contact section
instead of localhost.

## Deploy

```bash
npm install
npm run build
vercel deploy --prod
```
