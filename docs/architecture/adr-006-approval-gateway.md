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

## What this does not do yet

- The execute path is called by the host worker only; no adapter calls it yet.
- Adapter-to-host authentication (signed tokens) is step 3b.
- Hosted migration, scheduled expiry sweeps, and retention classes for the approvals table are provisional
  (see the retention map).
- Two real people are still needed: the user plans to test with two of their own email accounts.

## Rollback

Leave `ADAPTER_HOST_ENABLED` unset. The functions and routes then do nothing. The SQL file can be dropped with
`drop function` for the three functions; it creates no tables.
