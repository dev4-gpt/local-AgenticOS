# Veloce Public Release And Client Deployment Strategy

Last updated: 2026-07-26

## Objective

Release the public share links now while preserving the production boundary for
future client runtimes: one maintained codebase, many isolated client editions,
and no hosted production use of personal Claude, Codex, Gemini, or similar CLI
subscriptions.

## Surfaces

| Surface | Local port | Public status | Host | Deployment root |
| --- | ---: | --- | --- | --- |
| Landing page | 4321 | Safe to share now | Vercel static | `source/public-site` |
| Editorial front door + `/api/lead` | 3565 | Safe to share now; runtime dropdown live | Vercel serverless | `source/product-experience` |
| Operator/product runtime | 3939/3737 | Owner-only local runtime | Local persistent compute | `source` |
| Local client-safe test | 3940 | Local verification only | Local Next runtime | `source` with `dev:client-runtime` |
| Internal cloud client-safe test | n/a | Live internal validation runtime | GCP Cloud Run | `source` image `client-runtime:v8` |

## What Goes Live First

1. `source/public-site` is deployed to Vercel as the public landing link.
2. `source/product-experience` is deployed to Vercel as the cinematic
   product/front-door link.
3. The product header has a `Runtime access` dropdown:
   - `Request runtime` -> `/start`
   - `Client login` -> the internal Cloud Run client runtime login
4. Keep `NEXT_PUBLIC_APP_URL` unset unless there is an authenticated,
   client-safe runtime to open. Feature cards should route to contact or
   `/start`, never to `localhost` or the private operator workspace.
5. Add Supabase environment variables in Vercel when lead capture is ready:
   - `source/public-site/public/config.js`: `supabaseUrl` and `supabaseAnonKey`
     for anon, insert-only landing capture.
   - `source/product-experience`: `SUPABASE_URL` and
     `SUPABASE_SERVICE_ROLE_KEY` for server-side `/api/lead`.

## Current Internal Cloud Test

The first GCP client-safe runtime is deployed as an internal validation target,
not as the runtime for every future client.

The current local-versus-client dependency classification is maintained in
[docs/runtime-capability-matrix.md](./docs/runtime-capability-matrix.md). It is
the checklist to use before adding a provider key or enabling another route in
a client manifest.
The full business readiness decision across frontend, APIs, data, auth,
deployment, security, scaling, observability, and recovery is maintained in
[docs/client-runtime-13-layer-readiness.md](./docs/client-runtime-13-layer-readiness.md).

```text
GCP project: veloce-agenticos-2026
Region: asia-south1
Service: veloce-cloud-test
Image: asia-south1-docker.pkg.dev/veloce-agenticos-2026/veloce/client-runtime:v8
Primary service URL: https://veloce-cloud-test-1075094991117.asia-south1.run.app
Product dropdown login URL: https://veloce-cloud-test-mquo4bf7aq-el.a.run.app/login?next=%2F
Runtime service account: veloce-cloud-test-run@veloce-agenticos-2026.iam.gserviceaccount.com
Storage bucket: gs://veloce-agenticos-2026-veloce-cloud-test
Supabase project URL: https://ppmoqjtmjtfxadsnejqc.supabase.co
Secret Manager entry: veloce-veloce-cloud-test-supabase-anon-key
Allowed runtime user: aryamandev777@gmail.com
```

Verification completed:

- Cloud Build image `client-runtime:v8` built successfully.
- Cloud Run service deployed with `min-instances=0`, `max-instances=1`, and
  app-auth mode.
- Client-runtime v8 acceptance verification passed; security headers are active.
- `npm run verify:client-runtime` passed against the Cloud Run URL.
- Product page was redeployed and aliased to
  <https://product-experience-five.vercel.app>.
- The product dropdown opens `Client login` to the Cloud Run runtime, not to
  `localhost`.

## Client Runtime Rule

The 3939 runtime is the private operator edition. It currently contains local
filesystem, local memory, provider credentials, CLI subprocesses, and internal
operator routes. A client deployment is not a lifted copy of 3939.

Decision: the client runtime should feel like the 3939 Veloce OS in UI,
navigation, and operating model, but it must run as a gated client edition. A
public signup creates an intake/deployment request only. No client runtime is
created, billed, or opened until Veloce approves it.

Client credentials belong to the client. The production runtime stores only
secret references in a managed secret store, and the browser renders connection
state, scopes, and budget status rather than raw credentials.

Before a client runtime goes live, create a Client Edition Manifest and replace
or exclude every local-only capability:

- Personal CLI sessions become provider API calls or client-authorized
  enterprise integrations.
- Local files and vault paths become tenant-scoped database/object storage.
- Raw shell or arbitrary local execution becomes allowlisted worker jobs.
- External publishing, outreach, spending, and destructive actions require
  human approval.
- Each client receives isolated secrets, storage, logs, budgets, and runtime
  configuration.

## Single-Tenant Pipeline

```text
one repository
  -> tested image
  -> client project
      -> authenticated portal
      -> backend-for-frontend/API
      -> private worker
      -> tenant database/object storage
      -> tenant secret namespace
      -> budget caps, warnings, audit logs
```

Use this for the first three to five clients. Do not fork the repository per
client. Parameterize branding, capability allowlists, provider models, storage
identifiers, domains, budgets, and retention policy.

## Gated Signup And Provisioning Flow

```text
public landing/product page
  -> signup/intake form
  -> Supabase deployment_request
  -> Veloce approval
  -> client project/runtime provisioning
  -> authenticated client login
  -> client connects provider credentials
  -> approved 3939-style client OS opens
```

The intake form may collect business requirements, tool names, desired
workflows, budget preference, and approval rules. It must not collect raw API
keys, passwords, private documents, or production credentials. Credential
connection happens only inside the authenticated client runtime or through a
reviewed secure onboarding form that writes directly to the backend secret
store.

## GCP Runtime Provisioning

GCP is the default runtime plane for approved client editions:

- Cloud Run hosts each approved client runtime. The default `app-auth` mode uses
  `--allow-unauthenticated` at the edge so the runtime can render its login
  page, then enforces Supabase Auth in the application middleware. The optional
  `cloud-run-iam` mode keeps `--no-allow-unauthenticated` for organizations that
  want identity-aware proxy access instead.
- Secret Manager stores client-owned provider keys and OAuth material.
- Cloud Storage stores client-scoped files, deliverables, and memory artifacts.
- A per-client runtime service account receives only its own storage and secret
  access.
- In `cloud-run-iam` mode, Cloud Run IAM grants access only to explicitly
  approved client/admin emails. In `app-auth` mode, the individual Supabase
  Auth account is the gate and the credentials tab is status-only.
- Provider credentials are mounted into the runtime as Secret Manager-backed
  env vars through `--set-secrets`.

The semi-automated provisioner is:

```bash
npm run provision:gcp-client -- --config client-blueprints/acme.gcp.json
```

It dry-runs by default. To execute:

```bash
npm run provision:gcp-client -- --config client-blueprints/acme.gcp.json --apply
```

For the two-phase flow used by the current GCP provisioner:

```bash
npm run provision:gcp-client -- --config client-blueprints/acme.gcp.json --phase prepare --apply
npm run provision:gcp-client -- --config client-blueprints/acme.gcp.json --phase deploy --apply
```

`--apply` refuses to run unless the manifest has `approved: true` and
`acknowledgeClientSafeRuntime: true`. IAM mode additionally requires at least
one allowed invoker email.
This prevents accidentally deploying the private 3939 operator runtime.

For local client-edition testing, keep the owner runtime on 3939 and use 3940:

```bash
npm run dev:client-runtime -- --env-file .private-client-kits/local-test.env --port 3940
```

The local env file is ignored by git and must be `chmod 600`. The runtime
credential status endpoint is `/api/client-runtime/credentials` and returns
only connected/not-connected booleans.

## Required Gates Before A Client Runtime Link

These gates are summarized in the 13-layer readiness document. A Cloud Run URL
is an internal validation link until the enabled capabilities have passed the
adapter, tenant-isolation, budget, and recovery checks.

- Authentication, logout, and session expiry.
- Tenant A cannot enumerate, read, mutate, or infer Tenant B data.
- Browser bundles and logs contain no credentials or local paths.
- Provider calls use the intended client key and budget.
- Long jobs survive request termination and have bounded retry/idempotency.
- External actions require the documented approval.
- Data export, backup, deletion, and offboarding are documented.
- Mobile, keyboard, reduced-motion, and error states are verified.
- Dependency, secret, and container scans are clean.
- Rollback to the previous tested image is documented.

## Deployment Commands

From `source/public-site`:

```bash
npm run build
vercel deploy --prod
```

From `source/product-experience`:

```bash
npm run build
vercel deploy --prod
```

For the current Codex/Vercel connector, deploy each surface from its own
project root so the correct `package.json` and `vercel.json` are used.

## Current Links

Confirmed on 2026-07-26:

- Landing page: <https://veloce-agenticos-public.vercel.app>
- Product/front door: <https://product-experience-five.vercel.app>
- Request runtime: <https://product-experience-five.vercel.app/start>
- Internal cloud client login:
  <https://veloce-cloud-test-mquo4bf7aq-el.a.run.app/login?next=%2F>
- Internal cloud client service:
  <https://veloce-cloud-test-1075094991117.asia-south1.run.app>

Do not share:

- Landing page: the `public-site` Vercel project binding exists locally, but
  <https://public-site-five.vercel.app> currently serves unrelated legacy FDE
  content and must not be shared as the Veloce landing page. Use
  <https://veloce-agenticos-public.vercel.app> instead.
- `veloce-cloud-test` as a real client deployment. It is the first internal
  approved-client manifest and must be cloned into separate service, storage,
  auth membership, and secret namespaces before onboarding an external client.
