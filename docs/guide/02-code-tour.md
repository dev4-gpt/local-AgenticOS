# Code tour: every file, what it does, what proves it

All paths are relative to the repo root (`source/`). "Proof" means the test file that fails if the behaviour breaks. Run everything related with:

```bash
npm run test:focused
```

Expected today: 741 pass, 3 fail, 5 skipped (the 4 concurrency tests are skipped unless a local Postgres container is configured). The 3 failures are in `tests/public-production-readiness.spec.ts` and already fail on the untouched base commit `592ce41` (register item N-3). They are not caused by this work.

## Branches

| Branch | Cut from | Holds |
|---|---|---|
| `feat/knowledge-unify` | `wip/backup-2026-10-03` | Duplicate-finder tools and fixes (commits `c8fb0e3`, `5240036`) |
| `feat/host-foundation` | `feat/knowledge-unify` | Contract types and tables (`46cb093`) |
| `feat/approval-gateway` | `feat/host-foundation` | Approval gateway (`ea0d98a`) and adapter tokens (`34a03c3`) |

All three are pushed to `origin` (`dev4-gpt/local-AgenticOS`). No pull request exists and `main` is untouched.

---

## A. The contract (TypeScript)

### `src/lib/adapterContracts.ts`
The shared vocabulary and checks. It has no secrets and calls nothing external, so any code (including browser code) can import it.

- **Constant lists:** operations, side-effect classes, deletion guarantees, adapter states, memory item statuses, promotion statuses, approval statuses, approval action kinds, budget event kinds. The test `the TypeScript contract and the SQL data model use the same values` makes sure these match the database.
- **Id rules:** adapter id `^[a-z][a-z0-9-]{2,40}$`; tenant slug follows the database rule (see open item N-1: Veloce has a second, different slug rule elsewhere); idempotency key and SHA-256 checks.
- **Money:** `microsFromUsd`, `usdFromMicros`, `assertMicros`. Whole numbers only, 1 USD = 1,000,000 micros.
- **Validators:** `validateAdapterManifest` (is this adapter description safe and consistent), `validateAdapterTaskRequest` (takes the risk class from the manifest, requires a hash-bound approval for `publish`), `validateMemoryProposal` (needs provenance and an honest hash), `validateTombstoneReceipt` (must name the event, carry a hash and a count).
- **State machines:** `MEMORY_ITEM_TRANSITIONS`, `PROMOTION_TRANSITIONS`, `APPROVAL_TRANSITIONS`, `canTransition`: states only move forward and finished states stay finished.
- **People rules:** `assertDistinctReviewer` (requester can never be reviewer, even if the name is written differently), `isApprovalUsable` (usable once, before expiry).

Proof: `tests/adapter-contracts.spec.ts` (13 tests).

---

## B. The database (SQL)

All SQL is in `product-experience/`. Each file is safe to run twice. Each is tested by running it inside PGlite (a real Postgres in memory). None may be applied to a hosted project yet.

### `supabase-client-adapter-host.sql`
Seven tables plus the rules around them.

| Table | Purpose | Key protections |
|---|---|---|
| `client_adapter_registry` | Which adapters a tenant has; state (`disabled` by default), side-effect ceiling, deletion guarantee, optional budget cap | Only owners/admins can register or change; members can read |
| `client_adapter_memory_items` | Private (`adapter:<id>`) and shared notes | Shared needs an approved promotion with the same hash; one active shared note per hash; content immutable; tombstone erases text and is permanent |
| `client_adapter_memory_promotions` | Requests to share a private note | Starts quarantined; reviewer differs from requester; approved hash must equal content hash; decided promotions never change |
| `client_adapter_memory_provenance` | History of what happened to notes | Append-only; cannot be truncated |
| `client_adapter_outbox` | Events waiting for delivery | Unique event ids; payload at most 16 KB; acknowledged only after delivery; admin-only reads |
| `client_adapter_approvals` | Stored approvals | Distinct approver; hash must match; only legal status moves; only one live request per exact action; expiry must be after creation |
| `client_adapter_budget_events` | Log of reserve/settle/release | Integer micros; idempotent per key; tied to a registered adapter |

Helpers: `client_adapter_admin(tenant)` (is the caller an owner/admin), `client_adapter_reject_mutation` (blocks edits/deletes on append-only tables; tenant removal still cascades), `client_adapter_reject_truncate`, and three guard triggers (`guard_memory_item`, `guard_promotion`, `guard_approval`).

Proof: `tests/adapter-host-sql.spec.ts` (8 tests).

### `supabase-client-adapter-approval-gateway.sql`
No new tables. Three functions.

| Function | Who may call | What it does |
|---|---|---|
| `client_adapter_request_approval` | Signed-in tenant member | Takes the exact canonical text that was hashed and refuses it unless it is a JSON object, hashes to the fingerprint and agrees with the row's kind, adapter, destination and policy (the text is stored, immutable, and shown to reviewers); checks adapter exists and is ready for that kind of action; clears expired duplicates; refuses if 50 open already; inserts a pending request; writes an `approval.requested` outbox event |
| `client_adapter_decide_approval` | Signed-in owner/admin who is **not** the requester | Locks the row; refuses wrong tenant (as "not found"), requester, non-pending; marks expired if late; approve needs the same hash; writes `approval.decided` |
| `client_adapter_execute_approval` | Host worker (publishable key + tenant worker token) | Marks `executed` with a receipt hash, only if approved, unexpired, tenant and hash match. Returns true once |

Proof: `tests/adapter-approval-gateway-sql.spec.ts` (8 tests).

### `supabase-client-adapter-token-uses.sql`
One table, `client_adapter_token_uses` (tenant, token id, adapter, expiry), and two functions:

- `client_adapter_consume_token`: worker-only; validates the worker token, an unexpired time within 6 minutes, and a registered adapter; inserts once; returns true only the first time.
- `client_adapter_purge_token_uses`: service-role only; removes up to a bounded number of rows expired more than a day ago. **No schedule runs it yet.**

Proof: `tests/adapter-token-uses-sql.spec.ts` (5 tests).

---

## C. The approval gateway (TypeScript and routes)

### `src/lib/adapterApprovalGateway.ts`
- `canonicalJson`: turns any plain data into one stable text form (keys sorted, no spaces). Rejects anything that cannot be hashed the same way twice (infinity, functions, dates, objects with odd prototypes, nesting deeper than 20).
- `approvalActionHash`: SHA-256 of that text plus kind, adapter, destination, policy version and a format version tag.
- `requestApproval`, `decideApproval`, `executeApproval`: validate input first (no database call on bad input), call the matching database function through an injected function, and return a clear result.
- `gatewayErrorFrom`: turns database error messages into stable codes (`not_allowed`, `hash_mismatch`, `requester_cannot_decide`, ...). Anything unrecognised becomes `unavailable`; nothing from the database is echoed.
- `GATEWAY_HTTP_STATUS`: the code-to-HTTP-status table.

### Routes
- `src/app/api/client-runtime/adapter-approvals/route.ts`
  - `GET`: lists up to 100 approvals for the tenant (selected columns only; no receipts).
  - `POST`: creates a request. Body is capped at 64 KB. Caller-supplied `requestedBy` or `actionHash` are ignored.
- `src/app/api/client-runtime/adapter-approvals/[id]/decision/route.ts`
  - `POST`: approve or reject. In this version of Next.js the route's `params` is a Promise, so the code awaits it. Body capped at 4 KB.
- Both: sign-in and membership required, `ADAPTER_HOST_ENABLED` must be `true`, rate limited, tenant read from the server setting `CLIENT_SLUG`, each outcome audited.

Proof: `tests/adapter-approval-gateway.spec.ts` (11 tests: hashing, input checks, error mapping, the routes' flag, auth, identity and size handling).

---

## D. Adapter tokens

### `src/lib/adapterTokens.ts`
- `mintAdapterToken`: signs claims with an Ed25519 private key. Refuses bad tenant, adapter, scope, or lifetime (1 to 300 seconds).
- `verifyAdapterToken`: signature first, then version, issuer, tenant, audience, operation, lifetime, not-yet-valid (30 s skew), expiry. Never throws on bad tokens (only on a wrong key type).
- `consumeAdapterToken`: records the token id through `client_adapter_consume_token`; true only on first use.
- Keys are passed in by the caller. The module reads no environment variable and no file.

Proof: `tests/adapter-tokens.spec.ts` (9 tests; keys are generated fresh inside each run).

---

## D2. Adapter budget

### `product-experience/supabase-client-adapter-budget.sql`
No new tables. Four functions: `client_adapter_worker_ok` (private token check), and the worker-only `client_adapter_budget_reserve`, `client_adapter_budget_settle`, `client_adapter_budget_release`. They write to the existing central ledger (`job_id` empty, adapter and task in `usage_metadata`) and to `client_adapter_budget_events`, under the same per-tenant lock as the existing budget code. Return values are short words such as `reserved`, `adapter_cap_exceeded`, `tenant_cap_exceeded`, `already_reserved`, `key_conflict`, `already_closed`, `over_reserved`, `refused`.

### `src/lib/adapterBudget.ts`
`reserveAdapterBudget`, `settleAdapterBudget`, `releaseAdapterBudget`. Check input first (whole micros, id and key rules, lengths), call the database function, and return `{ allowed, status }`. Anything that is not an exact known answer, including a network error, comes back as not allowed (`unavailable`).

Proof: `tests/adapter-budget-sql.spec.ts` (11 tests: caps, periods, retries, settle and release rules, fail-closed cases, grants), `tests/adapter-budget.spec.ts` (6 tests: the wrapper), and `tests/adapter-budget-concurrency.spec.ts` (4 tests: simultaneous requests through separate connections to a real Postgres; skipped unless `ADAPTER_BUDGET_TEST_DB_CONTAINER` names a running local Postgres container). Design record: `docs/architecture/adr-007-adapter-budget.md`.

---

## D3. Adapters page and Budget tab

- `product-experience/supabase-client-adapter-budget.sql` also holds `client_adapter_budget_summary(tenant)`: one row per registered adapter with its cap, spend for its cap period (this month when the adapter has no cap), spend this month and open reservations. Active members of that tenant get rows; anyone else gets none; the anonymous role is refused.
- `src/lib/adapterOverview.ts`: `parseSummaryRows` (rejects any row that does not look right), `buildAdapterCards` (plain labels, cap status: ok, warning at 80%, exhausted at 100%), `buildBudgetBreakdown` (adapters plus "other spending" equal the workspace total, and flags a disagreement), `formatMicrosUsd` (a small spend is never shown as free).
- `src/app/api/client-runtime/adapters/route.ts`: read-only `GET`. Needs sign-in and `ADAPTER_HOST_ENABLED=true`, is rate limited, reads the tenant from `CLIENT_SLUG`, and returns validated cards or an error, never raw rows. Not in the client edition's allowed API list.
- `src/app/adapters/page.tsx` and `src/components/AdaptersView.tsx`: the `/adapters` screen with loading, switched-off, signed-out, unavailable and empty states.
- `src/components/AdapterBudgetTab.tsx` and an edit to `src/components/HomeImmersive.tsx`: the Overview / Budget tab switch on the main page (operator edition only) and the Budget tab itself.

Proof: `tests/adapter-overview.spec.ts` (9 tests: view model, route gates, malformed answers) and the summary test in `tests/adapter-budget-sql.spec.ts`. Both screens were also opened in a browser at desktop and phone width with made-up sample data, which checks layout and wording but not real numbers.

---

## D4. Approvals screen

- `src/lib/adapterApprovalsView.ts`: `parseApprovalsResponse` (rejects any answer that does not look right), `buildApprovalCards` (plain status words, "you" or "another member", time left, the content the request covers, which buttons are allowed and why not), `readContent` (the stored text must be a JSON object whose kind, adapter, destination and policy agree with its row), `decisionErrorMessage` (plain messages; unknown errors become a generic one).
- `src/components/ApprovalsView.tsx` and `src/app/adapters/approvals/page.tsx`: the `/adapters/approvals` screen (operator edition, behind `ADAPTER_HOST_ENABLED`), linked from the Adapters page. It lists requests, shows the full content each covers, asks for a confirmation that repeats the fingerprint before approving, and refreshes after every decision. The list route (`/api/client-runtime/adapter-approvals`) also returns the viewer's id and whether they may decide.
- Proof: `tests/adapter-approvals-view.spec.ts` (8 tests) and a browser check against a throwaway real Postgres.

---

## D5. Promotion hardening (ADR-009)

- `src/lib/adapterMemoryGuard.ts`: `scanMemoryContent(text, { sourceUrl })` returns a verdict (clean, flagged, blocked) with findings and the content hash, stored as the promotion's `scan_result`; `verdictSummary` gives plain words; `renderSharedFactForModel` and `renderSharedFacts` show active, reviewed shared notes to a model as quoted data (escaped, hidden characters removed, shortened) and return nothing for any other note.
- `product-experience/supabase-client-adapter-host.sql` (promotion guard): an insert needs a scan of exactly this content, a provenance record for the source note, and room under 25 waiting per adapter; approval is refused for a blocked scan, a missing scan, or a flagged one without a 20-character note; the scan result cannot change. Refusals carry codes such as `adapter_promotion_blocked`.
- `product-experience/supabase-client-adapter-promotions.sql`: `client_adapter_decide_promotion` (owner or admin who is not the requester; repeats the content hash; same answer for unknown ids and other tenants) and `client_adapter_revoke_shared_memory` (owner or admin; text erased; a `memory.tombstoned` event tells adapters to drop it).
- Routes (all need sign-in and `ADAPTER_HOST_ENABLED=true`, are rate limited, take the tenant from the server's setting, and refuse in the same way the database does): `adapter-promotions/route.ts` lists promotions with the private source note (owners and admins only; everyone else gets null), provenance, whether the same fact is already shared, and the shared notes; `adapter-promotions/[id]/decision/route.ts` approves or rejects (approve repeats the content hash; the reviewer is always the signed-in person); `adapter-memory/[id]/revoke/route.ts` withdraws a shared note with a reason of 5 to 500 characters. `src/lib/adapterRouteGate.ts` holds the shared checks; `promotionErrorFrom` in `adapterMemoryGuard.ts` turns the database's coded refusals into stable names and statuses and never echoes anything unknown.
- Screen: `src/lib/adapterPromotionsView.ts` (validates the list answer; builds one card per promotion with the note, scan verdict and findings in plain words, provenance lines, who may approve or reject and why not; makes invisible characters visible; shared-note cards for withdrawing), `src/components/PromotionsView.tsx` and `src/app/adapters/promotions/page.tsx` (`/adapters/promotions`, operator edition, behind the host flag, linked from the Adapters page). The view model deliberately does not import the scanner, which uses a server-only module.
- Proof: `tests/adapter-memory-guard.spec.ts` (14), `tests/adapter-promotions-sql.spec.ts` (10), `tests/adapter-promotions-routes.spec.ts` (10), `tests/adapter-promotions-view.spec.ts` (10), plus the existing host, restore and retention specs updated for the new promotion rules.

---

## E. Knowledge-unify tools

In `scripts/knowledge-unify/`: `scan.mjs` (340 lines), `dedupe-report.mjs` (193), `apply.mjs` (264). Format reference: `docs/knowledge-layer-schema.md` (schema version 2). How they behave is in `01-how-it-works.md`, section 6.

Safety features worth knowing: reports and backups must be outside every vault (including through symlinks); only `.md` files are opened; `.env` files are never read; URLs in reports lose credentials and sensitive query parameters; old-format files are rejected; a note changed since the scan is skipped; an iCloud placeholder blocks `--apply`.

Proof: `tests/knowledge-unify.spec.ts` (23 tests, named after the review findings CR-1 to CR-13) and `tests/knowledge-unify-cli.spec.ts` (8 tests, run the real command line).

---

## F. Retention registration

- `docs/retention-table-map-2026-10-15.json`: lists every `client_*` table and its class.
- `docs/retention-data-class-inventory-2026-10-15.md`: the human-readable version, including what is provisional.
- `scripts/verify-client-retention-inventory.mjs`: fails if a table is unclassified. Currently reports `allDeclaredTablesClassified: true` and `hostedEnforcementVerified: false`.
- `product-experience/supabase-client-adapter-retention-28.sql` (ADR-008): adds `retention_expires_at` to the five content tables; a stamp trigger sets it from the tenant's days and makes it immutable; member read policies hide expired rows; `purge_expired_client_adapter_records(tenant, apply, batch)` erases note text, announces erased shared notes through the outbox, then removes rows child-first 7 days after expiry, plus old outbox and token-use rows. One guard in `supabase-client-adapter-host.sql` also lets the purge clear a decided promotion's free-text note. Proof: `tests/adapter-retention-sql.spec.ts` (11 tests).
- Export and restore: `scripts/client-lifecycle.mjs` now exports `client_adapter_registry`, `_memory_items`, `_memory_promotions`, `_memory_provenance`, `_approvals` and `_budget_events` (not the outbox or token rows), and `scripts/lib/client-lifecycle-restore.mjs` converts a restored adapter to disabled and a usable approval to expired. `supabase-client-lifecycle-restore.sql` adds the tables to its column map and order, skips the approval's short request expiry in the active-window check, refuses a usable approval, forces adapters disabled, defers the note-to-promotion foreign key, and finally calls `validate_client_adapter_restore_graph` (rolls everything back if it fails). In `supabase-client-adapter-host.sql`, `client_adapter_restoring(table, tenant)` lets the three guards step aside only for the service role inside a restore of that table and tenant. Proof: `tests/adapter-restore-sql.spec.ts` (7 tests), `tests/client-schema-upgrade.spec.ts` (adapter migrations added to the real chain; 55 projections) and `tests/client-lifecycle-transaction.spec.ts` (55 projections).
- `scripts/client-lifecycle.mjs retention` runs that purge when given `--include-adapter-host` (apply also needs `--confirm-retention-adapter`). Proof: a text test in `tests/client-lifecycle-inventory.spec.ts`.

---

## G. Design records

- `docs/architecture/adr-005-adapter-host-contract.md`: why the host/adapter split, the contract, two-layer memory.
- `docs/architecture/adr-006-approval-gateway.md`: why approvals work this way, what is not done yet, how to roll back (leave `ADAPTER_HOST_ENABLED` unset).

---

## H. Test map at a glance

| Spec | Tests | Proves |
|---|---|---|
| `adapter-contracts.spec.ts` | 13 | Contract rules and TypeScript/SQL agreement |
| `adapter-host-sql.spec.ts` | 8 | Table rules, roles, tenant isolation, append-only |
| `adapter-approval-gateway-sql.spec.ts` | 11 | Two-person, hash-bound, expiring, single-use approvals |
| `adapter-approval-gateway.spec.ts` | 13 | Server hashing, input checks, route behaviour |
| `adapter-tokens.spec.ts` | 9 | Token signing and every verification rule |
| `adapter-token-uses-sql.spec.ts` | 5 | Single use, worker-only, bounded purge |
| `adapter-promotions-view.spec.ts` | 10 | Review screen: what each promotion shows, who gets which buttons, hidden characters, bad data rejected |
| `adapter-promotions-routes.spec.ts` | 10 | Promotion list, decision and withdrawal routes: gates, joins, input checks, stable refusals, audits |
| `adapter-memory-guard.spec.ts` | 14 | Scanner (attacks, evasions, secrets, flags, speed, known limits) and safe rendering |
| `adapter-promotions-sql.spec.ts` | 10 | Promotion rules (scan, provenance, queue, blocked, flagged note, immutability), decision and withdrawal functions |
| `adapter-approvals-view.spec.ts` | 8 | Approvals screen: what each request shows, who gets which buttons, bad data rejected |
| `adapter-restore-sql.spec.ts` | 7 | Backup and restore of adapter data: dates, disabled adapters, usable approvals, graph check, closed shortcuts |
| `adapter-retention-sql.spec.ts` | 11 | Adapter expiry, read barrier, 7-day recovery, purge ordering, tenant scope, grants |
| `adapter-overview.spec.ts` | 9 | Adapters page and Budget tab data, and the read-only route's gates |
| `adapter-budget-sql.spec.ts` | 12 | Budget caps, periods, idempotency, settle and release, fail closed |
| `adapter-budget.spec.ts` | 6 | Budget wrapper input checks and fail-closed behaviour |
| `adapter-budget-concurrency.spec.ts` | 4 | Simultaneous requests on a real Postgres (skipped unless configured) |
| `knowledge-unify.spec.ts` | 23 | Scan, dedupe and apply behaviour and fixes |
| `knowledge-unify-cli.spec.ts` | 8 | Command-line behaviour and exit codes |

All nineteen are registered in the `test:focused` list in `package.json`.

## What is not in the code yet

No real adapter calls any of this. No page in the app shows adapters or budget. No code reserves or settles budget. No job runs expiry or purges. See `04-open-items-tracker.md`.
