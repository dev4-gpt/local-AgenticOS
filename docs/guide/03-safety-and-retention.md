# Safety and retention: what holds today, and what is only promised

This file separates two things that are easy to mix up: **enforced** (code exists and a test fails if it breaks) and **promised** (written down, not built or not verified). Update it after every step.

Bottom line today: **no real client data may touch any adapter.** Veloce's own readiness checker still reports `releaseReady=false`, hosted tenant isolation and the 28 + 7 retention rule have not been verified in a hosted environment, and no adapter speaks the contract yet.

---

## 1. Enforced now (with proof)

| Protection | Where enforced | Proof |
|---|---|---|
| Tenants cannot see each other's adapter data | Row-level security on all adapter tables | `adapter-host-sql.spec.ts` (tenants and roles) |
| Only owners/admins can register adapters or read private memory | Database policies | same |
| Anonymous users get nothing | No grants for the anonymous role | same, plus gateway and token SQL specs |
| Shared memory needs an approved promotion with the same content hash | Database trigger | `adapter-host-sql.spec.ts` |
| Promotion reviewer is not the requester | Database constraint | same |
| One active shared note per content hash | Unique index | same |
| Shared notes cannot be edited, only tombstoned (text erased, permanent) | Database trigger | same |
| History and budget log cannot be edited or removed | Append-only triggers | same |
| Approval requester is never the approver | Database constraint and function | `adapter-approval-gateway-sql.spec.ts` |
| Approval is tied to the exact action fingerprint | Server hashing plus database check | gateway specs |
| The text a reviewer reads is exactly what the fingerprint covers: the request stores the hashed text, the database refuses text that does not hash to the fingerprint or disagrees with the row, and the text cannot change afterwards | `client_adapter_request_approval`, approval guard | `adapter-approval-gateway-sql.spec.ts` (hash, field, invalid, oversize and immutability cases; three deliberate breakages each fail tests) |
| Approvals expire, and are used once | Database | gateway SQL spec |
| Approver identity is never taken from a request field | Functions read the login | gateway SQL and route specs |
| Approval routes are closed unless `ADAPTER_HOST_ENABLED=true` | Route code | `adapter-approval-gateway.spec.ts` |
| Adapter tokens are signed, short-lived, tenant/adapter/operation bound | Token code | `adapter-tokens.spec.ts` |
| A token cannot be replayed | `client_adapter_consume_token` | `adapter-token-uses-sql.spec.ts` |
| Money is whole-number micros only | Contract code and database checks | `adapter-contracts.spec.ts`, host SQL spec |
| An adapter cannot spend past its own cap (day, month or total) or the tenant's monthly cap | `client_adapter_budget_reserve` under a per-tenant lock | `adapter-budget-sql.spec.ts`; `adapter-budget-concurrency.spec.ts` (20 simultaneous requests, real Postgres, run once locally) |
| A retried charge counts once; settle cannot exceed the reservation; a task closes once | Budget functions | `adapter-budget-sql.spec.ts` |
| The approvals screen offers Approve and Reject only to an owner or admin who did not ask, only while a request is open, and Approve only when the stored text is present and agrees with its row; approving repeats the fingerprint that was shown; the database refuses everything else (own request, wrong fingerprint, second decision, plain member) | `adapterApprovalsView.ts` (buttons) and the database functions (the real rules) | `adapter-approvals-view.spec.ts` (8 tests; three deliberate breakages fail tests) and a browser check against a throwaway real Postgres |
| A promotion to shared memory must carry a scan of exactly this content, a provenance record for its source note, and fit within 25 waiting per adapter; a blocked scan can never be approved; a flagged one needs a written reason of at least 20 characters; the scan cannot be changed afterwards | Promotion guard trigger in `supabase-client-adapter-host.sql` | `adapter-promotions-sql.spec.ts` (10 tests; seven deliberate breakages each fail tests) |
| A reviewer who is not the requester decides a promotion by repeating its content hash, and an owner or admin can withdraw a shared note (text erased, adapters told to drop it) | `client_adapter_decide_promotion`, `client_adapter_revoke_shared_memory` | `adapter-promotions-sql.spec.ts` |
| The scanner finds order-giving text, concealment, control tokens, tool-call markup, dangerous commands, hidden characters, secrets (never repeated in its output) and risky links, including full-width letters, zero-width characters and phrases split over lines; shared notes are shown to a model as quoted data, escaped, shortened, and only if active and reviewed | `src/lib/adapterMemoryGuard.ts` | `adapter-memory-guard.spec.ts` (14 tests, including one that documents what it cannot catch; four deliberate breakages fail tests) |
| The review screen offers Approve only when the scan covers exactly this note, did not block it, the reviewer can read the note, and it is not already shared; shows the note with invisible characters made visible; requires a written reason of at least 20 characters for a flagged note; and offers Withdraw for shared notes; the database refuses everything else | `adapterPromotionsView.ts` (buttons) and the database functions and guard (the real rules) | `adapter-promotions-view.spec.ts` (10 tests; six deliberate breakages fail tests) and a browser check against a throwaway real Postgres |
| The Adapters page and Budget tab need sign-in and the host flag, show only validated data, and never appear in the client edition | Route, page and `HomeImmersive` tab switch | `adapter-overview.spec.ts` (route gates and bad data); client edition exclusion by not adding the route to the allowed lists |
| Budget calls fail closed (unknown or not-ready adapter, bad token, bad input, unexpected answer) | Budget functions and `adapterBudget.ts` | `adapter-budget-sql.spec.ts`, `adapter-budget.spec.ts` |
| Dedupe tools never delete or move notes, never read `.env`, back up outside the vault, restore on failure | Scripts | `knowledge-unify*.spec.ts` |
| Adapter memory, promotions, provenance, approvals and budget events expire at the tenant's days (max 28), are hidden from members once expired, and are erased and removed 7 days later; the expiry cannot be changed or extended | Stamp trigger, read policies and `purge_expired_client_adapter_records` | `adapter-retention-sql.spec.ts` (11 tests; three deliberate breakages each fail tests) |
| Adapter data is in the tenant backup with its original dates and comes back only while inside its active window; restored adapters are disabled; a usable approval never comes back; a restore whose notes and promotions do not match up is rolled back whole; the restore shortcuts work only for the service role inside a restore of that table and tenant | Export list, restore function, `client_adapter_restoring`, `validate_client_adapter_restore_graph` | `adapter-restore-sql.spec.ts` (7 tests; three deliberate breakages fail tests), `client-schema-upgrade.spec.ts` (real migration chain, 55 projections), `client-lifecycle-inventory.spec.ts` |
| Purge is tenant-scoped, batched, a dry run by default, and service-role only; it erases note text before removing rows and announces erased shared notes to adapters | Purge function | `adapter-retention-sql.spec.ts` |
| Every `client_*` table must be classified for retention | Verifier script | `verify-client-retention-inventory.mjs` |

---

## 2. Promised but not built or not verified

| Promise | Why it is not true yet |
|---|---|
| 28 days active, then 7 recovery days, then purge, for adapter data | Expiry, the member read barrier and the purge exist and are tested locally (see section 1). Offboarding export and restore also exist and are tested locally. Still missing: a schedule that runs the purge, owner confirmation of the approvals and budget-event schedule, and any hosted verification. Skeleton rows (text erased, hidden) can outlive 35 days briefly while a newer row still points at them |
| Deleted client data is gone everywhere | Veloce can only erase what it holds. Adapters' own stores (Creator OS vault, Forge's database, the `symlink` workspace) need deletion receipts, and none exist. Adapters with no erase ability must be labelled "outside the guarantee" and left out of the client edition |
| Budget caps hold in real use | The functions and tests exist (see section 1), but nothing calls them yet, the tenant cap is passed in by the caller, unknown costs are not shown separately, and concurrency was proven only on a throwaway local Postgres, not a hosted one |
| Shared memory cannot be poisoned | The layers exist in the database and library (section 1): mandatory scan, provenance, queue cap, written reason for flagged notes, withdrawal by a reviewer, safe rendering. They are a tripwire plus a second reader, not a guarantee: the scan cannot catch a well-phrased false fact, other languages, look-alike letters or paraphrased orders, and safe rendering lowers but does not remove the chance a model obeys a note. The routes and the review screen for reviewers now exist (`adapter-promotions-routes.spec.ts`, `adapter-promotions-view.spec.ts`, and a browser check against a throwaway real Postgres), nothing calls the safe rendering yet (no adapter reads shared memory), and revoking cannot reach copies an adapter keeps in its own store |
| Approver identity in adapters comes from the login | True in the host. Creator OS's own `approve()` still takes an email from the caller; that must be fixed when its approve route is built |
| Tenant isolation holds in the hosted database | Only proven in the in-memory test database. The staging isolation check has never run |
| Expired approvals and used tokens are cleaned up | The purge function for tokens exists; nothing schedules it. Approvals are marked expired only when someone touches them |
| Secrets are not in any repo | The `markexis` key, Forge's committed state files and the `symlink` GitHub token are unchecked and unrotated (your task) |
| Licence boundary is safe | Adapters run as separate programs, but no lawyer has reviewed the AGPL boundary |
| Client payments are safe | No payment path chosen. The proposed UPI gateway reads bank messages and is not suitable. A licensed provider and legal advice are needed |

---

## 3. What must be true before any client data is used

This is the master plan's stop-ship list, kept here so it is checked after every phase. Tick items in `04-open-items-tracker.md`.

1. Veloce's verifier says `releaseReady=true` on the exact build.
2. Hosted tenant isolation and 28 + 7 retention proven in a hosted environment.
3. Every adapter holding client data acknowledges deletion tombstones; others are excluded.
4. Approver identity comes from the verified login; two different people on every publish and every memory promotion.
5. One budget currency, atomic reserve and settle, fail closed.
6. No secret in any repo; the three known keys checked and rotated.
7. Licence boundary and payment route reviewed by a lawyer.
8. No payment path based on parsing bank messages.
9. Every new route has an unauthenticated test and a wrong-tenant test.
10. All new specs run in the project's standard test command.

Item 10 is true today for all specs listed in `02-code-tour.md`. Item 9 is partly true: the two approval routes have an unauthenticated test but no wrong-tenant route test (wrong-tenant is proven at the database level).

---

## 4. Rules for working safely

- **Never put real client data in tests.** Fixtures exist only inside test runs.
- **Never read or print keys or `.env` files.** Credentials are referred to by variable name only.
- **Do not apply the adapter SQL to a hosted project** until purge and restore wiring exists for the new tables.
- **Keep every adapter `disabled`** until its contract tests pass.
- **Treat all ingested content (web, video, Instagram) as untrusted.** It goes to quarantine and is reviewed before shared memory.
- **Prefer the official Instagram data export** over signed-in browsing of your account.
- **Run migrations before trusting them.** The first run of the host migration failed on a naming clash; only the test caught it.
- **Say what is not verified.** If something was not run, the report says so.
