# Open items tracker

Master plan phases (from `reports/Veloce master plan and error register.md`). Tick a box only when its "done when" check has actually been run. Update this file in the same commit as the work.

Legend: **Owner** = Me (the assistant) / You / Both / Lawyer. **Sev** = CRITICAL / WARNING / SUGGESTION. IDs refer to the error register.

Last updated: 2026-10-19 after commit `34a03c3` on `feat/approval-gateway`.

---

## Phase status

| Phase | Name | Status |
|---|---|---|
| 0 | Hygiene | Mine done; yours open |
| 1 | Host foundation | Items 1-3 done; 4-6 open |
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
- [ ] **4. Budget enforcement (Me).** Reserve, settle, release functions against the central ledger; per-adapter caps; one unit; one event id per charge; fail closed; show unknown costs separately (X-5, N-4). *Done when:* tests prove two simultaneous reservations cannot overspend a cap, a retried charge is counted once, and the ledger being down refuses the task
- [ ] **5. Adapters page and Budget tab (Me).** List adapters and states; spend against caps on the main page. First read the Next.js docs bundled in `node_modules/next/dist/docs/` (X-17). *Done when:* unauthenticated and non-member requests are rejected, and the page shows the real ledger
- [ ] **6. Observability (Me).** Audit events and counters for approvals, tokens, promotions, budget. *Done when:* each event is visible and tested
- [ ] **7. Scoped handles (Me).** Narrow references so an adapter can read only what a task needs
- [ ] **8. Purge and restore wiring for the new tables (Me).** Active expiry at 28 days, recovery for 7, bounded purge, restore. *Done when:* tests cover expiry, recovery-only exclusion and cross-tenant safety (the 28 + 7 gate)
- [ ] **9. Scheduled jobs (Me).** Run token purge and approval expiry on a schedule. *Done when:* a scheduled run is observed
- [ ] **10. Promotion hardening (Me).** Source-linked diffs, no tool instructions inside shared facts, retrieval-time distrust, rollback (X-4, CRITICAL)
- [ ] **11. Approvals table retention class (Both).** Provisional until you approve a schedule (N-5)
- [ ] **12. Align tenant slug rules (Me).** The database rule and `capabilityContracts.ts` disagree (N-1, X-7, WARNING)
- [ ] **13. Key storage and rotation for adapter tokens (Both).** Decide where the signing key lives; nothing sends or checks tokens yet
- [ ] **14. Wrong-tenant route tests (Me).** The two approval routes have unauthenticated tests only; stop-ship item 9
- [ ] **15. Approvals page flow (Me).** A way for two people to see and decide pending approvals; the routes exist, the screen does not
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
