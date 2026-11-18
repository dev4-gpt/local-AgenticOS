# ADR 011: QM as a multi-agent harness adapter

**Status:** shim built, adapter `disabled`. Nothing calls QM from the host yet, and the adapter stays outside the client
edition until the retention work below is done.
**Date:** 2026-10-20
**Scope:** `yc-software/qm` (MIT), run as its own service behind a thin Veloce shim (`services/qm-adapter/`).
**Builds on:** ADR-005 (adapter host contract `h1`), ADR-006 (approval gateway), ADR-007 (budget).

## Why

QM is a complete multi-agent harness: durable agent runs, per-scope sandboxes (local Docker, E2B, Fly, Modal, AWS),
swarms with spend and agent-count caps, crons, skills and a model gateway. Building that ourselves is months of work.
Its licence is MIT, so there is no separation requirement of the kind ADR-010 describes for AGPL projects. It is still
run as a separate process, because it is a whole product with its own database, login and memory, and ADR-005 says every
adapter is a separate service reached over HTTP. Nothing in this repo copies or vendors QM code.

## What a spike showed (2026-10-20, local, no model keys, throwaway secrets)

- It installs with scripts off and boots in about 7 seconds in memory mode with the mock harness.
- Every route except `/healthz` answers 401 without a signed request. Requests are signed with HMAC-SHA256 over
  `v0:<timestamp>:<METHOD>\n<path?query>\n<body>` using a shared signing secret, with a 5 minute replay window and an
  event id that is single use.
- `POST /v1/turns?async=1` returns `202 {runId}`. `GET /v1/runs/:id` returns the run (`pending`, `running`, `done`,
  `failed`, with the reply under `result`). `POST /v1/runs/:id/signal {"kind":"abort"}` answers `accepted:false,
  reason:"terminal"` on a finished run.
- Not tested: the Docker sandbox, Postgres mode, a real model, swarms, its memory-provider hook, its model gateway, how
  an aborted run is reported, and any security review.

## Decision

A small service of our own, `services/qm-adapter/`, sits in front of one QM instance (one client, one QM, one database)
and speaks `h1`. QM is never reachable by anything except the shim.

| `h1` operation | Shim route | QM call |
| --- | --- | --- |
| `manifest` | `GET /h1/manifest` | none |
| `health` | `GET /h1/health` | `GET /healthz` |
| `task.run` (`agent.run`) | `POST /h1/task.run` | `POST /v1/turns?async=1` |
| `task.get` | `GET /h1/task.get?id=` | `GET /v1/runs/:id` |
| `task.cancel` | `POST /h1/task.cancel` | `POST /v1/runs/:id/signal` with `{"kind":"abort"}` |

Rules the shim enforces, none of which depend on QM behaving:

1. **Every call carries a host token** (Ed25519, ADR-006): signature, `aud` equal to the adapter id, the configured tenant,
   the operation in `scope`, a lifetime of at most 300 seconds, and a `jti` that is used once. Failure is the same 401
   whatever the reason.
2. **The tenant is configuration, not input.** A request that names another tenant is refused.
3. **Only the declared task exists.** `agent.run` is draft-class. A publish-class task is not declared, so it cannot be
   asked for, and the host's approval gateway is not bypassed.
4. **The signing secret never leaves the shim.** QM's reply text is returned; QM error text is never echoed.
5. **Bounded:** request bodies 64 KB, prompt text 20,000 characters, QM calls time out at 10 seconds, ids are validated.
6. **Retries are safe:** the same idempotency key with the same body returns the same task; the same key with a different
   body is a conflict.

## What this does not do

- **Metering.** The host must reserve budget before `task.run` and settle after. The shim records `budgetMaxMicros` but
  cannot enforce it. QM's model calls must later go through a Veloce metering gateway so spend shows in the Budget tab.
  Until then the adapter stays `disabled`.
- **Retention (blocking for the client edition).** QM has about 70 Postgres tables, several holding raw content: session
  tape and entries, full model prompts (`llm_prompt_envelopes`, `session_llm_requests`), tool calls, memory facts and
  revisions, files, channel messages. None is covered by the 28 + 7 day rule or the retention verifier. QM also keeps
  memory history after a clear. So the manifest says `deletionGuarantee: "none"`, which ADR-005 item 5 keeps out of the
  client edition. Fixing it means one database per client, every table classified, a purge job, and routing QM's memory
  to the host through its external-provider hook so the host's tombstone and receipt rules apply.
- **Audit.** QM's own audit log is an in-memory buffer of 50,000 events. The host outbox stays the record.
- **Identity.** QM has its own login. It is not exposed to users; only the shim talks to it, with a fixed actor.
- **Replay protection across restarts.** The shim's default `jti` store is in memory. The host-side
  `client_adapter_consume_token` function is the production answer and is injected, not built here.
- **Unverified mapping.** How QM reports an aborted run is guessed (`aborted` or `cancelled` becomes `cancelled`, anything
  unknown becomes `failed`). Confirm on staging.

## Order of work

1. This shim and its tests (done, adapter disabled).
2. Staging spike with a real model key: confirm the mapping above, the Docker sandbox, Postgres mode.
3. Metering gateway so QM's model calls reserve and settle against the host budget.
4. Retention: classify QM's tables, one database per client, purge job, verifier coverage.
5. Route QM memory to the host; add `memory.propose` and `memory.tombstone` to the manifest only when that works.
6. Add the borrowed designs to the host itself: memory sensitivity labels, command policy mapped to the approval
   gateway, and the single background-owner record (informs tracker item 9b).

## Rollback

Delete `services/qm-adapter/` and this ADR. The host does not reference them, and the adapter is not in the registry.
