# Optional host-authenticated draft runtime

This is a separately constructed draft-only h1 service for future Veloce host binding. The normal local app does not start it, and no host registry/worker or cloud deployment is enabled by these files. Use public/synthetic data while shared client-data gates remain open. The standalone Sources → Proposal → Payment → Kickoff app still runs without it.

## Construction and trust

`createCommerceDraftRuntime` returns a Node HTTP server without opening a listener. The operator supplies a configured tenant, one to three **host public keys**, a dedicated `CommerceDraftJournal`, a pre-existing drafter, its exact provider/model identifiers and an operator budget maximum. It accepts no host signing/private key or worker credential. Existing models are injected through the same drafter interfaces; no model is selected, trained, downloaded or installed by this runtime.

The journal must use a separate private directory (0700) and private database file (0600). It refuses symlinks and a database containing other application tables. An in-memory journal is suitable only for tests and is refused by the runtime constructor unless `allowVolatileJournalForTests: true` is explicitly supplied. The application account database is not the runtime journal. Keep both runtime state and keys out of source packages. The host signing key must remain in its existing host signing boundary; do not copy it to the runtime.

The host must authorize job/source/review authority and reserve against its central ledger before minting a runtime call. A valid token proves host authorization, not that the sidecar independently read a central budget reservation. The host dispatcher owns that ordering. The runtime also enforces its configured provider/model and request budget ceiling; actual provider price/maximum enforcement and unknown costs still need the upstream policy described in ADR-026.

## Request-bound h1 calls

All operations require a fresh short-lived Ed25519 h1 bearer token, signed by the host, with exactly one operation scope, the configured tenant/audience, a unique `jti`, and the relevant source UUIDs in `handles`. Maximum token lifetime is 300 seconds, with the existing 30-second future clock allowance. A single-use token is consumed durably before model execution or an authorized read/cancel result.

Commerce additionally requires `requestSha256`: lowercase SHA-256 of the UTF-8 text `METHOD + "\n" + rawPathAndQuery + "\n" + rawBody`. The host's existing token minter now supports this optional field. Commerce refuses a missing/mismatched fingerprint; it covers the exact request serialization, including task ID, source snapshots, model, instruction and budget. Legacy callers remain compatible with existing consumers that do not request a fingerprint; the Commerce runtime requires it. Changing a body or query after signing invalidates the call.

| Operation | Endpoint | Behavior |
|---|---|---|
| `manifest` | `GET /h1/manifest` | Draft-only manifest, no payment authority; deletion guarantee `none` |
| `health` | `GET /h1/health` | Configuration availability, with no model/provider call |
| `task.run` | `POST /h1/task.run` | Bound `proposal.draft` request, one durable admission per task/idempotency identity |
| `task.get` | `GET /h1/task.get?id=UUID` | Stored task status, no draft body |
| `task.result` | `GET /h1/task.result?id=UUID` | Completed bounded draft/accounting result, or pending/uncertain status |
| `task.cancel` | `POST /h1/task.cancel` | Holds running work; explicitly does not confirm provider termination or release money |

The `task.run` body uses h1 fields `tenantSlug`, `adapterId: "veloce-commerce"`, `task: "proposal.draft"`, `idempotencyKey`, `budgetMaxMicros`, `sideEffect: "draft"`, and `input`. Input contains only `taskId`, `sources`, `instruction`, `provider` and `model`. Sources carry the trusted host's exact content/review/hash/revision/original-clock snapshots and must be approved ordinary data with token-named IDs. No approval, payment, command, arbitrary model selection, host credential or local-user role can be supplied. Request bodies are bounded at 128,000 bytes and concurrent model calls are bounded by operator configuration (default two). Redirects/public HTTPS/hosting are not configured here.

The enclosing Veloce host transport uses HTTPS, permitting HTTP only to explicit loopback test configuration. It signs each exact request and keeps the host worker token out of runtime payloads. Its end-to-end local tests use the actual host token minter, existing central-budget wrappers, a real loopback runtime and a fixture model transport. This does not prove a real hosted ledger, billing, source resolver, public deployment or live model-through-sidecar run.

## Durable outcome handling

The journal commits token consumption and task identity/fingerprint/claim before the provider callback. Fresh-token retries with the identical completed request return the same result. Changed input under the same task or idempotency identity is refused. A running/uncertain admission never automatically re-executes, including after restart. A model exception, lost response or journal failure remains uncertain; the existing durable admission blocks another model call. Stored `running` is an admission record, **not proof of process liveness**.

The host can retrieve a completed result using a new request-bound `task.result` token rather than dispatching again. Cash cost remains `null` for current subscription usage; unknown cost is not zero, and the host reservation remains open until explicitly reconciled. A cancellation marks work uncertain, discards a late result, and reports `providerCancellationConfirmed: false`. It does not establish that a model stopped or that a charge was avoided. No payment/refund/payout path exists here.

## Retention and limits

The dedicated journal holds task/request fingerprints, source IDs, original earliest source expiry, status/claim and generated result; it does not separately store request source bodies, instructions, token bytes, credentials or keys. Generated output may quote source material, so the entire result is governed as content. Results are hidden at original expiry. Privileged `journal.purge(tenant)` previews bounded cleanup; `apply: true` redacts results after seven recovery days and removes spent-token IDs one day after token expiry. Task/request skeletons remain to prevent redispatch. The schema is classified separately in `draft-runtime-inventory.json`, with a regression check against the actual dedicated database.

Use one durable local journal for an activated instance. Independent journals behind multiple replicas do not share replay history; no distributed or network-filesystem guarantee is made. No purge is scheduled. No export/restore or source-withdrawal receipt protocol is implemented for this separate journal. Never reset/replace it with an old backup to force another dispatch. `journal.compact()` supports offline local WAL checkpoint/truncation and vacuum after logical cleanup; tests inspect a disposable compacted file for removed fixture text. This does not guarantee deletion from OS snapshots, backups, storage media or provider copies. Its h1 deletion guarantee remains `none`, so it must remain excluded from client deployment until the required lifecycle/receipt and hosted isolation gates are complete.

There is no automatic activation or secret loading. The calling host's canonical Phase 3 review resolver, verified claimed-job orchestration, durable central outcome/cost reconciliation, identity/lifecycle binding and owner approval of activation remain open. The PayPal acceptance workflow remains a separate gate in `SANDBOX-ACCEPTANCE.md`.
