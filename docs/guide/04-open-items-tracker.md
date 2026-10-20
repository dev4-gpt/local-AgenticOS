# Open items tracker

Master plan phases (from `reports/Veloce master plan and error register.md`). Tick a box only when its "done when" check has actually been run. Update this file in the same commit as the work.

Legend: **Owner** = Me (the assistant) / You / Both / Lawyer. **Sev** = CRITICAL / WARNING / SUGGESTION. IDs refer to the error register.

Last updated: 2026-10-19 after adapter retention and restore wiring (Phase 1 item 8) on `feat/approval-gateway`.

---

## Phase status

| Phase | Name | Status |
|---|---|---|
| 0 | Hygiene | Mine done; yours open |
| 1 | Host foundation | Items 1-5 and 8 done; 6, 7, 9-16 open |
| 2 | Creator OS adapter | Not started |
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
- [ ] **You + Lawyer:** review the AGPL separation (ContractorOS, `seo-os`, `trypost`, InkOS) (X-10, WARNING)
- [ ] **You + Lawyer:** payment route: choose a licensed provider; do not use the bank-message-reading gateway (PAY-1 to PAY-4, CRITICAL)
- [ ] **You:** decide the base branch for the work (X-18). Currently cut from `wip/backup-2026-10-03`, not `main`
- [ ] **You:** retire the duplicate staging copy of the Keepy library when ready (X-14)
- [ ] **You (Codex task):** Instagram export through the official data download (S-4)

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
- [ ] **6. Observability (Me).** Audit events and counters for approvals, tokens, promotions, budget. *Done when:* each event is visible and tested
- [ ] **7. Scoped handles (Me).** Narrow references so an adapter can read only what a task needs
- [x] **8. Purge and restore wiring for the new tables (Me), done locally in two commits on `feat/approval-gateway`.** Active expiry at 28 days, recovery for 7, bounded purge, export and restore. The 28 + 7 gate is met in the local and in-memory test databases only; the hosted proof is still open (8f)
  - [x] 8a. Expiry, read barrier and purge (commit A, `supabase-client-adapter-retention-28.sql`, ADR-008): 11 tests; lifecycle command runs the purge with `--include-adapter-host` (and `--confirm-retention-adapter` to apply)
  - [x] 8b. Offboarding export and restore (commit B): the six adapter tables are exported with their dates and restored only inside their active window; adapters come back disabled; usable approvals never come back; the restore rolls back as a whole if the notes and promotions do not match up. 7 restore tests, three deliberate breakages each fail tests; also checked against the real migration chain in `client-schema-upgrade.spec.ts` (55 restore projections)
  - [ ] 8f. Prove 8a and 8b on free staging Supabase with the real migrations, real row-level security and a real backup and restore (nothing here has run outside in-memory Postgres)
  - [ ] 8g. The restore bypass trusts whoever can run SQL as the service role (as the other tables' restore guard does). Decide whether that is acceptable
  - [ ] 8h. The adapter migrations were added to the real migration chain test; the hosted deployment order must put them before the lifecycle restore migration
  - [ ] 8c. Make the adapter purge default in the lifecycle command once the adapter host is installed anywhere hosted (it is opt-in today so installations without it keep working)
  - [ ] 8d. Skeleton rows: a private note and its promotion keep an empty shell (text erased, hidden) until the newer shared note is purged. Decide whether a shell may outlive 35 days or the chain should be cut sooner
  - [ ] 8e. While a shared note is expired but unpurged, the same fact cannot be shared again (hash slot held for up to 7 days)
- [ ] **9. Scheduled jobs (Me).** Run token purge and approval expiry on a schedule. *Done when:* a scheduled run is observed
- [ ] **10. Promotion hardening (Me).** Source-linked diffs, no tool instructions inside shared facts, retrieval-time distrust, rollback (X-4, CRITICAL)
- [ ] **11. Approvals table retention class (Both).** Provisional until you approve a schedule (N-5)
- [ ] **12. Align tenant slug rules (Me).** The database rule and `capabilityContracts.ts` disagree (N-1, X-7, WARNING)
- [ ] **13. Key storage and rotation for adapter tokens (Both).** Decide where the signing key lives; nothing sends or checks tokens yet
- [ ] **14. Wrong-tenant route tests (Me).** The two approval routes have unauthenticated tests only; stop-ship item 9
- [ ] **15. Approvals page flow (Me).** A way for two people to see and decide pending approvals; the routes exist, the screen does not
  - [x] 15a. Store and verify what is being approved (approvals-screen commit A): the request now stores the exact canonical text that was hashed; the database refuses text that does not hash to the fingerprint or disagrees with the row; the text is immutable, in the backup and restore projection, and returned by the list route with the viewer's id and whether they may decide. Three deliberate breakages each fail tests
  - [ ] 15b. The approvals screen itself (commit B)
  - [ ] 15c. No notification tells a second person a request is waiting; they must open the page
  - [ ] 15d. Requests are created by host code; there is no form to create one from the UI
- [ ] **16. Mutation check on Phase 1 tests (Me).** Remove each rule and confirm a test fails (master plan principle 5)

---

## Phase 2: Creator OS adapter

- [ ] Manifest, `task.run/get/cancel`, `events`, `memory.propose`, `memory.tombstone` routes in the ContractorOS service (X-1, CRITICAL). It serves only 4 read-only routes today
- [ ] Approver identity from the host login, not a caller field (X-6, WARNING)
- [ ] Tenant slug threaded through every API; one slug format (X-7)
- [ ] Draft-class tasks only; publishing stays disabled
- [ ] Contract tests against the real service; spoofed-approver test; tenant tests
- [ ] Budget feed reconciles with the host ledger
- [ ] Deletion receipts or label "outside the guarantee" (X-2)

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
