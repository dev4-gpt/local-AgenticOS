# Veloce AgenticOS Future Integrations

This folder is the research and decision register for capabilities that may be
connected to Veloce AgenticOS later. A candidate in this folder is not an
installed dependency, an enabled product surface, or a promise that the
current operator or client runtime supports it.

## Decision rules

Veloce should integrate a candidate only when it solves a demonstrated workflow
gap and can fit the existing boundaries:

- Obsidian and Graphify remain the durable knowledge and memory system.
- Veloce remains the control plane for routing, approvals, budgets, evidence,
  and user-facing workflow state.
- Heavy runtimes should run as isolated external services rather than being
  embedded into the Next.js dashboard without a measured reason.
- Local-only capabilities must remain clearly separated from the client-safe
  hosted runtime.
- Every enabled hosted capability needs an adapter contract, provider/model
  allowlist, secret boundary, tenant isolation, budget controls, retention
  policy, observability, and rollback evidence.

## Candidate inventory

The V96 reference register contains the current pinned repository, guide, and
service portfolio, including placement, runtime class, permissions, and
evidence gates: [V96 capability reference register](./v96-capability-reference-register.md).
The full planning prompt, sanitized resource list, built-versus-cataloged
audit, and next implementation item are preserved in the
[V96 Native Capability Plane brief](./V96-NATIVE-CAPABILITY-PLANE-BRIEF.md).

| Candidate | Area | Current decision | Primary note |
| --- | --- | --- | --- |
| Cloud memory and inference | Obsidian-compatible client memory, Graphify-style graphs, and lower-cost hosted inference | Product direction: stage cloud memory first; use bounded provider APIs first; evaluate a dedicated inference plane only when measured demand justifies it | [Cloud memory and inference](./cloud-memory-and-inference.md) |
| LMCache | Inference-time KV-cache reuse | Research and defer | [lmcache.md](./lmcache.md) |
| Viktor | External AI employee / cross-tool operator | Pilot externally; do not make a core dependency | [viktor-ai-employee.md](./viktor-ai-employee.md) |
| Workplace integrations | Slack, Teams, WhatsApp, Drive, Gmail, Calendar, CRM, and business tools | Future capability; staged read-first rollout | [workplace-integrations.md](./workplace-integrations.md) |
| Open WebUI | Private model workspace | Reuse existing VPS; do not embed | [V2 candidate register](../../V2-INTEGRATION-CANDIDATES.md) |
| Vane | Cited research and search | Evaluate later on a private VPS | [V2 candidate register](../../V2-INTEGRATION-CANDIDATES.md) |
| Cline | Coding lane | Optional local integration | [V2 candidate register](../../V2-INTEGRATION-CANDIDATES.md) |
| OpenHands | Coding automation plane | Explicitly deferred | [V2 candidate register](../../V2-INTEGRATION-CANDIDATES.md) |
| Chatterbox | Local TTS fallback | Prototype after storage gate | [V2 candidate register](../../V2-INTEGRATION-CANDIDATES.md) |
| Oracle/Coolify runtime | Optional persistent compute plane | Add only for a demonstrated long-lived workload | [Oracle option](../oracle-self-hosted-runtime-option.md) |
| [PostHog](https://posthog.com/docs) | Product analytics, funnels, feature usage, and experiment evidence | **Adapter implemented; activate after account setup** | Track activation, memory usage, workflow completion, provider failures, lead conversion, and delivery outcomes. Do not send prompts, provider keys, or raw client conversation content. |
| [Sentry](https://docs.sentry.io/) | Error tracking, traces, and release diagnostics | **Adapter implemented; activate before wider client onboarding** | Capture route/provider/queue failures with tenant-safe redaction, release IDs, and correlation IDs. Keep prompt and artifact bodies out of event payloads. |
| [OpenSEO](https://github.com/every-app/open-seo) | Keyword research, rank tracking, competitor insights, backlinks, site audits, and AI visibility through MCP/skills | **Next: evaluate as a bounded SEO research adapter** | Strong fit for Veloce’s Govern and Deliver lanes and for marketing Veloce itself. Start read-only with a small allowlist and DataForSEO budget; do not embed its full application. |
| [Stripe](https://stripe.com/docs) | Billing, subscriptions, checkout, invoices, and customer entitlements | Conditional next: add only when paid plans or paid pilots are ready | Keep Stripe as the billing system of record and mirror only tenant entitlement state into Veloce. Require webhook verification, idempotency, audit records, and approval for refunds or plan changes. |
| [OpenWork](https://github.com/different-ai/openwork) | Shared skills, MCP connections, and agent capabilities across people, machines, and compatible agents | Research: adapter or interoperability study | Learn from its capability discovery and execution model. Do not make its remote MCP or organization control plane a hidden dependency; preserve Veloce’s own tenant, approval, budget, and audit boundaries. |
| [Buzz](https://github.com/block/buzz) | Self-hosted human/agent rooms, signed event log, workflows, reviews, repository activity, and searchable collaboration history | Research: durable collaboration architecture | Study event-sourced conversation and agent identity. Do not replace Veloce’s Supabase records yet; first prove that a Veloce conversation, approval, artifact, and workflow event model needs a separate relay. |
| [Instatic](https://github.com/CoreBunch/Instatic) | Self-hosted visual CMS and clean static-page publishing | Later: evaluate for approved microsites and campaign assets | Useful as a publishing/reference lane, not as the Veloce portal runtime. Keep publication behind human approval and delivery controls; retain Veloce as the source of campaign briefs and evidence. |
| [CAD Skills](https://github.com/earthtojake/text-to-cad) | Agent skills for CAD, STEP/STL/3MF/GLB, DXF, URDF/SDF, slicing, and local fabrication workflows | Optional vertical: defer until a manufacturing/design customer needs it | Treat as a skill-pack or isolated local worker. Never allow fabrication, uploads, or machine actions from a hosted tenant without explicit scopes, review, and a separate execution boundary. |
| [Clerk](https://clerk.com/docs/integrations/supabase) | Hosted identity and user management | Defer: Supabase Auth is already the identity boundary | Adding Clerk now would duplicate identity and require an explicit synchronization/RLS design. Revisit only if a concrete enterprise identity requirement is not met by Supabase Auth. |
| [Upstash](https://upstash.com/docs) | Redis-compatible cache, rate limits, sessions, and lightweight queues | Defer: use existing queue/storage primitives first | Add only when measured cache, rate-limit, or burst-queue pressure justifies another operational dependency. It must never become the durable conversation store. |
| [pgvector](https://supabase.com/docs/guides/database/extensions/pgvector) / [Pinecone](https://docs.pinecone.io/) | Semantic retrieval over tenant documents | **Prefer pgvector in Supabase first; Pinecone is a later scale option** | Keep document metadata, ownership, deletion, and source references in Veloce’s tenant database. Introduce Pinecone only when scale, latency, or isolation evidence requires a dedicated vector service. |
| [Resend](https://resend.com/docs) | Transactional email and lead notifications | Active: retain current integration | Keep email delivery allowlisted, logged, rate-limited, and approval-aware. Store delivery status and a safe receipt record, not sensitive prompt contents. |
| [Cloudflare](https://developers.cloudflare.com/) | DNS, WAF, custom domains, edge controls, tunnels, and optional self-hosted deployment | Later: use for a specific edge/custom-domain requirement | It is useful for approved public delivery or a self-hosted OpenSEO/Instatic lane, but it does not replace Veloce’s tenant authorization, audit, or storage controls. |
| [Namecheap API](https://www.namecheap.com/support/api/intro/) | Domain registration and DNS administration | Registrar-only: no product integration needed now | Keep domain purchase and registrar operations outside the core runtime. Add an adapter only if Veloce will intentionally manage domains for customers, with explicit approval and billing evidence. |

## Reviewed Resource Shortlist

The following projects came from the August 2026 product and infrastructure
review. They are references or candidates, not bundled dependencies. The
links are kept here so a future implementation can begin from the original
source rather than from a screenshot or an unverified copy.

### Highest-value next work

1. **Observability activation:** create the PostHog and Sentry projects, add
   their server-only configuration, then verify redaction, correlation IDs,
   release tracking, tenant-safe event schemas, and retention rules.
2. **SEO proof loop:** evaluate OpenSEO read-only for Veloce’s own content and
   SEO workflows. Prove one keyword brief, one competitor comparison, one
   technical audit, and one AI-visibility report before any broader adapter.
3. **Durable conversation evidence:** continue treating server-persisted,
   tenant-scoped conversation history as the source of truth. Add export,
   deletion, retention, and conversation search before introducing another
   collaboration substrate.
4. **Billing readiness:** design Stripe entitlements and webhook evidence only
   when a paid pilot or subscription flow is actually being prepared.

### Research, not immediate implementation

- **OpenWork:** study capability discovery, shared MCP/skill access, and
  organization-level policies. Veloce should borrow the contract shape, not
  silently proxy a third-party control plane.
- **Buzz:** study signed, event-sourced rooms where human messages, agent
  actions, approvals, patches, and workflow steps share one searchable log.
  This could inform a later conversation/event schema, but does not justify a
  second database or relay today.
- **Instatic:** evaluate as a separately deployed publishing surface for
  approved marketing microsites. Veloce should own the brief, approval, asset
  record, and delivery receipt.
- **CAD Skills:** keep as a vertical skill-pack candidate for hardware,
  robotics, or fabrication customers. Any local file or machine operation must
  remain outside the hosted client-safe runtime unless a dedicated reviewed
  worker is added.

### Explicit non-goals for the next milestone

- Do not add Clerk while Supabase Auth is the current identity boundary.
- Do not use Pinecone before testing tenant-scoped pgvector retrieval in the
  existing database and storage design.
- Do not add Upstash merely to avoid a free-tier limit; first measure the
  workload and compare its cost and operational value with the existing queue.
- Do not make Cloudflare or Namecheap a hidden requirement for every tenant.
  They are edge and registrar choices for particular deployment paths.
- Do not let any of these candidates publish, contact prospects, charge a
  customer, or trigger a physical-world action without the existing human
  approval and audit gates.

## Next Review Triggers

## Native playbook plane

The governed reference register now feeds a read-only, Veloce-owned playbook
plane. Native-enabled behavior is selected automatically from natural-language
requests through `/api/client-runtime/intent`; it is not an installer or a
client skill marketplace. See
[`V96-NATIVE-INTENT-ROUTER-PLAN.md`](./V96-NATIVE-INTENT-ROUTER-PLAN.md) and
[`v96-capability-reference-register.md`](./v96-capability-reference-register.md).

The same resolver and manifest switch are used locally and in owner-cloud.
Contract-only, reference-only, operator-only, GPU, security-execution,
communications, worktree, and continuous-streaming-speech entries remain
ineligible until their evidence gates pass.

Revisit this register when one of these conditions occurs:

- a pilot requires product analytics or a reproducible production error trail;
- Veloce has an approved SEO campaign with a defined DataForSEO budget;
- a paid pilot requires subscriptions, invoices, or entitlements;
- conversation volume, retrieval latency, or tenant document size exceeds the
  current Supabase and Cloud Storage design;
- a customer needs self-hosted collaboration, a custom-domain publishing
  lane, or a manufacturing/CAD workflow.

## Suggested review fields for new candidates

Each new note should record:

1. What the project is and what problem it solves.
2. The original source, official repository, license, and current maturity.
3. The exact Veloce layer it would touch.
4. What it replaces, complements, or duplicates.
5. Local Mac fit and hosted-runtime fit.
6. Data, credential, tenancy, and security implications.
7. Installation and operational cost.
8. A reversible proof-of-value experiment.
9. Acceptance criteria and a clear no-go condition.
10. The decision, owner, and next review trigger.
