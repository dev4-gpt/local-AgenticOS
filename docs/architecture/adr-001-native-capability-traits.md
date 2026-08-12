# ADR 001: Native capability-traits architecture

**Status:** accepted  
**Date:** 2026-08-12  
**Scope:** V96 governed jobs, local workers, and the owner-cloud client runtime

## Decision

Repository-derived behavior is architectural input, not a user-facing skill or
plugin marketplace. Every queued governed job receives a resolver-produced
trait snapshot at the shared enqueue boundary. The snapshot is copied into job
metadata and the worker refuses to execute a job when the snapshot is absent or
invalid. Adapters return trait evidence in output metadata; the operator-only
inspection route exposes that evidence without adding client controls.

The first implementation wave is Research + Knowledge. It uses the existing
`input_metadata`, `output_metadata`, audit events, and tenant-scoped records;
there is no new control-plane table. Context compilation emits the same trait
snapshot and keeps generated skills as reviewed tenant data with no permission
grant.

The repository catalog is versioned in
`src/lib/v96RepositoryCatalog.ts`. Each entry carries a pinned source revision,
license, provenance, extracted traits, target capability, runtime class, and
bounded execution permissions. Catalog validation is a CI gate. A cataloged
source does not become executable code: later adapters must earn a separate
evidence gate.

## Consequences

- Tenant isolation, provenance, budget, idempotency, audit, resumability, and
  approval are automatic baseline traits.
- Research adds source policy, SSRF protection, citations, confidence, and
  partial-result handling; Knowledge adds retention, deletion lineage, chunk
  provenance, and reviewed activation.
- Security, tenant, provenance, budget, and approval failures fail closed.
  Incomplete research and quality findings may remain `partial` or `review`.
- The normal client workflow remains unchanged. `/capabilities` stays
  informational and manifest-controlled.
- Visual QA, GPU media, security execution, communications, and worktree
  execution remain contract-only or gated until their evidence suites pass.

## Rejected alternatives

- A user-selected skill/tool column would make governance optional and create a
  second permission model.
- Vendoring every STAR repository would enlarge the trusted computing base and
  make license, update, and rollback boundaries unclear.
- A new trait database would duplicate durable job metadata before query volume
  proves it is needed.

## Evidence gate

Promotion requires the focused trait suite, the full build/security checks,
tenant-isolation and deletion-lineage checks, local/cloud contract parity, and
an authenticated smoke whose revision is recorded in the V96 verification
report. A catalog entry may advance from `cataloged` to `contract-only`,
`pilot`, `gated`, or `enabled`; the status is not inferred from its presence in
the catalog.
