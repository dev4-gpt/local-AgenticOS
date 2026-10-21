# Open items tracker

Master plan phases (from `reports/Veloce master plan and error register.md`). Tick a box only when its "done when" check has actually been run. Update this file in the same commit as the work.

Legend: **Owner** = Me (the assistant) / You / Both / Lawyer. **Sev** = CRITICAL / WARNING / SUGGESTION. IDs refer to the error register.

Last updated: 2026-10-20 after promotion hardening (Phase 1 item 10) on `feat/approval-gateway`.

---

## Phase status

| Phase | Name | Status |
|---|---|---|
| 0 | Hygiene | Mine done; yours open |
| 1 | Host foundation | Items 1-8, 10-16 done; 6 (6a and 6b) and 9c done; 9b built (deploy and a seen scheduled run are yours) |
| 2 | Creator OS adapter | Slice 1 done locally in the ContractorOS repo (not pushed); slice 2 open |
| 3 | Knowledge adapter | Not started (dedupe tools exist) |
| 4 | Forge adapter | Not started |
| 5 | SymVibe + REA | Not started |
| 6 | Flagged extras | Not started |
| 7 | Client readiness | Not started; hard gate |

---

## Phase 0: Hygiene

### Done
- [x] CR-1 to CR-13 fixed in the dedupe tools, with tests (`5240036`), plus a symlink bypass found by the new tests
- [x] Dedupe spec and adapter specs registered in `test:focused`
- [x] Branches pushed to `origin` (no PR, `main` untouched)
- [x] Knowledge library copied into the vault; group 1 duplicate markers applied to 4 notes with a backup outside the vault

### Open (yours)
- [ ] **You:** make the ContractorOS repo private (it is AGPL and currently public). *Done when:* the repo shows as private on GitHub
- [ ] **You:** rotate the `markexis` key (S-1). *Done when:* the old key no longer works; do not paste it in chat
- [ ] **You:** check Forge's committed `.projects` state files for secrets and remove them (X-8, S-1). *Done when:* nothing sensitive remains and anything found is rotated
- [ ] **You:** check the `symlink` `GITHUB_TOKEN` was never deployed; rotate if it was (S-1)
- [ ] **You:** confirm which vault Veloce actually reads, without opening secrets (X-11, WARNING). *Done when:* `vaultRoot` value is confirmed
- [ ] **You:** confirm the six pillar names, or choose one principal to start (X-15)
- [ ] **You:** decide what "the knowledge bases" means: the three vaults, the hosted memory, or both
- [ ] **You:** decide whether client notes may live in an iCloud-synced vault (S-5, X-12)
- [ ] **You + Lawyer:** review the AGPL separation (X-10, WARNING). `docs/architecture/adr-010-agpl-candidate-adapter-separation.md` writes up the separate-process pattern and the ten candidates for the lawyer to review (ContractorOS, `seo-os`, inkos, trypost, brightbean-studio, plunk, OpenMontage, MiroFish, FreshRSS, stackrender, locally-uncensored, firecrawl); the pattern is documentation only, nothing calls any of them, and every candidate stays blocked until sign-off
- [ ] **You + Lawyer:** payment route: choose a licensed provider; do not use the bank-message-reading gateway (PAY-1 to PAY-4, CRITICAL)
- [ ] **You:** decide the base branch for the work (X-18). Currently cut from `wip/backup-2026-10-03`, not `main`
- [ ] **You:** retire the duplicate staging copy of the Keepy library when ready (X-14)
- [ ] **You (Codex task):** Instagram export through the official data download (S-4)
- [x] Vendor telemetry gate built (ADR-013): PostHog, Sentry and Datadog receive only ten pinned fields, hashed tenant, and fixed known values (`other` otherwise); `tests/client-vendor-egress.spec.ts` captures the real outgoing requests and proves no client text leaves. All vendors are off by default
- [ ] **You:** if you want Sentry or Datadog, create the accounts (student pack), put `SENTRY_DSN` / `DATADOG_API_KEY` in Secret Manager (never in chat or the repo), set each vendor's shortest retention, then turn on `CLIENT_DATADOG_CAPTURE_ENABLED=1`. Add `tests/client-vendor-egress.spec.ts` to the `test:focused` list in `package.json` when you approve touching that file (not done: it was outside the approved four files)
- [ ] **You (optional, dev only):** Docker Sandboxes $250 credit (offer ends 2026-10-31, credit expires 6 months after claiming, card required, model API usage billed separately). Use: our own agent dev work and long test runs in isolated cloud microVMs. Rules: never client data, never real keys or `.env` files in a sandbox (throwaway test values only), clone one branch, no push rights beyond a scratch branch. Not a runtime for clients: client work stays in the client's own Google Cloud and Supabase (28+7)
- [ ] **Watch:** two CI checks on PR 23 (`verify`, `product-experience`) fail `npm audit` on one finding, `braces` <=3.0.3 (GHSA-vfj7-8cjw-p6xm, stack-exhaustion DoS on deeply nested patterns). It reaches us only through build tooling (`micromatch` > `fast-glob` > `shadcn`, and `eslint-config-next`), not the shipped app, and no patched release exists (3.0.3 is the latest). Decision (2026-10-20, owner): leave the gates failing, no exception, do not merge PR 23 until a patched release lands or the owner decides otherwise. *Done when:* `npm audit --audit-level=high` passes in the root and `product-experience` after a `braces` release above 3.0.3. `main` already failed the same gates on 2026-10-03

---

## Phase 1: Host foundation

### Done
- [x] 1. Contract types and checks (`46cb093`)
- [x] 2. Seven adapter tables, guards, retention classes, ADR-005 (`46cb093`)
- [x] 3a. Durable two-person approval gateway and routes (`ea0d98a`)
- [x] 3b. Ed25519 adapter tokens with single-use table (`34a03c3`)

### Open
- [x] **4. Budget enforcement (Me), done in the budget commit on `feat/approval-gateway`.** Reserve, settle and release functions on the central ledger; per-adapter caps by day, month or total; whole-number micros; one idempotency key per charge; fail closed (X-5, N-4). Proven by `adapter-budget-sql.spec.ts`, `adapter-budget.spec.ts` and a real-Postgres concurrency test (20 simultaneous requests against a cap that fits 3 reserved exactly 3). See `docs/architecture/adr-007-adapter-budget.md`
  - [ ] 4a. Run the concurrency test in the project's own checks and against a hosted or free-staging database (it was run once against a throwaway local Postgres 17 container; it is skipped unless `ADAPTER_BUDGET_TEST_DB_CONTAINER` is set)
  - [ ] 4b. Read the tenant monthly cap from one place (today the caller passes it, as the existing worker functions do)
  - [ ] 4c. Show unknown costs separately (a provider that does not report a cost)
  - [ ] 4d. Nothing calls the budget functions yet; the first real adapter must reserve before it runs a task
  - [ ] 4e. Add an index on the adapter tag if the ledger grows (the adapter total is a scan by tenant and period today)
- [x] **5. Adapters page and Budget tab (Me), done in the Adapters page commit on `feat/approval-gateway`.** The bundled Next.js docs were read first (X-17). `/adapters` lists each adapter with state, what it may do, a deletion-guarantee label and spend against its cap; the main page has an Overview / Budget tab switch (operator edition only) showing spend per adapter plus an "other spending" line that adds up to the workspace total. Both need sign-in and `ADAPTER_HOST_ENABLED=true`, and read through one read-only database function (`client_adapter_budget_summary`). Proven by `adapter-overview.spec.ts` and a new summary test in `adapter-budget-sql.spec.ts`; both screens were opened in a browser at desktop and phone width
  - [x] 5a. Checked both screens against a throwaway local Postgres 17 with real ledger rows made by the real reserve, settle and release functions (2026-10-19). Every figure matched a hand calculation, the Budget tab total ($7.90) equalled the existing workspace meter, a new reservation appeared on refresh, and with the backend stopped the Budget tab showed "unavailable" and no numbers. Container and test helper removed afterwards. **Limits:** a small stand-in replaced Supabase's REST and login layers (it ran the real SQL functions); the rate limiter was faked; stand-in tables replaced the real control-plane migrations, so the real row-level security on the ledger was not exercised
  - [ ] 5a2. Repeat on free staging Supabase with the real migrations, real row-level security and the real login layer
  - [x] 5f. Fixed: `client_adapter_budget_summary` now reports `spent_period_micros` as this month's spend for an adapter with no cap (no period); it used to report all-time spend. A test with a charge from last month fails on the old behaviour and passes on the new
  - [ ] 5g. When the login service is unreachable the app treats the user as signed out, so the Adapters page says "Sign in" instead of "unavailable". That is existing app behaviour (`currentClientUser` swallows errors), not specific to these screens
  - [ ] 5b. Decide whether the client edition gets these screens. Today they are not in the client edition's allowed routes, on purpose, until Phase 7
  - [ ] 5c. Add a link to Adapters from the main navigation (today it sits in the Budget tab; the home quick-link bar is a fixed six-item layout)
  - [ ] 5d. Next.js 16 renamed `middleware` to `proxy`; `src/middleware.ts` still works but the dev server prints a deprecation warning. Migrate with the codemod when convenient
  - [ ] 5e. Existing lint error in `HomeImmersive.tsx` (`setWebglFailed` called inside an effect) and an unused import, both there before this work
- [x] **6. Observability (Me), done locally.** Audit events and counters for approvals, tokens, promotions, budget. *Done when:* each event is visible and tested. Split: 6a (approvals, memory, budget) and 6b (promotions, token use) are both done
  - [x] 6a. Approvals, shared memory and budget: `client_adapter_execute_approval` now writes an `approval.executed` outbox event (the only approval step that wrote none); new read-only `client_adapter_activity_counts(tenant)` counts outbox and budget events for the last 28 days per adapter and kind (members of that tenant only, counts never payloads); new `GET /api/client-runtime/adapter-activity`, `src/lib/adapterActivity.ts` and a "Recent activity" panel on the Adapters page. 6 SQL tests plus 4 route/lib tests; five mutations (drop the event, drop the membership check, widen the window, trust a query-string tenant, accept unknown event types) each fail a test. Panel not yet checked in a browser against a database
  - [x] 6b. Promotion decisions and token use are now counted and shown (done locally; decided 2026-10-20 that they are wanted). A promotion decision writes a `promotion.decided` outbox event (id and status only, never the reviewer's note). Each first use of an adapter token adds one to a daily counter, `client_adapter_token_use_counts` (tenant, adapter, UTC day, number: no token id, no person; classified as ephemeral security state; purged after 35 days by `client_adapter_purge_token_counts`, which the retention command now also calls). Both appear in the "Recent activity" panel. The outbox's allowed event types are now one identical list in three SQL files with a test that fails if they differ. 9 new SQL tests and 1 library test; 8 mutations each fail a test
- [x] **7. Scoped handles (Me), done locally on `feat/approval-gateway`.** Narrow references so an adapter can read only what a task needs. The adapter token can now carry `handles`: up to 20 memory item ids, signed with the token (`src/lib/adapterTokens.ts`; a request for any id outside the list is refused as `handle_not_allowed`, and a token with no handles can read no item). The database side is `client_adapter_read_scoped(tenant, worker token, adapter, item ids)` in `supabase-client-adapter-token-uses.sql`: worker-token path only, adapter must be in preview or enabled, 1 to 20 ids, and it returns only active items in that tenant that are shared or in the adapter's own namespace. Other adapters' private memory, other tenants, tombstoned, superseded and unknown ids all give the same answer, no rows. 3 SQL tests and 4 token tests; nine mutations (each rule removed) each fail a test. Not built: the HTTP route that serves `context.read`, which waits for a deployed adapter; reads are not counted as events (the token-use row already records that a read happened)
- [x] **8. Purge and restore wiring for the new tables (Me), done locally in two commits on `feat/approval-gateway`.** Active expiry at 28 days, recovery for 7, bounded purge, export and restore. The 28 + 7 gate is met in the local and in-memory test databases only; the hosted proof is still open (8f)
  - [x] 8a. Expiry, read barrier and purge (commit A, `supabase-client-adapter-retention-28.sql`, ADR-008): 11 tests; lifecycle command runs the purge with `--include-adapter-host` (and `--confirm-retention-adapter` to apply)
  - [x] 8b. Offboarding export and restore (commit B): the six adapter tables are exported with their dates and restored only inside their active window; adapters come back disabled; usable approvals never come back; the restore rolls back as a whole if the notes and promotions do not match up. 7 restore tests, three deliberate breakages each fail tests; also checked against the real migration chain in `client-schema-upgrade.spec.ts` (55 restore projections)
  - [ ] 8f. Prove 8a and 8b on free staging Supabase with the real migrations, real row-level security and a real backup and restore (nothing here has run outside in-memory Postgres)
    - [~] 2026-10-21: on `veloce-agentos-staging` the retention migrations are live, new notes get 28 days, the purge dry run and the restore-graph check pass (see 5a2). **Still open:** a real apply purge after the clock runs out, and a real export then restore with `client-lifecycle.mjs`
  - [ ] 8g. The restore bypass trusts whoever can run SQL as the service role (as the other tables' restore guard does). Decide whether that is acceptable
  - [ ] 8h. The adapter migrations were added to the real migration chain test; the hosted deployment order must put them before the lifecycle restore migration
  - [ ] 8c. Make the adapter purge default in the lifecycle command once the adapter host is installed anywhere hosted (it is opt-in today so installations without it keep working)
  - [ ] 8d. Skeleton rows: a private note and its promotion keep an empty shell (text erased, hidden) until the newer shared note is purged. Decide whether a shell may outlive 35 days or the chain should be cut sooner
  - [ ] 8e. While a shared note is expired but unpurged, the same fact cannot be shared again (hash slot held for up to 7 days)
- [ ] **9. Scheduled jobs (Me).** Run token purge and approval expiry on a schedule. *Done when:* a scheduled run is observed
  - [x] 9a. The jobs exist and run from the retention command (done locally on `feat/approval-gateway`): `client_adapter_expire_approvals` (service role only, bounded) is new, and `client-lifecycle.mjs --mode retention --include-adapter-host` now also calls it and `client_adapter_purge_token_uses` on a real run (reported as not run on a dry run). Tests in `adapter-approval-gateway-sql.spec.ts`; four deliberate breakages fail them
  - [x] 9c. Safe to run from two places at once (done locally; QM-6c): `supabase-client-adapter-background-owner.sql` records exactly one deployment id as the background owner (service role only, compare-and-set so a stale writer loses), and `client-lifecycle.mjs --mode retention --deployment-id <id>` stops before purging anything unless that id is the owner (an unanswered check stops the run too; a manual run without the flag is unchanged). 8 tests including the real script against a stub; 12 of 13 mutations each fail a test (the 13th is a harmless duplicate). This does not pick a scheduler, so 9b is still your decision, but whichever you pick can now run in two deployments without double-running
  - [~] 9b. Scheduler decided 2026-10-20 on your behalf: **Cloud Scheduler plus a Cloud Run job** (clients are on GCP and the service key stays in Secret Manager). Built: `scripts/run-scheduled-retention.mjs` (runs the retention command for one client with all 19 confirmation flags, a dry run unless `RETENTION_APPLY=true`, names its deployment so only the background owner purges), `infra/retention-job/` (Dockerfile, `job.yaml` with the two secrets as Secret Manager references, a runbook), and `tests/retention-job.spec.ts` (6 tests incl. the image's own COPY set run against a stub; 11 mutations each fail a test). **Open, and only you can do it:** deploy it for a client, run it once as a dry run, switch `RETENTION_APPLY` to `"true"`, and see a scheduled run in the logs. Reverse the scheduler choice without touching the job: only what starts it changes
- [x] **10. Promotion hardening (Me), done locally in three commits on `feat/approval-gateway`; the limits in 10d-10g and 10h-10j stay open.** Source-linked review, no tool instructions inside shared facts, retrieval-time distrust, rollback (X-4, CRITICAL). It is a tripwire plus a second reader, not a guarantee
  - [x] 10a. Rules and scanner (commit A, ADR-009): mandatory scan tied to the content hash, provenance required, queue cap of 25, blocked cannot be approved, flagged needs a 20-character reason, scan immutable; `client_adapter_decide_promotion` and `client_adapter_revoke_shared_memory`; scanner and safe rendering in `adapterMemoryGuard.ts`. 24 new tests; the scanner's own test found and fixed an evasion (a phrase split across lines)
  - [x] 10b. Routes for listing, deciding and withdrawing (commit B): `GET /api/client-runtime/adapter-promotions` (promotions joined with the source note, provenance and "already shared", plus the shared notes), `POST .../adapter-promotions/[id]/decision`, `POST /api/client-runtime/adapter-memory/[id]/revoke`; sign-in, host flag, rate limit, server-set tenant, audit events, stable error names. 10 tests; six deliberate breakages each fail a different test. Not in the client edition's allowed routes
  - [x] 10c. The review screen (`/adapters/promotions`, operator edition, behind the host flag; commit C): each waiting note with the note itself (invisible characters made visible as [U+200B]), the scan verdict and what it found, where it came from, and whether the same fact is already shared; Approve (with a confirm step that repeats the fingerprint) only when the scan covers exactly this note and did not block it and the reviewer can read it; a written reason box (required, 20 characters, for flagged notes); Reject; and a Shared notes list with Withdraw (reason of at least 5 characters). 10 view-model tests (six deliberate breakages each fail a test). Checked in a browser against a throwaway real Postgres with the real scanner's results and real row-level security: blocked, hidden-character, duplicate and own requests could not be approved; the flagged note stayed locked until a proper reason was typed; approve, reject and withdraw worked and were audited; a plain member saw only their own requests, never the note text, and the API answered "not found" to their decisions; no overflow at phone width
  - [ ] 10h. Repeat the screen check on free staging Supabase with the real login layer and migrations (the throwaway check used a small stand-in for Supabase's REST layer and a faked rate limiter)
  - [ ] 10i. With the login service unreachable the screen says "Sign in" rather than "unavailable" (same existing behaviour as 5g)
  - [ ] 10j. Nothing creates promotions yet except a direct database insert by the host: the adapter-facing `memory.propose` route (Phase 2) must run the scanner and write provenance first
  - [ ] 10d. The scan cannot catch paraphrased or foreign-language orders, look-alike letters, or a well-phrased false fact. Decide whether to add a model-based second opinion (it would add cost and its own injection risk)
  - [ ] 10e. Nothing calls the safe rendering yet: implement `context.read` for the first adapter so shared notes reach models only through it
  - [ ] 10f. Detect conflicting facts (a new shared note that contradicts an existing one) and send them to a human; today only exact duplicates are caught
  - [ ] 10g. Rate-limit by time as well as by queue size
- [x] **11. Approvals table retention class (Both), decided 2026-10-20 on your behalf.** Approvals follow the same 28 + 7 day rule as all tenant data, which is what the code already did; the "provisional" labels are removed for approvals (ADR-005, 006, 008, the retention map, the guide). The audit trail of who approved what lives on as `approval.*` outbox events on the same schedule. Reverse it by changing the class and the schedule together. Budget events are still provisional (N-5)
- [x] **12. Align tenant slug rules (Me), done locally on `feat/approval-gateway`.** `capabilityContracts.ts` (shared by 6 modules), `v96Contracts.ts` and `clientVisualQaAdapter.ts` now use the database rule `^[a-z][a-z0-9-]{2,40}$`; a test in `adapter-contracts.spec.ts` reads the rule from the database file and checks every validator against it (loosening any one of the three fails it). Slugs with a leading digit, 2 characters, or 42 to 63 characters are now refused up front instead of at the database. Provider, repository and content ids keep their own looser rule on purpose (N-1, X-7)
- [x] **13. Key storage and rotation for adapter tokens (Both), decided 2026-10-20 on your behalf (ADR-012).** The private key lives in Google Secret Manager (one secret per client environment), never in a file, repo, CI or chat; adapters hold public keys only. Rotation is an overlap: a verifier now accepts 1 to 3 public keys (`adapterTokens.ts`, the QM shim, and the ContractorOS clone's commit `b2a6a20`), with a runbook for routine (90 days) and emergency rotation. 4 new tests. **Not done:** no code reads the secret yet because nothing sends adapter tokens until the first real adapter route exists (it will load the key through an injected loader and fail closed), and the runbook has not been rehearsed on staging
- [x] **14. Wrong-tenant route tests (Me), done locally on `feat/approval-gateway`.** `tests/adapter-wrong-tenant-routes.spec.ts` (4 tests) covers all six adapter-host route files (seven handlers): a request that names another tenant in the body, address, query string or path is still answered for the server's own tenant; another tenant's id looks exactly like a missing one; database errors that name a tenant or row are never echoed. Three deliberate breakages (tenant read from the address, tenant read from the body, error echoed) each fail the spec. Stop-ship item 9 is now met for routes; the database-level wrong-tenant proof is in the SQL specs and the real-stack run below
  - [x] 14a. Real local Supabase run (2026-10-19, outside the repo, then deleted): real logins, real PostgREST, the full 80-migration chain, 66 checks over isolation, registry, approvals, promotions, budget and retention, all passed. It found that `client_adapter_admin` and five trigger functions were executable by `anon` through Supabase's default privileges; revoked in `0f71173` with a test. Not run in that session: the lifecycle export/restore script and the screens against the real stack. This does not replace the hosted staging check (4a, 5a2, 8f, 10h, 15e)
- [x] **15. Approvals page flow (Me), done locally in two commits on `feat/approval-gateway`.** A way for two people to see and decide pending approvals: the request stores and verifies the exact text, and the screen shows it
  - [x] 15a. Store and verify what is being approved (approvals-screen commit A): the request now stores the exact canonical text that was hashed; the database refuses text that does not hash to the fingerprint or disagrees with the row; the text is immutable, in the backup and restore projection, and returned by the list route with the viewer's id and whether they may decide. Three deliberate breakages each fail tests
  - [x] 15b. The approvals screen (`/adapters/approvals`, operator edition, behind the host flag): lists requests with the exact content each covers, who asked ("you" or "another member"), time left and status; Approve (with a confirm step that repeats the fingerprint) and Reject appear only for an owner or admin who did not ask, only while the request is open, and Approve only when the stored text is present and agrees with its row. 8 view-model tests (three deliberate breakages fail tests). Checked in a browser against a throwaway local Postgres with real row-level security and the real database functions: approving worked and was recorded with an audit event; deciding your own request, a wrong fingerprint, a second decision and a plain member's attempt were all refused by the database; a member saw only their own requests and no buttons; with the backend stopped no request was shown
  - [ ] 15e. Repeat the screen check on free staging Supabase with the real login layer and the real migrations (the throwaway check used a small stand-in for Supabase's REST layer and a faked rate limiter)
  - [ ] 15f. With the login service unreachable the screen says "Sign in" rather than "unavailable" (same existing behaviour as 5g)
  - [ ] 15g. Approving only marks the request approved. Something has to execute it: no adapter calls the worker's execute step yet
  - [ ] 15c. No notification tells a second person a request is waiting; they must open the page
  - [ ] 15d. Requests are created by host code; there is no form to create one from the UI
- [x] **16. Mutation check on Phase 1 tests (Me), done locally on `feat/approval-gateway`.** `npm run verify:phase1-mutations` (`scripts/phase1-mutation-sweep.mjs`) removes one rule at a time from the six adapter SQL files and seven libraries (180 mutations) and requires an owning spec to fail; it restores every file, also on a crash, and refuses to run on uncommitted target files. First run: 144 caught, 36 survived. Of those, 28 were real missing tests (including the restore-context role check, the 28-day retention cap, memory and promotion immutability, 6 settle/release refusals, the `null` hash rule, a string token scope) and now have tests; 8 are recorded as explained duplicates with a reason each (`EQUIVALENT` in the script, guarded by a spec so a stale entry fails). Second run: 172 caught, 8 explained, 0 survived, files restored. After items 6b, 9c, 11, 13, QM-6a/6b the sweep grew to 237 mutations (it now also covers the review screen's view model, the promotion decision route and the command policy): 222 caught, 8 explained, 7 survived on first run (six response-parsing limits in the review view model, one harmless duplicate in the policy library); the six now have tests, the duplicate is explained, and a re-run of those two files is clean. The sweep takes about 35 minutes and is not part of `test:focused`; re-run it after changing any rule
  - [ ] 16a. Pre-existing lint findings in `tests/adapter-retention-sql.spec.ts` (two `any` types, one unused `asAnon`), not from this work

---

## QM harness adapter (ADR-011, outside the numbered phases)

QM (`yc-software/qm`, MIT) as a multi-agent harness behind the host's `h1` contract, run as a separate service. Analysis and spike: 2026-10-20. The adapter is built `disabled` and stays out of the client edition until metering and retention exist.

- [x] Shim `services/qm-adapter/` (manifest, health, `task.run/get/cancel`) with host-token checks, single-use token ids, tenant from configuration, bounded input, safe retries, no QM text in errors. 16 tests; 17 mutations each fail a test; run once against a real local QM (mock harness): health, run, read-back and cancel all worked
- [ ] QM-1. Staging spike with a real model key: confirm how QM reports an aborted run (the mapping is a guess), the Docker sandbox, Postgres mode, and that the reply carries no prompt or environment text
- [ ] QM-2. Metering gateway: QM's model calls reserve and settle against the host budget (nothing enforces `budgetMaxMicros` today)
- [ ] QM-3. Retention (blocks the client edition): about 70 QM tables, several holding raw prompts, tool calls, session history, files and memory revisions. One database per client, every table classified, a purge job, verifier coverage
- [ ] QM-4. Route QM memory to the host through its external memory-provider hook; only then add `memory.propose` and `memory.tombstone` to the manifest
- [ ] QM-5. Replace the in-memory token-id and idempotency stores with the host's `client_adapter_consume_token` and a durable key store (they are lost on restart)
- [x] QM-6. Borrow three designs into the host itself (all three done locally). QM-6c (the single background-owner record) is done locally, see 9c. **QM-6a is done locally (decided 2026-10-20: the reviewer picks the label when approving, so it works with no model):** approving a promotion needs a label of `ordinary` or `sensitive` (a rejection takes none; `sensitive` needs a 20-character reason); the shared note takes that label automatically and it cannot be edited; `unknown` marks private and pre-label notes; only `ordinary` facts go to a model by default, `sensitive` on request, never `unknown` or `restricted`; the review screen has a required label choice; both new columns are in backup and restore. A classifier prompt and strict parser are in `adapterMemoryGuard.ts` for a future suggestion helper that nothing calls yet. About 40 new or updated tests; 14 mutations each fail a test. ADR-009 has an addendum. **QM-6b is done locally (advised to defer, built on request):** `adapterCommandPolicy.ts` decides allow / deny / require-approval per command (strictest rule wins, so a client cannot loosen the org floor; five floor rules adapted from QM; unsafe patterns, look-around and look-alike letters handled), and a command that needs approval becomes a hash-bound `run-command` action in the existing two-person gateway, a fourth approval kind (code, table check, upgrade and request function share one list, guarded by a test; only adapters in preview/enabled above read-only can ask). 13 policy tests and 3 database tests; 16 mutations each fail a test; ADR-006 addendum. **Nothing calls it yet:** no host code runs commands, so the first runtime that does (a Forge sandbox runner, Phase 4) must call `decideCommand` before every command; per-client rules have no screen or storage
- [ ] QM-7. Security review of QM itself before any client data: auth broker, credential broker, egress proxy, sandbox isolation, prompt-injection posture for unattended work
- [ ] QM-8. Check the licence of `earendil-works/pi` (YC's `pi` repo is a fork of it, and QM vendors a patched `pi-ai` and depends on `@earendil-works/pi-coding-agent`). Provenance: the `yc-software` GitHub organization is titled Y Combinator and links ycombinator.com (checked 2026-10-20; no verified-domain badge was visible), so client paperwork can say "published by the Y Combinator GitHub organization, MIT licence"; the `pi` toolkit under it is not YC's own work

---

## Phase 2: Creator OS adapter

Work happens in the separate ContractorOS repo (`dev4-gpt/ContractorOS`, AGPL, still public). Slice 1 is committed locally in a fresh clone at `~/Documents/Codex/Projects/ContractorOS`, branch `feat/h1-surface`, commit `9d984aa`, **not pushed** (push only once you decide about making the repo private). 310 tests pass across its seven packages; 22 mutations on the new code each fail a test.

- [~] Manifest, `task.run/get/cancel` routes in the ContractorOS service (X-1, CRITICAL). Done in slice 1: `manifest`, `health`, `task.run`, `task.get`, `task.cancel`, one draft-class task `content.draft`, behind Ed25519 host tokens, off by default. **Open (slice 2):** `events`, `memory.propose`, `memory.tombstone`, returning the draft text (the memory store gives asset ids, not bodies), wiring `main.ts` so the service can start with the host surface on
- [x] Approver identity from the host login, not a caller field (X-6). There is no approve or publish route at all, the requester is fixed as `veloce-host`, and any requester or approver field in a request is a 400. The two-person approval stays in the host gateway
- [x] Tenant slug threaded through every API; one slug format (X-7). Core and the factory now share the host's rule `^[a-z][a-z0-9-]{2,40}$`; the h1 routes take the tenant from configuration and refuse a body or token naming another. Note: a client folder named with a leading digit or over 41 characters would now be refused (nothing in the repo is affected)
- [x] Draft-class tasks only; publishing stays disabled (the manifest ceiling is `draft`; the run stops at awaiting approval)
- [~] Contract tests against the real service; spoofed-approver test; tenant tests. Done in-process: a token minted by the real host module verifies, spoofed requester/approver fields and approve routes are refused, wrong tenant refused. **Open:** a test from the host side against a running ContractorOS service
- [ ] Budget feed reconciles with the host ledger (the per-task limit is the factory's hard cap today; the cross-ledger reconcile is not built)
- [ ] Deletion receipts or label "outside the guarantee" (X-2). Labelled `deletionGuarantee: "none"` in the manifest for now, so it stays out of the client edition
- [ ] P2-1. Durable replay protection: the token-id store is in memory; use the host's `client_adapter_consume_token`
- [ ] P2-2. You: choose the starter principal/pillar (X-15). The task takes any pillar from the existing list per request; nothing is hard-coded
- [ ] P2-3. You: make the ContractorOS repo private (Phase 0) before any of this is pushed

## Phase 3: Knowledge adapter

- [ ] Shared page schema enforced; legacy notes (1,357 of 1,441 have no `type`) stay private (X-13)
- [ ] Ingest from your own files and the Instagram export; lint
- [ ] Reverse index from each page's `sources` field; dry-run then real source deletion cascade (X-16)
- [ ] Single-writer rule per folder; conflict-copy check for iCloud (X-12)
- [ ] Injection samples land in quarantine (S-3)
- [ ] Review the remaining duplicate groups (8 exact, 56 near-low-confidence) when you choose
- [ ] Round trip: ingest, promote, delete source, derived pages gone

## Phase 4: Forge adapter

- [ ] Forge deploy checklist (Neon snapshot first) followed; schema upgrade and rounds route tested live (S-6)
- [ ] Fresh private held-out test sets; old public ones treated as burned (X-8)
- [ ] Health, tenant id, connection; evaluator-tamper test
- [ ] A round runs end to end with a human approving a hash
- [ ] Confirm where Forge is hosted (unknown today)
- [ ] CI added: PR #1 merged with no checks (P-5)

## Phase 5: SymVibe + REA

- [ ] Wrap the real REA (`morluto/rea`, MIT); the `symlink` version is a model simulation
- [ ] Label model-generated output as drafts, never evidence
- [ ] Scratch repo as push target; no write path into the Veloce repo (X-9)
- [ ] Allowlist and refusal tests

## Phase 6: Flagged extras (all off by default)

- [ ] Harness2 as a proposer only; evaluator owned outside the agent (research items 9-10)
- [ ] Higgsfield or Muapi once priced (pricing unknown, parked)
- [ ] Artemis for QA; SPACE as an optional sandbox on Linux; InkOS; Hunyuan3D-WorldClaw
- [ ] Each gets its own contract tests before being turned on

## Phase 7: Client readiness (hard gate)

- [ ] Veloce's own verifier returns `releaseReady=true` on the exact build (X-3, CRITICAL). Today `false`, 59 evidence categories unevaluated
- [ ] Hosted tenant isolation proven (the staging check has never run)
- [ ] 28 + 7 retention proven in hosted operation, including purge and restore
- [ ] Billing reconciliation and the full customer journey
- [ ] Payments through a licensed provider; legal review
- [ ] The 3 known failing tests in `public-production-readiness.spec.ts` resolved (N-3, receipts bound to an older candidate)
- [ ] Deletion tombstones acknowledged by every adapter that holds client data
- [ ] Only then may client data touch any adapter

---

## Stop-ship checklist (every box before any client sees it)

- [ ] 1. `releaseReady=true`
- [ ] 2. Hosted isolation and 28 + 7 proven
- [ ] 3. Adapter deletion acknowledged, others excluded
- [ ] 4. Two verified people on every publish and promotion
- [ ] 5. One budget currency, atomic reserve/settle, fail closed
- [ ] 6. No secret in any repo; known keys rotated
- [ ] 7. Lawyer reviewed licence boundary and payments
- [ ] 8. No payment path based on parsing bank messages
- [ ] 9. Every new route has unauthenticated and wrong-tenant tests
- [ ] 10. All new specs in the standard test command (true for current specs)

---

## Known risks and errors (from the register, still open)

| ID | Sev | Risk | Phase |
|---|---|---|---|
| X-1 | CRITICAL | Contract on paper only; no adapter implements it | 2 |
| X-2 | CRITICAL | Retention cannot reach stores outside Veloce | 1 |
| X-3 | CRITICAL | Host is not release-ready | 7 |
| X-4 | CRITICAL | Shared-memory poisoning | 1 |
| X-5 | WARNING | Budget double metering and stale counters | 1 |
| X-6 | WARNING | Creator OS approver identity is caller-supplied | 2 |
| X-7 / N-1 | WARNING | Two tenant-slug rules | 1 / 2 |
| X-8 | WARNING | Forge test sets were public; state files committed | 4 |
| X-9 | WARNING | `symlink` defaults its push target to the Veloce repo | 5 |
| X-10 | WARNING | AGPL pieces beside a closed product | 0 |
| X-11 | WARNING | Which vault Veloce reads is unconfirmed | 0 |
| X-12 | WARNING | iCloud multi-writer conflict copies | 3 |
| X-13 | WARNING | Most existing notes lack the shared schema | 3 |
| X-15 | WARNING | The "six agents" do not exist as code | 0 |
| X-16 | WARNING | Deleting a source does not remove pages built from it | 3 |
| N-3 | existing | 3 failing readiness tests on the base commit | 7 |
| N-5 | note | Approvals and budget retention classes provisional | 1 |
| PAY-1 to PAY-4 | CRITICAL/WARNING | Bank-message-reading gateway unsuitable for clients | 7 |

## How to use this file

After every step: tick what finished (only if its check was run), add anything new that the step revealed with an ID, update the "Last updated" line, and mention the commit hash. After every phase: walk the stop-ship list and the "what holds today" table in `03-safety-and-retention.md`.
