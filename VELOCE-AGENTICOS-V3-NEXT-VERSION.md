# Veloce AgenticOS v3 — Public Launch and Cost Model

**Status:** next-version specification  
**As of:** 2026-08-22  
**Launch shape:** public signup, governed activation, BYOK plus optional Veloce-managed credits

This document records the next public version of Veloce AgenticOS and the costs required to operate it. Vendor prices change, so the values below are planning snapshots rather than contractual quotes. Exact provider prices must be stored as versioned pricing snapshots before a paid job runs.

## v3 product boundary

V3 adds the public control plane around the existing governed runtime:

- `veloceos.cloud`: public product site, capability catalog, pricing, signup, legal, and support.
- `app.veloceos.cloud`: authenticated client portal, provider selection, BYOK submission, managed-credit wallet, usage, and account status.
- Public signup with email verification, consent, abuse controls, and request IDs.
- Stripe setup fee, optional platform subscription, and prepaid managed-credit purchases.
- Tenant-scoped provider connections with server-side validation, rotation, revocation, and activation approval.
- Idempotent onboarding states: requested, verified, payment, manifest review, provisioning, smoke testing, active, suspended, rollback, and offboarded.
- Isolated Cloud Run tenant runtime, queue, service account, bucket, and secrets.
- Evidence bundle covering research, memory, planning, artifacts, quality, approval, delivery, budget settlement, isolation, rollback, and deletion.
- Ponytail restraint, Superpowers loop boundaries, Headroom context compression, reviewed specialist playbooks, Open Notebook knowledge compilation, and output/accessibility safeguards as Veloce-owned contracts.
- Research wedge using Brave Search, Jina Reader, and selectively Firecrawl; Company Research Agent and OpenSEO remain governed follow-on workflows.
- Monitoring, support acknowledgement, quota alerts, retention notices, acceptable-use handling, suspension, export, and offboarding.

The catalog may show a repository or provider without granting execution permission. Only a Veloce-owned contract or an isolated worker with a complete evidence bundle can execute.

## Fixed operating subscriptions

| Component | Recommended launch plan | Planning cost | Required now? | Notes |
|---|---:|---:|---|---|
| Vercel product experience | Pro | **$20/month** | Yes for a commercial public launch | Hobby is $0 but is intended for personal/non-commercial use. The current project is on Hobby; upgrade before broad commercial traffic. |
| Supabase control plane | Pro | **from $25/month** | Recommended | Includes the first project and compute credit; additional projects start at $10/month. Keep the shared control plane on one production project initially. |
| Resend transactional email | Free initially; Pro when volume requires | **$0 or $20/month** | Yes | Free includes 3,000 emails/month and a daily limit; Pro includes 50,000/month. |
| Cloudflare DNS and Turnstile | Free | **$0/month** | Yes | Turnstile Free supports up to 20 widgets and unlimited challenges within its limits. |
| Domain | Existing `veloceos.cloud` | **$0 new cost in v3** | Already owned | Renewal is already paid through 2027-07-29 according to the current registrar record. |
| Stripe account | Standard pay-as-you-go | **$0/month** | Yes if Stripe remains the processor | Stripe has no setup or monthly fee on standard pricing; payment and billing transaction fees still apply. |
| Open-source billing alternative | Kill Bill, Lago, or Hyperswitch | **$0 license cost** | No | Self-hosting creates additional compute, database, security, maintenance, and payment-provider work. Do not add it to the launch critical path. |

### Fixed monthly baseline

- **Minimum recommended production baseline:** approximately **$45/month** with Vercel Pro, Supabase Pro, and Resend Free.
- **With Resend Pro:** approximately **$65/month**.
- Add Google Cloud usage, Stripe transaction fees, provider usage, tax, support, and any paid observability only when consumed.
- If Vercel remains on Hobby for a private test, the nominal baseline is approximately **$25/month**, but that is not the recommended commercial launch configuration.

Vercel currently lists Pro at $20/month; Supabase lists Pro from $25/month; Resend lists Free at $0 and Pro at $20/month. See the [Vercel pricing](https://vercel.com/pricing), [Supabase pricing](https://supabase.com/pricing), and [Resend pricing](https://resend.com/pricing) pages before purchasing.

## Infrastructure usage costs

| Service | Cost model | v3 expectation |
|---|---|---|
| Cloud Run public provisioner and tenant services | Pay for CPU, memory, requests, and job runtime; scale-to-zero when idle | Usually low for idle tenants; grows with active jobs, warm instances, media, and GPU workers. Set per-tenant quotas and a project budget alert. |
| Cloud Tasks | First 1 million billable operations/month free, then $0.40 per million operations | Queue dispatch is unlikely to be a meaningful early cost. |
| Secret Manager | First 6 active secret versions and 10,000 accesses/month free; then active-version and access charges apply | Rotation and per-tenant provider secrets are inexpensive at small scale, but delete old versions and enforce retention. |
| Cloud Storage | Storage, operations, retrieval, and network charges | Keep artifacts tenant-scoped, lifecycle-managed, and region-local. Regional Standard storage is roughly $0.02/GiB-month before other operations/network charges. |
| Artifact Registry | First 0.5 GiB-month free; storage and egress beyond that are billed | Retain only approved image digests and clean old revisions. |
| Cloud Build | First 2,500 build-minutes/month free; additional default-pool minutes are billed | Builds are an operator/deployment cost, not a per-customer runtime cost. |
| Cloud Logging | First 50 GiB/project/month free, then $0.50/GiB for log storage ingestion | Redact secrets, cap noisy logs, and retain only the evidence required by policy. |
| Cloud Monitoring | Free allotments for many Google Cloud metrics; additional metric, uptime-check, synthetic, and query usage can be billed | Start with health checks, queue failures, provisioning failures, budget alerts, and quota alerts. |

Google Cloud pricing is usage-based, not a required per-tenant subscription. The authoritative references are [Cloud Run](https://cloud.google.com/run/pricing), [Cloud Tasks](https://cloud.google.com/tasks/pricing), [Secret Manager](https://cloud.google.com/secret-manager/pricing), [Cloud Storage](https://cloud.google.com/storage/pricing), [Artifact Registry](https://cloud.google.com/artifact-registry/pricing), [Cloud Build](https://cloud.google.com/build/pricing), and [Cloud Observability](https://cloud.google.com/products/observability/pricing).

## Stripe costs and customer billing

Stripe is not a free-money bypass. It is a payment processor and billing service. The customer-facing Veloce setup fee, platform fee, and credit-pack prices are revenue decisions; Stripe fees are operating costs deducted from those payments.

### Current Stripe launch model

| Veloce charge | Stripe object | Stripe fee to budget |
|---|---|---|
| One-time setup fee | One-time Checkout price | Standard payment processing fee per successful transaction |
| Optional platform subscription | Recurring Checkout subscription | Payment processing plus Stripe Billing usage fee when using pay-as-you-go Billing |
| Managed-credit pack | One-time Checkout price | Standard payment processing fee per purchase |

For US standard pricing, budget **2.9% + $0.30** for domestic card payments, plus **1.5%** for international cards and **1%** when currency conversion is required. Stripe lists no setup or monthly fee on standard pricing. Stripe Billing pay-as-you-go is listed at **0.7% of Billing volume**; confirm the account's actual price before going live. See [Stripe pricing](https://stripe.com/pricing), [Stripe products and prices](https://docs.stripe.com/products-prices/manage-prices), and [Stripe webhooks](https://docs.stripe.com/webhooks).

### Open-source alternative decision

- **Kill Bill:** best fit if Veloce later needs a full self-hosted subscription and invoice engine. It still needs a payment gateway.
- **Lago:** strong fit for usage-based and prepaid-credit billing. It still needs a payment provider.
- **Hyperswitch:** useful if Veloce needs multiple payment processors through one orchestration layer. It is not a processor or merchant account.
- **OpenMeter:** useful for high-volume usage metering, not for collecting payments by itself.

For v3, keep the existing Supabase exact-micros ledger and Stripe integration. Do not introduce a second billing database before the first real customers prove the need. A migration to Kill Bill, Lago, or Hyperswitch is a later v4 project with its own reconciliation, refunds, tax, dispute, PCI, and rollback evidence.

## Provider API costs and credits

Veloce must separate **BYOK cost** from **Veloce-managed cost**:

- **BYOK:** the customer pays the provider directly. Veloce records an estimate and usage evidence but should not pretend to settle the provider invoice.
- **Veloce-managed:** Veloce holds the provider credential server-side, reserves customer credits before work, settles actual usage, refunds failed/cancelled work, and stops at the wallet limit.
- Provider pricing is stored in a versioned snapshot. Never hard-code a vendor price into a marketing claim.

The current runtime uses **1 usage credit = 1,000 USD micros = $0.001**. Therefore **$1.00 of internal provider/infrastructure cost equals 1,000 usage credits** before any Veloce margin or managed-credit packaging. Keep exact USD micros internally; display rounded credits and the pricing snapshot to customers.

| Provider/capability | Current planning basis | Early launch cost posture |
|---|---|---|
| Brave Search | $5 per 1,000 search requests, with $5 monthly free credits on the published Search plan | Use as a bounded managed research provider or allow BYOK. Reserve credits per search batch. |
| Jina Reader | Reader API is currently presented as free with rate limits; free API-key limits are higher than unauthenticated access | Use for the first extraction worker with strict rate, token, and budget limits. Treat future paid/premium access as a pricing-snapshot change. |
| Firecrawl | Free tier includes 1,000 credits/month; published self-serve tiers include a $16/month Hobby plan billed yearly and higher plans | Keep optional and review-gated. One page generally consumes one credit for scrape/crawl/map/monitor; search uses two credits per 10 results. |
| OpenAI, Anthropic, Gemini, OpenRouter, Groq, ElevenLabs, HeyGen, Suno, Hunter, and similar providers | Provider/model-specific tokens, seconds, characters, renders, or lookup units | Launch BYOK first. Managed mode is allowed only after a provider pricing snapshot, reserve/settle path, and cost cap exist. |
| Ponytail restraint | No provider charge | Prevents low-value paid rounds and is a cost-control feature. |
| Superpowers, Headroom, Agent Skills, Open Notebook, accessibility/output safeguards | No upstream runtime charge when used as Veloce-owned contracts | Veloce pays only for storage, compute, and any model calls used by the contract. |
| GPU/media/security workers | No upstream license charge for the open-source reference; Cloud Run/GPU, storage, egress, and provider charges still apply | Keep isolated and disabled until demand and margin evidence justify activation. |

Provider references: [Brave Search API pricing](https://brave.com/search/api/), [Jina Reader](https://jina.ai/reader/), and [Firecrawl pricing](https://www.firecrawl.dev/pricing).

## Suggested customer credit policy

1. Setup fee is a separate Stripe price and is not converted into usage credits unless explicitly promised.
2. Platform subscription pays for the Veloce control plane, support, retention, governance, and the included allowance defined in the selected plan.
3. Managed credits are prepaid and non-negative; every paid job shows estimate, reservation, settlement/refund, provider, and pricing snapshot.
4. BYOK jobs show Veloce usage estimates but label provider charges as customer-paid.
5. Warn at 20% remaining, restrict new paid jobs at 0%, and refund reservations for failed or cancelled jobs.
6. Veloce's managed-credit selling price must be configurable as: provider cost + infrastructure allocation + support/risk margin. Do not embed that price in code.
7. The first launch should use small credit packs and a low per-tenant cap. Increase limits only after usage and abuse evidence.

## What is implemented versus what remains

### Implemented in the repository

- Public intake, consent, email-verification, setup, support, legal, and catalog pages.
- Supabase control-plane migration for onboarding, provisioning, provider connections, credits, pricing snapshots, webhook events, and support.
- Stripe checkout/webhook routes and managed-credit wallet path.
- Server-side credential submission with no browser key return.
- Public provider/repository catalog with activation labels.
- Public provisioner boundary with bearer token, manifest checks, callback, and GCP adapter boundary.
- Public launch and provisioner contract verifiers.
- Existing runtime ledger and customer-facing usage-credit conversion.

### Required before accepting real public payments

- Apply and verify the public-launch Supabase migration.
- Add production Vercel variables and separate control-plane secrets.
- Create Stripe test products/prices and webhook; test idempotency and refunds.
- Verify Resend sender/domain and test verification/setup emails.
- Wire the Turnstile browser widget and site key before enabling `TURNSTILE_SECRET_KEY`.
- Deploy the public provisioner and the private GCP adapter; set `CONTROL_PLANE_PROVISIONER_URL` only after both pass health and authorization tests.
- Attach `veloceos.cloud` and `app.veloceos.cloud` to the product experience and verify DNS/HTTPS.
- Run a disposable tenant through payment, provisioning, smoke testing, rollback, isolation, deletion, and offboarding.
- Set GCP, Vercel, Stripe, provider, and support quotas/alerts.
- Complete terms, privacy, acceptable-use, retention, support, abuse, and refund language for the actual commercial offer.

## Launch budget recommendation

For the first public month, budget:

- **Fixed software:** $45–$65/month for Vercel Pro, Supabase Pro, and Resend Free/Pro.
- **Cloud reserve:** $25–$100/month for Cloud Run, builds, storage, logs, and tenant jobs while traffic is small; configure a hard project budget alert before launch.
- **Managed provider reserve:** start with a capped **$50–$250** provider wallet, not unlimited credentials.
- **Stripe:** no fixed subscription fee, but reserve approximately 3% plus a fixed amount per domestic card transaction, more for international/currency conversion, plus applicable Billing fees.
- **Optional Firecrawl:** $0 at low volume within the free tier; otherwise use BYOK or activate a paid plan only for an approved customer need.
- **Support and human review:** founder/operator time is the largest early cost and must be included in the platform fee.

This produces a planning envelope of roughly **$70–$165/month before managed-provider consumption**, plus customer payment-processing deductions and any actual model/media/GPU usage. It is a budget range, not a promise; usage spikes, paid support, high-volume email, international payments, and GPU jobs can exceed it.

## V3 acceptance gate

V3 is ready for broad public onboarding only when:

- A visitor can submit requirements without credentials.
- A verified and paid customer is provisioned without manual shell commands.
- BYOK keys remain server-side and managed credentials are wallet-capped.
- Every paid job has estimate, reservation, settlement/refund, provider ownership, pricing snapshot, and audit evidence.
- Tenant isolation, deletion lineage, rollback, suspension, and offboarding pass.
- Fixed subscriptions, provider prices, cloud quotas, and customer credits are visible and versioned.
- The public site claims only capabilities whose evidence bundle is complete.
## V3.1 Cost-Optimized Provider Matrix and Dual-Track Infrastructure

V3.1 makes the provider catalog a real customer-facing contract. The public catalog is read-only; an authenticated tenant can select rows and submit a manifest proposal. Selection never activates a provider and never accepts a secret. Provider credentials are submitted only through the server-side credential flow, stored as tenant-scoped Secret Manager references, validated server-side, and exposed to the browser only as connection status.

### Matrix and pricing snapshot contract

Every row contains the provider or repository, customer tool and outcome, pipeline stage, runtime placement, credential or OAuth requirement, BYOK and managed-credential availability, free-tier limits, vendor pricing unit and source, model/version options, estimated credits, customer-paid versus Veloce-paid ownership, data permissions, activation state, approval requirements, dependent workflows, rollback rule, and evidence gate. Pricing is versioned: provider/model, unit, exact USD micros where known, source URL, effective date, verification timestamp, free-tier text, recommended low-cost option, and snapshot version. The UI labels values as last verified; it never presents them as permanent promises. Unknown provider pricing fails closed until verified.

### Cost-aware execution order

The router must choose native Veloce contracts first, then approved free/open-source workers, then a connected customer BYOK provider, then a Veloce-managed credential only when the tenant explicitly enabled it and the credit budget permits it. If no route is permitted, the job fails closed. Ponytail restraint and Headroom compression are mandatory controls. Free routes still have tenant-scoped daily/monthly units, concurrency, storage, egress, and retention limits. Paid stages persist estimate, reservation, provider ownership, pricing snapshot, settlement or refund, budget/quota state, and request/audit ID.

### Managed credentials and repository placement

Managed credentials are optional. Veloce supplies only approved free/open-source or explicitly managed provider access, with isolated per-tenant Secret Manager references. Shared pooled credentials are prohibited. Rotation, revoke, suspension, offboarding, dependent-workflow visibility, and smoke-test evidence are required before activation.

Ponytail, Headroom, Repomix, Karpathy skills, AI Builder Club skills, AGENTS.md, Agent Skills, Agency Agents, Superpowers, i-have-adhd, and no-ai-slop are native contracts or operator/CI authoring controls. Repomix is limited to reviewed operator/CI context bundles and is not automatically run on customer-private data. Scrapling, OpenReply, and Agentic-AI-Pipeline remain bounded isolated workers/adapters. InsForge, Openship, Plunk, and Novu are shadow migration/operator candidates. System-prompts collections and Awesome Claude Skills lists are curation/reference only. No upstream repository is automatically bundled into the public client image.

### Dual-track migration

Supabase remains the launch control plane using one shared project with tenant RLS. Vercel remains the public product surface while Cloud Run/static hosting and Openship are benchmarked. Resend remains the initial customer email path while Plunk/Novu/SMTP are evaluated for internal notifications. Stripe remains the payment processor while Lago, Kill Bill, or Hyperswitch are evaluated as billing orchestration—not card processing—later. Jina Reader and native research workers are preferred first; Brave is bounded by quota; Firecrawl and Scrapling remain optional or BYOK. Cloud Run scales to zero and Cloud Tasks, Storage, Secret Manager, Logging, and Artifact Registry have explicit quotas and cleanup policies.

A replacement is promoted only after cost, tenant isolation, backup, migration, deliverability, rollback, and support evidence passes. The rollback target is always the current production path, and each shadow run records the manifest/image/configuration hash and evidence bundle.

### V3.1 implementation status

The runtime now contains a versioned provider pricing catalog, public pricing metadata, a cost-route policy with fail-closed behavior, Repomix/Plunk/Novu provenance rows, an authenticated provider-matrix page, and a tenant-scoped manifest-proposal RPC/API boundary. The remaining promotion work is database migration application, provider-specific smoke evidence, quota/settlement integration in each paid worker, shadow migration benchmarks, and a full two-tenant launch evidence bundle.
