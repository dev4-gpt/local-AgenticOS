# Client Runtime 13-Layer Readiness

Updated 2026-07-27 after reviewing the public intake deployment, the local
operator runtime, Cloud Run client image `v11`, and the next un-deployed hosted
adapter slice.

## Executive answer

The business has a real public front door and a real isolated Cloud Run test,
but it does **not** yet have a fully cloud-hosted version of every local tab.
The current state is:

| Surface | Status | Safe to share? |
|---|---|---|
| Public landing page | Published on Vercel and Cloud Run | Yes |
| Public runtime request form | Published on Vercel | Yes |
| Request records | Server-side insert into Supabase `deployment_requests` | Yes, after verifying the inbox/approval owner |
| Cloud Run client login | Live for the approved cloud-test account | Controlled test only |
| Cloud Run client shell | Live as historical image `v11`; current auth, hosted-adapter, and worker changes are not deployed yet | Controlled test only |
| Full 3939 operator OS | Local only | No, never publish directly |
| Per-client replicated runtime | Architecture and deployment track exist | Not until each enabled capability passes its adapter tests |

### Links

- Public landing page: https://veloce-agenticos-public.vercel.app
- Public product front door: https://product-experience-five.vercel.app
- Request runtime: https://product-experience-five.vercel.app/start
- Cloud client test login: https://veloce-cloud-test-mquo4bf7aq-el.a.run.app/login?next=%2F
- Private local operator runtime: http://127.0.0.1:3939/
- Local Free Claude Code helper: http://127.0.0.1:8082/ (loopback only; not a product URL)

## What happens to a public request

1. A visitor opens `/start` and submits name, email, company, and workflow.
2. The Vercel server route `/api/deployment-request` validates the fields and
   rejects secret-like values.
3. The server route uses the encrypted Vercel Production
   `SUPABASE_SERVICE_ROLE_KEY` to insert a `pending_approval` record into the
   Supabase `public.deployment_requests` table.
4. The browser receives only success or failure status. It does not receive
   the service-role key.
5. Manual approval is still required. The form does not automatically create a
   Cloud Run service or grant access.

Production environment metadata was verified on 2026-07-26. Vercel lists
`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
`NEXT_PUBLIC_CLIENT_RUNTIME_URL`, and
`NEXT_PUBLIC_ALLOW_LOCAL_CLIENT_RUNTIME_LINK` in Production. A live submission
test and an operator notification workflow are still worth adding before
promising real-time alerts.

The public intake route now applies a conservative five-request/15-minute
per-forwarded-client throttle. Once
`product-experience/supabase-public-request-hardening.sql` is applied, the
counter is atomic and durable in Supabase; the in-memory fallback only covers
temporary RPC unavailability. The route also rejects oversized fields,
validates email shape, and returns generic storage errors without backend
details. Before high-volume promotion, add a provider-backed edge limiter and
alerting.

## Credential and tenant boundary

There are three separate kinds of credentials:

1. **Runtime login:** Supabase Auth session used to access an approved client
   runtime.
2. **Provider credentials:** client-owned or Veloce-managed API keys held by
   Secret Manager and used server-side by an approved adapter.
3. **Operator credentials:** personal CLI sessions, local vault data, local
   files, and local helper services used only by `3939`.

The current cloud test does not put raw provider keys in the browser. The
credentials screen shows connection state, and the submission flow sends a
provider value to the configured client vault inbox. That is a foundation, not
proof that every future client is automatically secure. Before external
clients are onboarded, each deployment needs a unique service account, secret
prefix, storage boundary, Auth membership, capability manifest, budget, audit
trail, rotation process, export, and deletion path.

Every client can use the same tested image and visual shell, but clients should
not necessarily see the same features. The manifest controls branding,
capabilities, providers, models, storage namespace, budgets, approvals, and
retention. Same codebase does not mean same permissions.

## The 13 layers

| # | Layer | Current state | What remains before external client readiness |
|---:|---|---|---|
| 1 | Frontend foundations | **Ready for public pages and the client shell; partial parity with 3939** | Replace gated placeholders only after the underlying adapter is ready; finish responsive/error-state review per enabled capability. |
| 2 | APIs and backend logic | **Control-plane, API-only text, workflow, Firecrawl SEO, media, and approval-only delivery contracts implemented; feature parity partial** | The new hosted routes and delivery worker are manifest-gated and need current-image deployment evidence. HeyGen, Suno, image/video production, publishing destinations, and the remaining local workspaces still need separate adapters. |
| 3 | Database and storage | **Tenant-scoped artifact upload/verification/download plus worker artifact creation implemented; evidence pending** | Apply the lifecycle and hosted-capability migrations, configure Cloud Storage IAM, and complete an object export/deletion drill. |
| 4 | Auth and permissions | **Partial, test-ready** | Supabase Auth and middleware protect the client test. Add client membership, roles, session lifecycle, operator/admin separation, and explicit RBAC tests. |
| 5 | Hosting and deployment | **Ready for the test track** | Vercel hosts the public surfaces and Cloud Run hosts the client image. Automate per-client provisioning and promotion before selling it as a repeatable service. |
| 6 | Cloud and compute | **Cloud Tasks/OIDC worker path, artifact worker, and delivery worker implemented in code; deployment evidence pending** | Apply the controls and current hosted-capability migrations, provision the per-client queue, set the worker token hash/secret, deploy, and verify bounded retries, artifact output, delivery completion, and job status. |
| 7 | CI/CD and version control | **Improved; client promotion evidence pending** | GitHub release checks, manifest validation, and versioned images are in use. Add image digest promotion, deployment provenance, and automated rollback checks. |
| 8 | Security and row-level security | **Schema, explicit membership checks, secret promotion checks, and boundary implemented; verification pending** | Secrets stay out of the browser, security headers are active, and the control-plane schema has RLS. Apply all migrations, review signing IAM, rotate secrets, and run cross-tenant tests. |
| 9 | Rate limiting | **Public intake ready; durable runtime limiter and redacted alert metric implemented** | Apply the client controls migration, provision the per-client Monitoring policy, and verify 429 behavior for request, credential, provider, artifact, and job routes. |
| 10 | Caching and CDN | **Partial with private artifact controls** | Vercel and Cloud Run provide edge delivery for static/runtime responses. Private runtime responses use no-store and artifacts use expiring signed URLs; add provider-result caching only where safe. |
| 11 | Load balancing and scaling | **Partial** | Cloud Run scales to zero and the test is capped at one instance. Add queue-backed work, concurrency/load tests, per-client quotas, and scaling rules for production workloads. |
| 12 | Error tracking and logs | **Redacted runtime events, provider failure codes, and alert provisioner implemented; evidence pending** | Safe audit metadata and structured rate/budget/delivery events are supported. Add request IDs, provider failure classification, alert delivery, and a retention policy. |
| 13 | Availability and recovery | **Lifecycle CLI implemented; recovery evidence pending** | Revision rollback and operator export/restore/offboarding commands exist. Run them against a disposable second tenant, verify object/secret deletion, and document secret recovery and incident response. |

## Private operator dependency inventory

An API key is only enough when the surface already has a server-side provider
adapter. A key cannot replace a local filesystem, local CLI session, Mac vault,
or a loopback service.

| Surface or tab | Current dependency | Cloud treatment |
|---|---|---|
| Claude, Codex | Personal CLI/subscription session in local execution paths | Provider API adapter with client key, model allowlist, budget, approval, and queued jobs |
| OpenClaw, Hermes | Local agents/credential pool and local execution | Reviewed provider/API adapter; no personal CLI session in hosted capacity |
| Antigravity | Local tool/auth path | Gemini API adapter plus tenant-scoped job/output storage |
| Kimi Code | Local CLI/auth path | Moonshot API adapter plus budget and approval policy |
| GLM 5.2, GLM Code | Local/provider-specific execution | GLM API adapter and model allowlist |
| Grok Build | Local/provider-specific execution | xAI API adapter and outbound-action approval |
| Free Claude Code | `fcc-server` at `127.0.0.1:8082` and local Claude CLI | Replace with an approved API-backed workflow; never publish port 8082 |
| Local, Local Engine, Ollama | Laptop models, filesystem, and local process state | Optional per-client model service or approved hosted model API; Cloud Storage/Supabase for state |
| Paperclip | Local service at `localhost:3100` and local company/workspace data | A tenant workflow-planning adapter now exists behind `orchestration`; full hosted Paperclip parity still needs its own reviewed work-item contract |
| Open Design, Web Studio, Flow Lab, Video, Music, Agent Studio, OpenMontage, Game Studio, Thumbnails | Local creative services, provider keys, or local output paths | One adapter per workspace; provider API, Cloud Storage outputs, signed access, budget, and approval |
| Pipeline, Agent Kanban, Loop, Ruflo, Agent Mastermind | Local files, local models/CLI, operator vault, or orchestration state | A tenant workflow-planning adapter now exists behind `orchestration`; full agent execution, durable work-item editing, and parity remain gated |
| Memory, Notebook, Journal, Goals, Context intake | Client-safe intake pieces exist, but local-memory parity is not complete | Supabase tables, tenant RLS, object storage for attachments, retention/export/delete |
| SEO, Integrations, Build Guide | Operator configuration, local credential paths, private source material, or redistribution risk | A Firecrawl read-only adapter now exists behind `seo-research`; integrations, licensed/original content, publishing, and full SEO workflows remain gated |
| Delivery and external actions | Approval-shaped UI exists; execution and delivery adapters vary | An idempotent approval-only delivery action record now exists; destination execution, rollback, and client-specific adapters remain gated |

The current Cloud Run gate is therefore expected behavior. It prevents a client
from reaching code that would otherwise attempt to use the operator laptop.
Removing the gate before adapting the route would turn a visible limitation
into a security and reliability problem.

## Repeatable path for each capability

For every gated tab, use this sequence:

1. Inventory its reads, writes, local paths, subprocesses, provider calls,
   credentials, outbound actions, and long-running work.
2. Classify it as `client-safe`, `api-adapter-required`, or `operator-only`.
3. Define the client contract: inputs, outputs, allowed models, storage,
   budget, approval points, errors, and retention.
4. Replace local files with tenant-scoped Supabase/Cloud Storage records.
5. Replace local CLI or helper services with a server-side provider API or a
   private queued worker. Never make the browser call localhost.
6. Add secret references, service-account IAM, request validation, rate
   limits, audit events, and redaction.
7. Add functional, authorization, tenant-isolation, secret, budget, retry,
   accessibility, and recovery tests.
8. Enable the route in only one dry-run manifest, deploy the same image, and
   verify it before enabling it for another client.

## Sharing decision

Share the public landing page and runtime request form now. Describe the Cloud
Run URL as an approved internal test, not as a promise that all 3939 features
are already hosted. Do not share `3939`, `8082`, local vault paths, private
operator credentials, or a client runtime with capabilities that have not
passed the adapter and tenant-isolation checks above.

This document is the release gate for turning the local operator OS into a
multi-client hosted product. It should be updated whenever a capability moves
from operator-only to client-safe.

## Public front-door release checklist

The public landing and intake experience can be shared when all of these are
true:

- [x] Public landing build and private-reference scan pass.
- [x] Product experience build passes.
- [x] Product Production environment contains `SUPABASE_URL` and
  `SUPABASE_SERVICE_ROLE_KEY` as encrypted variables.
- [x] Intake validates required fields and rejects secret-like content.
- [x] Intake has a basic abuse throttle and does not return backend error detail.
- [x] Shared rate-limit guard covers both public lead endpoints.
- [ ] Apply `supabase-public-request-hardening.sql` and verify the RPC in
  Supabase; until then the route uses its bounded in-memory fallback.
- [x] Public pages state that they do not expose the operator runtime or accept
  credentials.
- [x] Live smoke test returns `200` for `/start` and rejects an invalid email
  without creating a request.
- [x] Production dependency audit passes with
  `npm audit --omit=dev --audit-level=high`.
- [x] Cloud Run v11 is deployed and passes the client-runtime verification
  script with security headers enabled.
- [ ] Review remaining development-toolchain advisories before allowing
  untrusted contributors or automated build scripts into the release process.
- [ ] Submit one real test request and confirm it appears in Supabase as
  `pending_approval`.
- [ ] Confirm who reviews requests and how the owner is notified; the current
  route stores requests but does not send an email notification.
- [ ] Confirm the public domain, contact destination, privacy wording, and
  terms with the business owner before paid traffic.

The unchecked items are operational confirmation, not a reason to expose the
3939 runtime. The full client runtime remains blocked by the layer table and
capability adapter inventory above.

## Gate plan and low-cost architecture

The cheapest safe shape is a single-tenant control plane, not one giant shared
multi-tenant worker and not an always-on VM for every client:

```text
Vercel free tier: public landing + intake
        |
Supabase free tier: requests, Auth, RLS, rate-limit counter, audit metadata
        |
GCP Cloud Run min=0: one approved client service per client
        |-- Secret Manager: client provider secrets
        |-- Cloud Storage: client files and deliverables
        `-- Cloud Tasks/Pub/Sub: add only when a capability needs long jobs
GitHub Actions: build, scan, test, and manifest review
```

Do not add Redis, an always-on worker, a separate database, or media providers
until a client workflow requires it. Use `max-instances=1`, explicit provider
allowlists, model allowlists, monthly budget caps, and `min-instances=0` for the
first client editions. Media generation, crawling, and long-running agents are
opt-in cost centers.

An optional Oracle/Coolify worker plane is documented in
[`docs/oracle-self-hosted-runtime-option.md`](./oracle-self-hosted-runtime-option.md).
It is not part of the current cloud-test deployment and must not become a
second shared secrets store or source of truth.

Each layer has a gate, an evidence artifact, and a failure action:

| Layer | Gate to pass | Evidence | Failure action |
|---:|---|---|---|
| 1 | UI has no private paths, secrets, or misleading enabled controls | Public scan, responsive smoke test, client screenshot | Keep capability gated |
| 2 | Every enabled action has an authenticated server contract | API route inventory and contract tests | Remove route from manifest |
| 3 | Every record/file has a client namespace and retention rule | SQL schema, bucket policy, export sample | Do not store the artifact |
| 4 | Login, logout, expiry, and approved-user membership work | Auth journey and denied-user test | Revoke runtime access |
| 5 | Image is versioned and rollbackable | Cloud Run revision and deployment manifest | Roll back to last verified image |
| 6 | Long work is bounded and does not depend on the request process | Worker/queue test or explicit short-job limit | Keep capability disabled |
| 7 | Same commit produces the tested image and checked manifest | GitHub workflow and image digest | Block promotion |
| 8 | Secrets, tenant data, and logs do not cross boundaries | Secret scan, IAM review, RLS/cross-tenant test | Destroy/revoke test deployment |
| 9 | Public and runtime expensive routes have durable limits | Supabase RPC test, 429 test, budget alert | Fail closed or disable route |
| 10 | Private responses are never shared by a cache | Cache-header and signed-object test | Force `no-store` |
| 11 | Service scales within a declared budget | Load/concurrency test and max-instance setting | Lower concurrency or queue work |
| 12 | Errors are redacted, traceable, and alertable | Request ID, structured log, alert test | Stop external action and investigate |
| 13 | Data, secrets, and image can be recovered or deleted | Restore/export/delete drill | Do not onboard external client |

The public control-plane changes in this release add shared headers, sanitized
public errors, a durable Supabase rate-limit migration, CI release checks, and
production dependency checks. The SQL migration still requires one manual
application in the Supabase project before the durable limiter is considered
verified.

The client control-plane migration adds single-tenant membership/RLS, safe
request records, audit events, idempotent job records, artifact metadata, and a
budget ledger. It deliberately does not store provider secret values. Applying
the migration and inserting one approved membership row are required before
switching a client manifest to `CLIENT_RUNTIME_DATA_MODE=supabase`.

## Remaining blockers for a full hosted 3939-style product

These are engineering work, not deployment switches:

- Provider adapters for each model/media/service tab; API-only text, workflow,
  Firecrawl read-only SEO, and ElevenLabs artifact adapters are implemented but
  not enabled in the test manifest. HeyGen, Suno, image/video production,
  destination publishing, and provider-specific tool contracts remain.
  Personal CLI sessions cannot become client capacity by adding environment
  variables.
- Tenant-scoped runtime tables and object storage for memory, files, jobs, and
  deliverables, or a documented single-tenant-only equivalent for each route;
  the current hosted-capability migration must be rerun in the cloud test and
  verified against the eleven-function query.
- Apply `supabase-client-runtime-controls.sql` and verify durable runtime
  throttles and budget reservations.
- Use the redacted provider-secret promotion/rotation CLI after manual review;
  provider adapters still must consume the promoted target secrets.
- Apply `supabase-client-runtime-controls.sql`, provision the per-client Cloud
  Tasks queue, store the worker token/hash, deploy the worker-enabled image,
  and run the end-to-end job/retry/budget evidence test. The application now
  contains the OIDC-verified worker path, job status route, and bounded retry
  contract, but the current `v11` cloud test has not been replaced with it.
- Cross-client isolation, backup/restore, export/deletion, and offboarding
  evidence using a second dry-run client manifest. The operator lifecycle CLI
  exists, but it has not yet been exercised against a disposable tenant.
- Durable runtime rate limits and alerts beyond the public intake guard, plus
  deployment evidence for the new hosted branches and delivery worker.

Until these are complete, “production ready” means the public front door and
approved intake control plane, not unrestricted access to every local tab.
