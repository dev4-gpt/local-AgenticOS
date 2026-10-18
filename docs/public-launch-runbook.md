# Public Veloce AgenticOS launch runbook

The public website is open to everyone. Activation is governed: a request is pending until email verification, payment, manifest review, provisioning, smoke testing, and evidence completion succeed.

## Domains

- `veloceos.cloud`: product, catalog, pricing, public onboarding, legal, and support.
- `app.veloceos.cloud`: currently the editorial `product-experience` site with
  a live link to one approved test runtime. Current source adds a shared
  `/login` entry, but it is not deployed or accepted. Test credential and
  credit pages against the exact tenant Cloud Run URL until shared routing is proven.
- Tenant Cloud Run URLs remain the initial isolation boundary. Add branded tenant subdomains only after shared-portal routing is proven.

Current source sends `Client login` to `/login`, not to a globally configured
tenant URL. The server-side request route is off unless `CLIENT_LOGIN_ENABLED=1`.
It requires a Supabase publishable/anon key, the existing service-role lookup,
an exact HTTPS `PUBLIC_APP_URL`, and a working durable rate limiter. Unknown,
inactive, or ambiguous accounts receive the same generic acknowledgement and
no Auth email; existing active accounts receive a non-signup Supabase Magic
Link. The callback rechecks active tenant membership before handoff. Before
live activation, inspect a delivered email for the exact allowlisted callback
path, verify rate-limit failure behavior, run J08/J13 with an approved tenant,
and prove revoked access cannot reach a workspace. None of this changes the
currently deployed test-runtime link until a reviewed release.

### Public login deployment preflight (observed October 9, 2026)

The live `https://app.veloceos.cloud/login` returned 404. Its Runtime access
menu still linked `Client login` to the cloud-test Cloud Run origin, while
current source links to `/login`. Vercel project `veloce-agentic-os/product-experience`
served a Production deployment from `main` commit
`c1f41ca9f47d64190030cc237c7e8763576b1802`; it was not connected to a
Git repository. Pushing the current WIP branch therefore does not update this
site. Vercel's Production environment listed `SUPABASE_ANON_KEY` but not
`CLIENT_LOGIN_ENABLED`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, or
`PUBLIC_APP_URL`; no shared variables were linked. Do not infer readiness from
the locally passing Next build, which does include `/login` and the request API.

Supabase Auth URL Configuration in project `ppmoqjtmjtfxadsnejqc` listed only
the cloud-test wildcard and internal-beta `/auth/callback` redirect. It did
not list `https://app.veloceos.cloud/auth/callback`. Its default Site URL was
the cloud-test origin. These are read-only observations, not permission to
change shared production Auth settings, reveal secret values, or deploy.

Before a customer-facing login release:

1. Review an immutable source commit and deploy it to a non-production Vercel
   Preview first, without assigning `app.veloceos.cloud` or connecting Git for
   automatic production builds as a side effect. Record the deployment ID and
   source commit. Preview environment variables must be configured separately
   if the sign-in flow will be tested there.
2. With approved project-wide change scope, configure the required server-only
   login variables and an exact callback redirect for the tested origin. Keep
   production `CLIENT_LOGIN_ENABLED` off. Enable it only on the configured
   preview to check the durable rate limiter, active-account lookup, delivered
   Magic Link, callback, and tenant handoff.
3. Test active, unknown, inactive, ambiguous, revoked, and second-tenant
   accounts on that exact preview and capture redacted J08/J13 receipts. Verify
   the public header points to `/login`, the page loads, and the callback
   returns to the correct tenant without leaking a session token.
4. Only after the broader J01-J15 release gates and operator approval, promote
   the reviewed deployment/configuration to `app.veloceos.cloud`. Recheck the
   custom domain, exact redirect, login, rollback target, and release ledger.

The previous WIP backup push is recoverability evidence, not a preview
deployment or a public release.

Configure both custom domains at the hosting layer and keep Cloudflare DNS records for the active hosting targets. Do not point the public domain at a tenant runtime directly.

## Required server configuration

`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`, `CLIENT_LOGIN_ENABLED`, `RESEND_API_KEY`, `PUBLIC_EMAIL_FROM`, `LEAD_NOTIFICATION_*`, `PUBLIC_APP_URL`, `PUBLIC_SITE_URL`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_SETUP_PRICE_ID`, `STRIPE_PLATFORM_PRICE_ID`, `STRIPE_CREDIT_PRICE_ID`, `CONTROL_PLANE_OPERATOR_SECRET`, `CONTROL_PLANE_WORKER_TOKEN`, and `CONTROL_PLANE_PROVISIONER_URL` are server-side values. Add `TURNSTILE_SECRET_KEY` when abuse-challenge enforcement is enabled. Never expose these as `NEXT_PUBLIC_*` values.

The Vercel app authenticates to the public Cloud Run provisioner through short-lived Vercel OIDC federation. Add these non-secret Production configuration values only after the GCP Workload Identity Pool and dedicated invoker identity exist:

```env
GCP_PROJECT_NUMBER=1075094991117
GCP_WORKLOAD_IDENTITY_POOL_ID=vercel
GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID=product-experience
GCP_CONTROL_PLANE_INVOKER_SERVICE_ACCOUNT=veloce-vercel-control-plane@veloce-agenticos-2026.iam.gserviceaccount.com
```

Do not replace this with a downloaded service-account JSON key. The inbound Vercel OIDC token is exchanged for a short-lived Google token at request time.

Create the Stripe webhook endpoint at `/api/billing/webhook` for checkout completion, invoice payment failure, and subscription changes. Test signature verification and duplicate-event handling before live mode.

## Database promotion

Apply `product-experience/supabase-public-launch-control-plane.sql` after the existing deployment-request and client-runtime migrations. Verify that service-role access is the only public-launch control-plane access and that browser roles cannot read onboarding, provider secret references, billing, or provisioning rows.

Apply `product-experience/supabase-v45-onboarding-verify-token.sql` before deploying the verification API that calls `consume_client_onboarding_verify_token`. Check that only `service_role` can execute it. The function consumes the link and updates the onboarding account and request in one transaction; if any write fails, the link remains usable for retry. Do not deploy the new API while this migration is absent.

Apply `product-experience/supabase-v46-onboarding-setup-token.sql` before deploying the setup API that calls `consume_client_onboarding_setup_token`. Check that only `service_role` can execute it. The function binds the verified auth user to the active tenant as owner and consumes the setup link in one transaction. A failed write leaves the link unconsumed for retry; a consumed, expired, or revoked link cannot establish another session. Configure `PUBLIC_APP_URL` as the HTTPS public app origin and allowlist its `/auth/callback` URL in Supabase Auth redirects. The callback resolves the active tenant runtime and transfers the session there. Do not deploy the new API while the migration or redirect allowlist is absent.

## Provisioning worker boundary

The public web process never runs `gcloud`, deploys Cloud Run, creates secrets, or mutates tenant infrastructure. Deploy `workers/public-provisioner` as the IAM-protected `CONTROL_PLANE_PROVISIONER_URL` service. It accepts only approved manifests, enforces the allowed project/region and Artifact Registry repository, rejects secret-like manifest content, and delegates GCP mutations to the IAM-protected `workers/gcp-provisioner` adapter at `GCP_PROVISIONER_URL`. The public worker obtains a Cloud Run identity token for the adapter from the Cloud Run metadata server; the adapter also verifies `CONTROL_PLANE_WORKER_TOKEN` as a defence-in-depth application boundary.

The adapter runs the existing `scripts/provision-gcp-client.mjs` only with its attached Cloud Run service account. Its first deployment sets `GCP_PROVISIONER_ALLOW_APPLY=0`; this allows health and rejection testing without mutation. A real deployment is an explicit `manifest.provisioning.phase="deploy"` request, after Secret Manager versions named in `secretEnv` already exist. The worker calls `/api/onboarding/provision-result` with the control-plane secret. Promotion to active must call `/api/onboarding/activate` only after smoke testing and rollback evidence pass.

The worker records request and tenant IDs, manifest version/hash, image digest, Cloud Run revision, created resources, evidence results, rollback target, retry count, and automation identity. Failed provisioning remains failed or rolled back; it never silently activates.

For a customer prepare, first inspect the **final scope-adjusted manifest** with the operator-only review action. The review response makes no provisioning write or dispatch. After a human has reviewed the full output, use its SHA-256 in a separate approval command against the same request, file, and environment:

```bash
npm run approve:client-manifest -- --review --request-id <request-id> --manifest <reviewed-manifest.json> --url <reviewed-public-app-url>
npm run approve:client-manifest -- --approve --expected-hash <sha256-from-review> --request-id <request-id> --manifest <reviewed-manifest.json> --url <reviewed-public-app-url>
```

Approval rejects a missing or stale digest, including changes to the commercial scope after review. Record the reviewer, final digest, manifest version, request ID, and timestamp in the private release evidence. Do not automatically chain review into approval for a customer. The fixed disposable control-plane canary uses the same digest contract programmatically, but its result is not a human-review receipt. A legacy prepare run without pinned digest evidence cannot proceed to deploy; review its state and arrange a fresh authorized prepare.

The public worker sends the Cloud Run ID token in `Authorization` and the
independent control-plane worker token in `X-Control-Plane-Worker-Token`.
Keeping those credentials separate prevents either authentication layer from
shadowing the other during the Cloud Run request path.

## Customer journey acceptance

1. Submit a public request with terms/privacy consent and no credentials.
2. Consume the single-use verification link.
3. Create the Stripe setup/subscription Checkout session.
4. Confirm the webhook moves the account to `manifest_review` and is idempotent.
5. Approve a manifest and queue provisioning.
6. Provision an isolated runtime and run research, budget, tenant-isolation, deletion, rollback, and visual-quality evidence.
7. Activate the account and send a single-use setup link.
8. Add a BYOK provider in the private portal, validate server-side, rotate/revoke it, or purchase managed credits.
9. If the tenant cannot or does not want to manage a provider key, submit a managed-provider access request with the provider and requested budget. Team approval is required; the request itself never activates a provider.
10. Verify estimate, reservation, settlement/refund, pricing snapshot, audit evidence, support, suspension, export, and offboarding.

## Launch limits

Start with bounded concurrency, low managed-credit exposure, conservative quotas, approval for external delivery/high-risk providers, and manual review of the first customer evidence bundles. Expand provider availability only when its evidence bundle is complete and the catalog status is updated.
