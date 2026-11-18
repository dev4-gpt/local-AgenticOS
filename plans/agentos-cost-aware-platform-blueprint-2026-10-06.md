# AgentOS cost-aware platform blueprint

Date: 2026-10-06. Status: proposed, not release approval. Parent goal: evidence-backed AgentOS production readiness. This plan adds a cost-aware platform decision track without replacing the existing customer-journey, source-import, parity, AI-evaluation, and MiroFish work in `docs/superpowers/plans/2026-09-26-production-readiness-program.md`.

## Goal state and decision

The goal is a working, secure commercial product with a verified customer journey, tenant isolation, predictable spending, approved data handling, rollback, and a current-source release receipt. Success is **not** adopting five new vendors. For each proposed service, either prove a narrow benefit against measured baseline and pass the gates below, or record a justified `defer` decision. The present recommendation is:

| Proposal | Decision now | Reason / smallest useful experiment |
| --- | --- | --- |
| Cloudflare Pages | Optional static-public-site spike only | Current `product-experience` uses full-stack Next.js, while Pages supports static export; full-stack Next.js on Cloudflare is a separate Workers/vinext path. Do not move the authenticated workspace or public checkout merely for a free-tier claim. |
| Convex | Defer replacement | Supabase Postgres/RLS already owns tenant membership, graph, financial ledger, and audit. Replacing these contracts is a high-risk data migration. Test one synthetic realtime use case only if an actual customer need appears. |
| Better Auth | Defer replacement | Supabase Auth is live. Better Auth and Convex can integrate, but a second identity source would complicate account recovery, tenant membership, and session migration. Keep one production source of identity. |
| PostHog | Extend existing adapter, privacy first | `src/lib/clientRuntimeObservability.ts` already has server-side capture with safe fields. Add a small approved journey funnel; no session replay or raw prompts/content by default. |
| Cloudflare R2 | Optional storage benchmark | GCS signed uploads already work. Compare a synthetic/new non-sensitive asset class before considering customer-artifact migration; preserve existing signed URL, tenant, deletion, and audit behavior. |

This stack is technically composable, not automatically cheaper or production-grade. The order is **finish the existing release path, instrument minimally, measure, then trial optional replacements**. A Google Cloud budget alert is not a hard cap. The user's approved paid-spend limit for the MiroFish pilot remains $0; no new vendor subscription, paid tier, customer-data transfer, deployment, or production migration is authorized by this plan.

## Current state and gaps

- Public front door: Vercel-hosted `product-experience`; the observed `app.veloceos.cloud/login` returned 404 and an older cloud-test link appeared in the menu (`docs/production-topology-2026-09-25.md`). Verify the current account plan before commercial promotion; Vercel Hobby has a non-commercial restriction. Do not assume the account is on Hobby.
- Workspace: Cloud Run internal beta in `agentos-mvp`, with Cloud Tasks for work; Supabase project `ppmoqjtmjtfxadsnejqc` for Auth/Postgres/RLS/graph/ledger; GCS for private artifacts. Local navigation was repaired after the documented cloud observation, but is not a hosted acceptance receipt. `src/lib/clientAuth.ts`, `src/lib/clientStorage.ts`, `src/lib/clientRuntimeObservability.ts` are the current contracts.
- Source import: two bonus-index records and 111 links were imported into `internal-beta`; this is not the full Skool classroom/video archive. The new import control is local, not in the observed hosted beta. The authorized collection and complete-source evidence requirements in the parent plan remain unchanged.
- Release: current-source hosted J01-J15 acceptance, matching deployment provenance, release-ledger bucket, operational/legal signoff, and cost controls remain open. The last reported verifier returned `releaseReady: false` on `ledger_bucket_not_configured`. Re-run against the current immutable candidate; historical receipts do not transfer.
- AI/MiroFish: deterministic local fixtures are useful but not hosted/model-backed reliability evidence. The private Zep credential was exposed in chat earlier; rotate before any pilot, never paste credentials into plans or telemetry, and keep the pilot within its $0 paid-spend approval.

## Vendor facts to recheck at execution

Pricing and terms change. Use provider dashboards plus these primary sources on the day of each decision; write the observed plan, quotas, billing state, and date into the decision record. Free tiers are quotas, not spend controls or uptime promises.

- [Cloudflare Pages Next.js guide](https://developers.cloudflare.com/pages/framework-guides/nextjs/) recommends Pages for static export and [Workers/vinext](https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/) for full-stack Next.js. [Pages Free limits](https://developers.cloudflare.com/pages/platform/limits/) include build limits; [Workers Free limits](https://developers.cloudflare.com/workers/platform/limits/) include request and CPU limits.
- [Convex pricing](https://www.convex.dev/pricing) has Free quotas and overage behavior differs by plan. [Convex authorization guidance](https://docs.convex.dev/auth/overview) requires authorization in public functions; Supabase RLS does not transfer automatically. [Better Auth's Convex integration](https://www.better-auth.com/docs/integrations/convex) exists, but is not an automatic migration from Supabase Auth.
- [PostHog pricing](https://posthog.com/pricing) includes free analytics and replay allowances with different retention/limits. [Session replay](https://posthog.com/docs/session-replay) may capture sensitive interactions; its collection, masking, consent, and deletion must be reviewed before enabling. A 45-day customer-data retention preference cannot be met by assumption when vendor defaults differ.
- [R2 pricing](https://developers.cloudflare.com/r2/pricing/) has free Standard storage and operation allowances and no direct R2 egress fee, but storage/operations above allowances and connected services may cost money. [R2 setup](https://developers.cloudflare.com/r2/get-started/) may require a billing subscription; evaluate billing exposure before creating it.
- [Vercel Hobby terms](https://vercel.com/docs/plans/hobby) restrict commercial use. [Supabase pricing](https://supabase.com/pricing) and [Cloud Run pricing](https://cloud.google.com/run/pricing) likewise require actual usage and plan checks; existing services are not inherently free at production scale.

## GOAP route

State variables: `journey_proven`, `source_import_complete`, `hosted_parity_proven`, `security_approved`, `cost_bounded`, `release_ready`, and per-vendor `adopt/defer`. Today, none of the first six may be assumed true from a local test or this plan. The lowest-risk path is to complete existing invariants before platform migration. Relative costs below include engineering effort and operational risk, not a dollar quote.

| Action | Preconditions | Verified effect | Relative cost/risk |
| --- | --- | --- | --- |
| Inventory deployment, bills, quotas, and data flows | Read-only access to repo and owner dashboards | Dated baseline and option comparison | S / low |
| Close security/governance decisions | Data inventory and accountable owner | Approved event/storage boundaries, retention and deletion rules | M / medium |
| Contain current telemetry and rotate exposed pilot key | Risk boundary and deployed configuration | Approved or disabled egress; old pilot key revoked | S-M / medium |
| Repair and prove current journey | Immutable candidate and test accounts | J01-J15 and two-tenant receipts or exact failures | L / medium |
| Add minimal PostHog funnel | Approved event schema and consent basis | Pseudonymous, redacted event receipt and funnel | S-M / medium |
| Trial static Pages or synthetic R2 | Baseline plus no-paid-exposure approval | Reversible cost/performance/security comparison | M / medium |
| Trial Convex + Better Auth | Measured unmet need, separate sandbox, migration design | Synthetic proof or explicit defer, no live identity split | L / high |
| Re-run release gate | All critical evidence and owner approvals | `releaseReady: true` or a truthful blocked decision | M / high |

The apparent shortest route to the goal is the first three actions, followed by the last; vendor trials are optional branches, not critical-path prerequisites. Replan when a precondition fails, a provider's free/terms policy changes, measured cost exceeds the agreed ceiling, or a customer need justifies a different backend.

## Construction steps

Execution rule for every step: use the existing branch/PR/CI process once GitHub authentication works; until then, work on a reviewable local branch/commit and do **not** push or deploy. Record SHA, environment, evidence path, owner, and rollback target. No step may touch production state without its own approval. Run `git diff --check` and focused tests before committing code. Model tier is planning guidance, not a request to switch the current assistant.

### 1. Baseline and decision record

Context: the parent plan and `docs/production-readiness-handoff-2026-10-05.md` contain observed status, but not a current provider-by-provider cost profile. Read the live current configuration and invoices in read-only mode; distinguish account plan from repo assumptions.

- Task: inventory Vercel plan, Supabase plan/usage, GCP Cloud Run/Tasks/GCS usage, PostHog, Sentry, Stripe transaction fees, Resend/email, managed OpenRouter and other enabled model/Zep services, existing domains, and current release target. Classify monthly fixed cost, per-transaction/model marginal cost, free-tier cutoff, and whether a true provider-side hard cap exists. Redact identifiers and billing details from public artifacts.
- Verification/exit: a dated table with source links/screenshots and current spend ceiling, plus an owner-confirmed definition of acceptable downtime and scale. No billing change.
- Dependencies/parallelism: first; may run in parallel with step 2's code-only threat review. Default model. Rollback: documentation-only revert.

### 2. Data, auth, and AI risk boundary

Context: Supabase Auth/RLS, GCS signing, source imports, financial ledger, and AI traces cross different trust boundaries. `docs/information-security-policy.md` is policy, not proof of enforcement. User stated a 45-day customer-data retention preference; finance/refund/audit records need separately approved schedules.

- Task: inventory data classes and vendor subprocessors; threat-model login/recovery, tenant switching, public checkout/webhooks, upload/download, imports/SSRF, AI tool permissions/prompt injection, budget reservations, traces, and deletion. Record owners and required proofs for consent, 45-day customer-data handling, financial-record exceptions, backup/restore, access review, incident response, and AI output/tool guardrails. Do not change production controls in this assessment step.
- Verification/exit: signed decision matrix mapping every high-risk boundary to an existing test or a specific missing test/owner; unresolved critical items remain release blockers. No customer data to a new vendor until approved.
- Dependencies/parallelism: start with step 1; gates steps 3 and 6-9. Strong model/security reviewer. Rollback: documentation-only revert.

### 3. Contain existing telemetry and credential risk

Context: `src/app/api/client-runtime/telemetry/route.ts` can already send product events when `POSTHOG_API_KEY` is configured. `src/lib/clientRuntimeObservability.ts` validates field names but accepts a broad event name and a caller-supplied distinct ID. The private Zep credential was previously exposed in chat.

- Task: read the deployed telemetry configuration and current event samples, consent state, identifier construction, vendor retention/deletion settings, and destination region. If egress is not approved, disable it through a reviewed configuration change before adding any new funnel events. Narrow event/ID validation as needed with regression tests. Rotate and replace the exposed Zep key in the isolated pilot before any live call; never display it in logs or plans.
- Verification/exit: no unapproved customer telemetry egress; tests prove arbitrary event names, emails/tokens, prompts/content, and cross-tenant identifiers are rejected or redacted; old Zep key revoked or pilot remains paused. Record actual deployed configuration, not just repo defaults.
- Dependencies/parallelism: step 2; may run parallel with step 4 after risk mapping. Strong model/security reviewer. Rollback: restore previous known-good telemetry config only if it remains privacy-approved; otherwise keep capture disabled.

### 4. Repair the canonical front door

Context: `app.veloceos.cloud/login` and menu routing were observed inconsistent; local navigation repair is not deployed. The canonical customer URL and edition handoff must be agreed before a hosted journey can be measured.

- Task: define the canonical customer login/workspace URL and make a narrowly scoped public-menu, callback, and deep-link repair. Preserve the operator/client boundary. Capture existing and repaired desktop/mobile behavior on a disposable account.
- Verification/exit: `npm run typecheck`, relevant auth/navigation browser tests, `npm run verify:client-navigation-policy`, and hosted login/logout/deep-link/denial receipts from an approved immutable candidate. No live payment fixture.
- Dependencies/parallelism: step 1; parallel with step 3 until external exposure; gates step 5. Default model for UI, strong review for auth callback changes. Rollback: prior known-good Vercel/Cloud Run revision and route config.

### 5. Prove the existing customer journey

Context: the parent plan defines J01-J15; the beta is not a public client workspace. The October 5 handoff's earlier missing-membership state was later resolved for `internal-beta`, while temporary local signing grants expired and localhost CORS was removed. Do not assume those conditions hold for a new disposable tenant or origin.

- Task: establish approved test-tenant membership, a working hosted-origin upload path, and a matching source/deployment identity. Exercise J01-J15 in test mode across two tenants, recording exact receipts and failures. Fix individual defects in separate small changes; do not bundle unrelated journey repairs here.
- Verification/exit: current-revision hosted receipts for signup/verification, checkout test mode/webhooks, provisioning, first action, budget/ledger, source import/export, support and offboarding; two-tenant deny and retry/idempotency checks. If a prerequisite is missing, record a blocked receipt rather than infer success. `npm run verify:production-readiness -- --strict` is a diagnostic gate, not publication.
- Dependencies/parallelism: steps 2-4 and approved identities/origin; gates step 10. Strong model/release reviewer. Rollback: test-mode cleanup by approved tenant-safe procedure; no live customer record deletion.

### 6. Privacy-safe funnel on the existing telemetry adapter

Context: `src/lib/clientRuntimeObservability.ts` already provides bounded server-side PostHog capture. Do not add an unreviewed client replay SDK or duplicate telemetry pipeline.

- Task: define a small event vocabulary for signup, verification, intake, checkout test mode, provisioning, first successful action, import, error, and offboarding; use pseudonymous IDs and safe fields only. Add an opt-out/consent gate as required by the data review, sampling, disabled-by-default behavior, and a dashboard for completion/drop-off. Keep AI prompts, files, video, payment data, email, and raw tenant content out.
- Verification/exit: unit tests prove allowlist/drop behavior, synthetic end-to-end event order and duplicate handling, no secret leakage, and vendor retention/deletion review. Report event counts and missing stages, not speculative conversion.
- Dependencies/parallelism: steps 1-3 and stable journey schema from step 5; can run in parallel with steps 7 or 8 after gates. Default model; strong review for privacy. Rollback: disable event flag, revoke key, delete synthetic trial data.

### 7. Cloudflare front-door feasibility, no cutover

Context: current `product-experience` is full-stack Next.js. Cloudflare Pages is suitable only for a genuinely static slice; Workers/vinext is a different, beta migration candidate. The authenticated Cloud Run workspace stays untouched.

- Task: identify exportable public pages and server-dependent routes/actions; measure build/runtime compatibility, redirects, canonical URLs, CSP, accessibility, login handoff, preview-to-production promotion, and commercial terms. Prototype only with synthetic/public content and a disposable subdomain if approved. Explicitly compare continued Vercel cost, including whether current plan permits commercial use.
- Verification/exit: build plus desktop/mobile browser parity, links/forms/auth callbacks, SEO headers, rollback and actual Free quota measurements. Decision `retain Vercel`, `static Pages slice`, or `separate Workers spike`; no production DNS cutover.
- Dependencies/parallelism: steps 1-2 data boundary; independent of step 8. Default model, strong architecture review. Rollback: delete disposable preview and retain original DNS/deployment.

### 8. R2 storage feasibility, synthetic objects only

Context: `src/lib/clientStorage.ts` uses GCS signed URLs and tenant-scoped object paths. Egress alone is not the whole bill; class A/B operations, storage, security and billing exposure matter.

- Task: model actual artifact size/read/write/retention patterns. Only if signup and billing risk are expressly approved, trial non-sensitive synthetic objects behind a narrow adapter; compare signed upload/download expiry, private ACLs, MIME/size limits, CORS, object lifecycle/deletion, auditability, backup, regional/data-residency needs, and concurrency with GCS.
- Verification/exit: deny cross-tenant access and public listing, test failed/expired signatures and deletion, compare measured monthly projection at current and 10x volume, show a documented rollback. Decision `retain GCS` or a *separate future* migration plan; do not dual-write customer artifacts by default.
- Dependencies/parallelism: steps 1-2; parallel with step 7. Default model plus strong security review. Rollback: remove synthetic bucket/credentials after inventory and billing check.

### 9. Convex + Better Auth trigger, not a migration commitment

Context: replacing Supabase Auth/Postgres/RLS would affect every tenant, graph query, source import, financial transaction, audit, and recovery path. Convex and Better Auth can be combined, but public Convex functions need explicit authorization.

- Task: first document a concrete customer requirement unmet by the current stack (for example measured realtime latency) and a quantitative threshold. If none exists, record `defer`. If one exists and owner approves, build a disconnected synthetic sandbox for that single use case, then separately design account/session and data migration with dual-read reconciliation, rollback and legal retention; never run two production identity authorities.
- Verification/exit: synthetic function-auth and tenant isolation tests, complete ledger/graph contract map, migration rehearsal and rollback estimate, total-cost comparison. Adoption requires an independent go/no-go decision and a new multi-PR plan.
- Dependencies/parallelism: after steps 1-5; may be skipped without blocking release. Strong model. Rollback: discard sandbox; production remains Supabase.

### 10. Evidence-backed release and platform decision

Context: new-vendor adoption is not a substitute for the existing release ledger. The source import, hosted parity, AI evaluation, operations, and MiroFish buyer pilot each retain their own gates in the parent plan.

- Task: reconcile J01-J15, source-to-graph completeness, local/cloud same-revision parity, tenant/security tests, provider budget and traces, operational/legal owner signoff, vendor decision records, and approved rollback. On a clean immutable candidate, use `npm run verify:production-readiness -- --strict` to inspect missing evidence. Only after a ledger bucket and all required evidence are configured and approved, publish via `npm run publish:release-ledger -- --ledger-bucket <approved-bucket>` and independently rerun the strict verifier against that published record. Record `releaseReady` plus failed gates; update the parent plan only with actual evidence. Publishing is a separate production-state action requiring explicit owner approval.
- Verification/exit: current-source hosted receipts and strict verifier green for GA, or a clearly scoped internal-beta continuation with exact blockers. No percentage or production claim inferred from free-tier signup or a synthetic MiroFish run.
- Dependencies/parallelism: steps 2-5 and parent-plan critical workstreams; steps 6-9 are optional except an approved observability minimum. Strong model/release owner. Rollback: last accepted deployment, reversible schema migrations, tenant-safe export/restore procedure.

## Mutation and stop rules

When evidence changes, append a dated decision to this file before altering order: observed fact and source, changed precondition, affected steps, new dependency/owner/cost, test and rollback impact. Split a step if it is no longer one-review-sized; mark a step skipped only with a reason and effect on release gates. Pause any trial at unexpected billing, customer-data exposure, authentication ambiguity, cross-tenant read, missing deletion path, or provider-policy conflict. Resume after owner review and an updated cost/security boundary.

## Anti-patterns to avoid

- Treating free tiers, spend alerts, or $0 historical invoices as hard spending limits.
- Replacing Supabase Auth/Postgres or GCS before current journey and data contracts are proven.
- Enabling replay or shipping prompts, source content, emails, tokens, or payment details to analytics by default.
- Counting the bonus link index as the full authorized Skool classroom/video import.
- Calling local green tests, synthetic buyer personas, or an old deployment production acceptance.
- Cutting over DNS, creating paid subscriptions, or migrating live data because a prototype works.
