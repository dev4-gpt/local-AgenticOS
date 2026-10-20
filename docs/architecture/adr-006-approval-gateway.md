# ADR 006: Durable two-person approval gateway

**Status:** accepted
**Date:** 2026-10-19
**Builds on:** ADR 005 (adapter host contract and governed memory)

## Decision

Every adapter action that publishes outside the host, promotes private memory to shared memory, or enables an
adapter needs an approval that is stored in the database, bound to one exact action, and used once.

1. **Three database functions, no new tables.** `client_adapter_request_approval` (any tenant member),
   `client_adapter_decide_approval` (an owner or admin who is not the requester) and
   `client_adapter_execute_approval` (the host worker, using the tenant worker token). The rules run inside the
   database so a route bug cannot skip them.
2. **Identity comes from the login.** Requester and approver are read from `auth.uid()`. No route or function
   accepts a user id from the request body.
3. **The host computes the action hash.** `approvalActionHash` hashes the kind, adapter, destination, policy
   version and full payload as canonical JSON. A hash sent by a caller is ignored. Approving requires repeating
   the hash; a mismatch is refused. Execution requires the same hash again, so an approval cannot be reused for a
   different action.
4. **Short life, single use.** Requests expire (default 24 hours, 1 minute to 3 days). An expired request is marked
   expired and no longer blocks a new request for the same action. Executing a request twice returns false.
   At most 50 requests per tenant can be open at once.
5. **Closed by default.** The routes under `/api/client-runtime/adapter-approvals` answer 403 unless
   `ADAPTER_HOST_ENABLED=true`, and they are not added to any default API allowlist.
6. **Quiet failures.** Unknown ids and other tenants' approvals both answer "not found". Unrecognised database
   errors are reported as "unavailable" and never echoed.
7. **Audit.** Request and decision write a client audit event and an outbox event (`approval.requested`,
   `approval.decided`).

## What the reviewer sees (added with the approvals screen)

A fingerprint alone does not let a reviewer see what they are approving. So a request now also stores the exact
canonical text that was hashed (`action_canonical`, at most 16 KB). The database checks, before storing anything, that
the text is a JSON object, that its SHA-256 equals the fingerprint, and that its own kind, adapter, destination and
policy version equal the row's. A request whose text is missing, oversized, not JSON, or does not match is refused. The
text cannot be changed afterwards (the approval guard treats it as part of the row's identity), follows the same
28 + 7 retention as the rest of the approval, and is in the backup and restore projection. Older rows have no text.
The old seven-argument request function is removed so nothing can skip the check.

What this proves and what it does not: the text a reviewer reads is exactly what the fingerprint covers, and the
worker must present the same fingerprint at execution. It does not prove the adapter will later do what the text says;
that depends on the host executing from the same payload it hashed.

## What this does not do yet

- The execute path is called by the host worker only; no adapter calls it yet.
- Adapter tokens (`src/lib/adapterTokens.ts`) are Ed25519, last at most 5 minutes (default 60 seconds), name one
  tenant, one adapter and a list of operations, and carry a unique id that `client_adapter_consume_token` accepts
  once (table `client_adapter_token_uses`). Nothing sends or checks them yet: key storage, rotation and the
  adapter-side check come with the first real adapter. Keys are passed in by the caller and never read from the
  environment by this module.
- Approvals follow the same 28 + 7 day rule as all other tenant data (decided 2026-10-20 on the owner's behalf under
  the standing retention policy, tracker item 11). The record of who approved what outlives the row only as the
  `approval.*` outbox events, which also expire on that schedule. If a longer evidence period is wanted, change the
  class and the schedule together. Hosted migration and the scheduled expiry sweep are still unverified (items 9b, 4a).
- Two real people are still needed: the user plans to test with two of their own email accounts.

## Rollback

Leave `ADAPTER_HOST_ENABLED` unset. The functions and routes then do nothing. The SQL file can be dropped with
`drop function` for the three functions; it creates no tables.
