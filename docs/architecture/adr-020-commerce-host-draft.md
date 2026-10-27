# ADR 020: Commerce host drafting admission

Status: local implementation seam; activation and deployment pending. This does not amend the owner's outstanding decision about routing model execution through the host.

## Problem and boundary

Veloce Commerce has its own reproducible local prototype. Connecting it to Veloce must preserve the host's source authority and central budget, rather than create a second ledger or trust claims from browser/adapter input. The current Notebook worker loader returns authorized text/metadata for a running job, but its response does not carry the distinct review/sensitivity authority Commerce requires. Legacy notes must not become approved ordinary sources by inference.

`src/lib/commerceHostDraft.ts` is server-only host code. It calls the existing `reserveAdapterBudget`, `settleAdapterBudget` and `releaseAdapterBudget` functions. It has no environment reads, API route, UI activation, database migration, provider credentials or model installation. No production worker invokes it yet. The standalone public source package continues to run without this optional host library.

## Trusted inputs and output

The calling host worker must derive job/tenant membership from verified host state, choose the provider/model/caps, resolve fresh Notebook records, and resolve review-ledger rows bound to exact content and metadata hashes. Its worker token remains in the host budget RPC calls. The runtime callback receives only tenant/task ID, selected source content/references, instruction, configured provider/model and maximum budget. It never receives the host worker token or payment authority.

Source admission requires one to five selected UUIDs, matching record/review sets, source title/content limits, the host's original retention days (at most 28), and a review row with:

- matching tenant/source ID and explicit stable revision;
- `approved` review state and `ordinary` sensitivity;
- different requester/reviewer UUIDs, both currently active, with reviewer role owner/admin;
- exact content SHA-256 and Notebook metadata SHA-256 (using Veloce's existing metadata helper);
- original creation time, reviewed time and original review expiry bounded by the source's original host retention window.

No missing review field, sensitivity classification or original clock is invented. The normalizer does not authenticate its arguments; the callback supplying them is privileged and must enforce tenant/job permissions and the actual review-ledger relationship. No existing review table/endpoint is assumed to supply this new shape already. Source output keeps original expiry rather than starting a new window on dispatch.

## Budget sequence

1. Disabled or malformed configurations, missing review or unavailable sources dispatch nothing.
2. Reserve the operator's positive maximum in integer USD micros against the existing adapter/central ledger. Provider pricing and whether that maximum is a sufficient bound remain upstream configuration responsibilities; this library does not invent a price or impose a guaranteed provider invoice ceiling.
3. Only a fresh exact `reserved` result admits dispatch. `already_reserved` requires reconciliation and never repeats the provider call. An unavailable/ambiguous reservation reply is also reconciliation-required.
4. Reload the authorized records/reviews after reservation. A change releases only this unused reservation, using a distinct release idempotency key. Failure to release requires reconciliation.
5. Call the already configured runtime once. Exceptions, invalid output/citations, unexpected provider/model, unverified cost, over-reservation or settlement failure hold authority and require reconciliation. Never release after a possible provider call merely because its response was lost.
6. Verified actual integer cost is settled through the existing central function with a distinct settle key. A real zero can be settled only as verified runtime accounting; an unknown cost is `null`, never zero. Existing Claude subscription results currently report unknown cash cost, so the maximum reservation remains open as `reserved_cost_unknown`; no invoice or zero-cost API claim is made.
7. Reload source authority after the runtime returns. If it changed during drafting, withhold the stale draft. Preserve settled financial facts or the open unknown-cost reservation. Do not erase actual spend by releasing it.
8. Return a bounded draft and exact source references, not a commercial approval, proposal execution token, payment intent or kickoff. Any later Veloce proposal persistence still needs its own transaction and fresh source/identity admission.

The central reserve/settle RPCs own idempotency and caps. There is no local financial ledger here. A worker crash can leave a reservation open: durable task/outcome reconciliation and explicit operator handling are still necessary. This is conservative admission, not exactly-once execution at an arbitrary remote provider.

## Required integration work before activation

- Select the canonical Phase 3 review/sensitivity/revision store with the owner; implement an authenticated resolver for that authority without copying legacy notes into approval.
- Wire this library into a verified claimed host job and choose a separately reviewed runtime/sidecar transport. Keep the h1 adapter process boundary and scoped single-use token rules; do not send the host worker credential to a sidecar.
- Supply configured, already available models and a verified cost/maximum policy; do not enable paid providers or download weights by default. Unknown subscription cost needs an explicit reservation/reconciliation policy before hosted use.
- Persist/reconcile task outcomes and unknown costs, and bind proposal persistence/source invalidation/identity to the host's durable lifecycle. No data purge schedule or hosted RLS proof is implied by this function.
- Complete shared lifecycle inventory, financial retention, external deletion guarantees and the broader client-data gates before real client material.
- Run real central RPC and actual configured runtime tests on the exact candidate. The current tests use fixture RPC/runtime callbacks; they do not establish hosted budgets, provider billing or live model interoperability.

## Verification

`tests/commerce-host-draft.spec.ts` loads the actual host library plus the existing budget and Notebook metadata/citation helpers. It tests source authority, original clocks/hashes, refusal before dispatch, reservation/settlement keys, no worker token in runtime payload, duplicate/ambiguous reservation handling, pre-call release, unknown subscription accounting, provider uncertainty, citation/cost failures, in-flight source withdrawal and mutation of caller objects during awaits. Adjacent budget and Notebook provenance regressions run with it through `npm run test:commerce-host`; the new spec also belongs to `test:focused`.

The local run uses already installed Veloce test dependencies; no new dependencies/models are installed. This establishes the host seam against local boundary fixtures. Activation remains disabled/unwired and the full C7 integration is not complete.

## Local transport follow-up

ADR-021 adds a concrete request-bound host HTTP transport and optional draft-only runtime with a dedicated replay/result journal. The verified host-job caller, canonical review resolver, central outcome reconciliation and activation remain open. Local transport tests use fixture billing/model callbacks; they do not close the hosted/runtime/client-data gates above.
