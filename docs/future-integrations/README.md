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
