# Public Veloce AgenticOS launch runbook

The public website is open to everyone. Activation is governed: a request is pending until email verification, payment, manifest review, provisioning, smoke testing, and evidence completion succeed.

## Domains

- `veloceos.cloud`: product, catalog, pricing, public onboarding, legal, and support.
- `app.veloceos.cloud`: authenticated client portal and credential/credit pages.
- Tenant Cloud Run URLs remain the initial isolation boundary. Add branded tenant subdomains only after shared-portal routing is proven.

Configure both custom domains at the hosting layer and keep Cloudflare DNS records for the active hosting targets. Do not point the public domain at a tenant runtime directly.

## Required server configuration

`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `PUBLIC_EMAIL_FROM`, `LEAD_NOTIFICATION_*`, `PUBLIC_APP_URL`, `PUBLIC_SITE_URL`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_SETUP_PRICE_ID`, `STRIPE_PLATFORM_PRICE_ID`, `STRIPE_CREDIT_PRICE_ID`, `CONTROL_PLANE_OPERATOR_SECRET`, `CONTROL_PLANE_WORKER_TOKEN`, and `CONTROL_PLANE_PROVISIONER_URL` are server-side values. Add `TURNSTILE_SECRET_KEY` when abuse-challenge enforcement is enabled. Never expose these as `NEXT_PUBLIC_*` values.

Create the Stripe webhook endpoint at `/api/billing/webhook` for checkout completion, invoice payment failure, and subscription changes. Test signature verification and duplicate-event handling before live mode.

## Database promotion

Apply `product-experience/supabase-public-launch-control-plane.sql` after the existing deployment-request and client-runtime migrations. Verify that service-role access is the only public-launch control-plane access and that browser roles cannot read onboarding, provider secret references, billing, or provisioning rows.

## Provisioning worker boundary

The public web process never runs `gcloud`, deploys Cloud Run, creates secrets, or mutates tenant infrastructure. Deploy `workers/public-provisioner` as the `CONTROL_PLANE_PROVISIONER_URL` service. It accepts only approved manifests, enforces the allowed project/region, rejects secret-like manifest content, and delegates GCP mutations to a private `GCP_PROVISIONER_URL` adapter. The adapter creates tenant resources, runs the evidence bundle, and the worker calls `/api/onboarding/provision-result` with the control-plane secret. Promotion to active must call `/api/onboarding/activate` only after smoke testing and rollback evidence pass.

The worker records request and tenant IDs, manifest version/hash, image digest, Cloud Run revision, created resources, evidence results, rollback target, retry count, and automation identity. Failed provisioning remains failed or rolled back; it never silently activates.

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
