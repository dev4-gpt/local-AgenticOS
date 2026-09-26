# Incident response plan

Structure follows NIST SP 800-61 Rev. 2 (Computer Security Incident
Handling Guide), adapted to this system's actual architecture rather than
generic language. Every technical control referenced below is real and
already built -- see `docs/soc2-readiness-self-assessment.md` for the
evidence citations.

## 1. Purpose and scope

Covers any suspected or confirmed incident affecting: the public
onboarding/billing app (`product-experience`, Vercel), the control-plane
workers (`gcp-provisioner`, `public-provisioner`, `managed-openrouter`,
Cloud Run), the shared Supabase database, any tenant runtime, or any
credential (Stripe, GCP, Supabase, OpenRouter, or a tenant's own BYOK
secret).

## 2. Roles

| Role | Responsibility |
|---|---|
| Incident commander | Owns the response end-to-end, makes containment/rollback decisions, is the single point of external communication. |
| Technical responder | Investigates, executes containment/eradication steps, documents evidence. |
| Communications lead | Notifies affected tenants and, where required, regulators/payment processor, in plain language. |

At current team size, one person may hold multiple roles. The point of
naming them separately is that every incident must have someone
explicitly *deciding*, not just multiple people investigating in
parallel with no owner.

For the controlled internal beta, Aryaman is the incident commander,
technical responder, and communications lead. This interim assignment is
superseded only by a documented delegate in
`docs/organizational-structure.md`.

## 3. Preparation (controls already in place before any incident)

- **Credential hygiene**: every credential-handling path in this system
  follows fetch-and-pipe-directly discipline -- no secret is ever stored in
  plaintext, echoed to a log, or held in a chat/document. Secret Manager
  is the source of truth for every production credential.
- **Least privilege**: tenant roles (`owner`/`admin`/`member`/`viewer`)
  are enforced, not just stored (`product-experience/supabase-v39-tenant-rbac.sql`).
  Operator actions are gated by `CONTROL_PLANE_OPERATOR_SECRET`, itself a
  Secret-Manager-held value.
- **Change control**: every production change passes CI (`verify:secrets`,
  `verify:security`, `verify:policy-gates`, the focused test suite) before
  merge, and pre-build/pre-deploy drift gates refuse to build on top of an
  already-drifted environment.
- **Rollback readiness**: a real rollback mechanism exists and has been
  proven live for both the control-plane services (Cloud Run revision
  rollback) and tenant runtimes (`/api/onboarding/rollback`,
  `scripts/rollback-client-manifest.mjs`).
- **Backup/restore**: `scripts/client-lifecycle.mjs --mode export`/`--mode restore`
  is a real, timed, proven recovery mechanism (see the Phase 3f drill in
  `docs/production-operations.md`).

## 4. Detection and analysis

Sources that can surface an incident:
- CI failure on `verify:secrets` (a real secret pattern matched in the
  repository -- this has already fired for genuine reasons in this
  engagement's history and was always investigated before being
  overridden).
- `npm audit --audit-level=high` failing in CI (a newly-published
  high-severity dependency advisory -- has occurred and was resolved
  live, not dismissed).
- A Stripe webhook returning persistent signature-verification failures
  (historically caused by signing-secret drift between the configured
  value and the endpoint's actual secret -- a real incident already
  handled once in this engagement).
- `client_credit_reservations.reconciliation_status = 'drift'` (the
  managed-provider reconciliation gate, Phase 3e) -- this durably disables
  the managed route automatically the moment it fires; treat any
  occurrence as a real incident requiring investigation, not a false
  positive to silence.
- Unexpected `client_provider_connections` activity for a tenant (a
  credential submitted, rotated, or revoked outside of an expected
  operator action).
- A GCP IAM Policy Analyzer or Cloud Audit Log entry showing an
  unexpected principal invoking an operator-only route.

For any of the above: capture the exact timestamp, the affected
tenant(s), and the specific log/DB row that triggered detection *before*
taking any remediation action, so the evidence isn't destroyed by the fix
itself.

## 5. Containment, eradication, and recovery

### 5.1 Credential compromise (Stripe, GCP, Supabase, or a tenant's own BYOK secret)
1. Rotate the specific credential immediately via its own platform (Stripe
   Dashboard, `gcloud secrets versions add`, Supabase project settings) --
   never reuse a rotation script's own review window as a delay.
2. For a tenant BYOK credential specifically: `scripts/delete-client-credential.mjs`
   destroys the Secret Manager secret and removes the connection record in
   one operator-run step; this is already proven live end-to-end (see
   `docs/gcp-client-runtime-runbook.md`).
3. Confirm no other service was holding a cached copy of the old value
   (Cloud Run env vars pinned to a specific secret *version* need a new
   revision deploy to pick up the rotated value; a value bound as `latest`
   does not update running instances until they restart).

### 5.2 Managed-provider billing anomaly (reconciliation drift)
The system already auto-disables the managed route the moment drift is
detected (Phase 3e, `client_credit_budgets.managed_route_enabled`
durably set `false`). The incident response action is investigation, not
manual containment -- containment already happened automatically. Confirm
via `scripts/reconcile-managed-openrouter.mjs` against the specific
reservation, then decide whether to `restore` (requires a fresh health
check) once the root cause is understood.

### 5.3 Tenant data exposure or suspected cross-tenant access
1. Immediately suspend the affected tenant's Cloud Run service traffic
   (`gcloud run services update-traffic ... --to-revisions=0`) if active
   exploitation is suspected, rather than waiting for a full
   investigation.
2. Verify tenant isolation directly: query `client_provider_connections`/
   relevant tables with the suspected-compromised session's token scoped
   to *another* tenant's slug -- this exact test was proven live during
   the two-tenant strict-mode drill and returns an empty result/refusal
   when isolation holds (`docs/v3.3-current-release-audit.md`).
3. If isolation genuinely failed (not just a false alarm), this is a
   reportable incident under most privacy regimes -- escalate to the
   communications lead immediately, do not wait for full root-cause
   before starting tenant notification.

### 5.4 Payment-processing incident (Stripe)
1. Check `stripe_webhook_events` for the specific `event_id` and its
   `status`/`error_code`.
2. If webhook signature verification is failing broadly (not one event),
   suspect signing-secret drift first -- this has a known, already-fixed
   root cause and remediation in this system's history.
3. Never disable webhook processing entirely as a "fix" -- this silently
   drops real customer payment events. Fix the specific cause instead.

## 6. Post-incident activity

For every incident, however small:
1. Record what was detected, when, how it was contained, and the real
   root cause -- not a guess. This engagement's own practice throughout
   its history has been: verify before claiming a fix worked, with real
   evidence (a log line, a DB read, a live re-test), not narrative
   claims. Apply the same standard to incident write-ups.
2. If the root cause reveals a gap in an automated gate (as it has
   before -- a missing IAM permission, a missing route allowlist entry, a
   stale image), add or fix the automated check so the same class of
   incident cannot recur silently. A fix that isn't backed by a new or
   corrected gate is incomplete.
3. Update this document if the incident revealed a scenario not covered
   above.

## 7. Real incidents on file (informs the playbooks above, not hypothetical)

- Stripe webhook signing-secret drift silently failing every real
  delivery -- found via live testing, fixed by creating a fresh endpoint
  and atomically rotating the secret.
- Missing Artifact Registry IAM permission causing a false-negative
  "image not available" error during tenant provisioning.
- A provisioner allowlist never updated when a new BYOK route (revoke)
  was added, causing every tenant provisioned since to 404 on it.
- A Managed Payments tax-code requirement blocking every custom-priced
  Stripe checkout in live mode, discovered on the first real live
  transaction attempt.

Each of the above was found through live testing and fixed with a
verified, evidenced remediation -- not assumed fixed. This is the standard
this plan expects for every future incident too.
