# V96 Native Intent Router and Built-in Playbook Plane

Veloce treats approved skills, loops, roles, and repository-derived behaviors
as internal architecture. A client writes a natural-language request; the
platform resolves it to an eligible native playbook under the existing tenant,
provenance, budget, idempotency, audit, approval, quality, and compression
traits. There is no install, add-skill, or tool-selection control.

## Runtime shape

1. `POST /api/client-runtime/intent` authenticates the tenant member, validates
   the surface and secret safety, checks the server manifest, and queues an
   `intent-routing` preflight job in `client_runtime_jobs`.
2. The deterministic resolver scores only native/client-ready playbooks. If one
   safe candidate is unambiguous it avoids a second model call.
3. Otherwise the approved provider adapter receives a bounded catalog summary
   and request context, with no tools and native context compression. Strict
   JSON is registry-validated and confidence below `0.78` becomes one focused
   clarification question.
4. The worker persists a redacted plan snapshot: IDs, counts, hashes, policy
   outcomes, trait evidence, risk, approval, and compression metadata. Raw
   classifier prompts are not plan evidence.
5. Low-risk work is dispatched through the governed provider boundary. Review
   and external work stop at the existing approval boundary. Gated capabilities
   cannot be selected by the classifier.

`GET /api/client-runtime/intent?planId=...` exposes only tenant-scoped plan
card fields. The read-only Ready playbooks library is returned by
`/api/client-runtime/skills` and rendered by Integrations. Upstream repositories
remain clean, pinned provenance references; they are not installed into the
Next.js image.

## Native playbooks

- Research and citation
- Knowledge grounding
- Draft and review
- Workflow planning
- Quality review
- Context-efficient provider work
- Reviewed approved-provider specialist roles from the curated skill pack

The local launcher enables `CLIENT_INTENT_ROUTING_ENABLED=1`. Cloud provisioning
derives the same flag from `intentRoutingEnabled`; rollback is manifest-only.
Specialized forms keep their explicit capability contracts. Visual QA cloud
promotion for `dofgfood`, GPU, Supervision enhancement, security execution,
communications, worktrees, and continuous streaming speech remain gated.
