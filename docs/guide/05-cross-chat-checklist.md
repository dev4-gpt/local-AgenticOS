# Cross-chat checklist

One sheet to match the three chats against. It does not replace `04-open-items-tracker.md`; it shows which chat holds each piece and what is proven versus only reported.

Last written: 2026-11-02 by the Phase 2 / pitch-video chat. The `founder.gtm` section was added 2026-11-21 from a relayed report; the rest of the sheet has not been refreshed since 2026-11-02 and is behind the tracker (for example Phase 2 "models through the host" and Phase 3 are now in the tracker as built or merged).

## How to use

1. Each chat updates only its own rows and does not edit the others'.
2. A box is ticked only if a check was run. **R** = reported by another chat, not re-verified by the one reading this.
3. When a chat finishes a row, it updates the tracker on its own branch. The tracker still says Phase 3 and Phase 4 are "Not started", which is stale (see the PR 24 comment from the Phase 3 chat).

## The three chats

| Chat | Owns | Branch / PR |
|---|---|---|
| A. Phase 1/2 + pitch | Phases 0-2, Creator OS adapter, pitch video | `feat/approval-gateway`, pushed, HEAD `707d5b3` |
| B. Phase 3 + Forge | Knowledge adapter, Forge evaluator hardening | PR 24 (`dev4-gpt/local-AgenticOS`) |
| C. Go-to-market strategy research (confirm this is the third chat) | `founder.gtm` in Creator OS: staging proof, retention sweep | ContractorOS `feat/founder-gtm` (not in ContractorOS PR #2) |

## Phase 3: Knowledge adapter (chat B)

B's note lists what is built, tested and not done. The rows below map that to the tracker's Phase 3 list. Copy B's exact wording over if it differs.

| Item | Tracker ref | B reports | Verified here |
|---|---|---|---|
| Shared page schema enforced; legacy notes stay private | X-13 | built, tested (R) | [ ] |
| Ingest from own files and Instagram export; lint | | built, tested (R) | [ ] |
| Reverse index from `sources`; source-deletion cascade | X-16 | built, tested (R) | [ ] |
| Single-writer rule; iCloud conflict-copy check | X-12 | built, tested (R) | [ ] |
| Injection samples land in quarantine | S-3 | built, tested (R) | [ ] |
| Round trip: ingest, promote, delete source, derived pages gone | | built, tested (R) | [ ] |
| Deploy | | **not done** | [ ] |
| Empty outbox | | **not done** | [ ] |
| Scan-flagged and invalid pages | | **not done** | [ ] |
| Remaining duplicate groups (8 exact, 56 near) | | yours, when you choose | [ ] |
| Tracker rows moved off "Not started" | | **not done**, waiting on a decision | [ ] |

## Phase 4: Forge adapter (chat B, partial)

| Item | Tracker ref | B reports | Verified here |
|---|---|---|---|
| Evaluator tamper test | | done (R) | [ ] |
| Fresh private held-out sets; old public ones burned | X-8 | done (R) | [ ] |
| Host-side Forge adapter (health, tenant id, connection) | | **not started** | [ ] |
| Seeding to the live database | | **not started** | [ ] |
| Deploy checklist, Neon snapshot first, rounds route live | S-6 | **not started** | [ ] |
| A round runs end to end with a human approving a hash | | **not started** | [ ] |
| Confirm where Forge is hosted | | open | [ ] |
| CI added (PR 1 merged with no checks) | P-5 | open | [ ] |
| Forge `.projects` files checked for secrets | X-8, S-1 | yours (Phase 0) | [ ] |
| Any Forge runner calls `decideCommand` before every command | QM-6b | note for whoever builds the runner | [ ] |

## founder.gtm in Creator OS (chat C, reported by that chat)

Added 2026-11-21 from a message relayed by the owner. Source: `reports/Veloce plan - GTM research task in Creator OS.md`, section 12. **R** = reported, not re-verified here.

| Item | C reports | Verified here |
|---|---|---|
| Staging service `veloce-creator-os-agentos-staging` runs `creator-os:host-0e14f26` (revision `00013-wf5`), replacing `host-e98a87e` (`00012-nj8`, the rollback target); adapter 0.5.1, only the image changed | done (R) | [ ] |
| D4 retention sweep: founder task state hidden after `CONTENT_OS_RETENTION_DAYS` (default 28), deleted 7 days later, checked at start-up and hourly | done in code, ContractorOS `0e14f26` (R) | [ ] |
| ContractorOS `0e14f26` is on `origin/feat/founder-gtm` | verified by the chat that relayed this | [ ] |
| ContractorOS PR #2 (`feat/content-os-combined`, head `aeae1ff`) contains the retention sweep | **no**, it does not yet | [ ] |
| Slice 4 staging proof: run 0009 passed (27 of 27 quotes found again), cancel run 0002 passed | done (R) | [ ] |
| Token cap stopping a run on staging | **not run** on staging; covered by a service test | [ ] |
| Withdrawal proof (4d): a withdrawn fact leaves the task's file | **not done**, belongs with the ADR-020 host work | [ ] |
| A host-mode run of `founder.gtm` | **not done**, belongs with the ADR-020 host work | [ ] |

## Phase 2: Creator OS adapter (chat A)

| Item | State |
|---|---|
| Slices 1, 2a-2d, 3a-3c; Cloud Run service (ADR-018); deletion receipts (ADR-014); sync switch (ADR-019) | [x] done, pushed 2026-10-26 |
| Host starts adapter tasks with a budget reservation | [ ] not built |
| Models through the host (needs ADR and your decision) | [ ] open |
| P2-2: your starter pillar | [ ] yours |

## Phase 1: Host foundation (chat A)

| Item | State |
|---|---|
| Items 1-8, 10-16, QM-6 | [x] done |
| 9b: unattended scheduler run of 2026-10-22 read in the logs | [ ] not recorded as confirmed |
| 4b-4e budget follow-ups | [ ] open |
| 8c-8e retention loose ends | [ ] open |
| 10d-10g scanner limits, `context.read` | [ ] open |
| 15c, 15d, 15f-15h approvals page follow-ups (15h reload bug) | [ ] open |
| QM-1 to QM-5, QM-7, QM-8 | [ ] open |

## Phase 0: yours

- [ ] Rotate the `markexis` key (S-1)
- [ ] Check Forge `.projects` files for secrets (X-8, S-1)
- [ ] Check the `symlink` `GITHUB_TOKEN` was never deployed
- [ ] Confirm which vault Veloce reads (X-11)
- [ ] Confirm the six pillar names (X-15)
- [ ] Decide what "the knowledge bases" means
- [ ] Decide whether client notes may sit in an iCloud vault (S-5, X-12)
- [ ] Lawyer: AGPL separation (X-10) and payment route (PAY-1 to PAY-4)
- [ ] Decide the base branch (X-18)
- [ ] Retire the duplicate Keepy staging copy (X-14)
- [ ] Instagram export through the official download (S-4)
- [ ] Sentry/Datadog accounts, only if wanted
- [ ] Watch: `braces` audit finding blocking PR 23

## Phases 5 to 7 (nobody has started)

- [ ] Phase 5 SymVibe + REA
- [ ] Phase 6 flagged extras
- [ ] Phase 7 client readiness (hard gate): `releaseReady=true`, hosted isolation, 28 + 7 in hosted operation, billing reconciliation, licensed payments, the 3 failing readiness tests, tombstones acknowledged by every adapter

## Stop-ship (every box before any client sees it)

- [ ] 1 `releaseReady=true`
- [ ] 2 Hosted isolation and 28 + 7 proven
- [ ] 3 Adapter deletion acknowledged, others excluded
- [ ] 4 Two verified people on every publish and promotion
- [ ] 5 One budget currency, atomic reserve/settle, fail closed
- [ ] 6 No secret in any repo; known keys rotated
- [ ] 7 Lawyer reviewed licence boundary and payments
- [ ] 8 No payment path based on parsing bank messages
- [ ] 9 Every new route has unauthenticated and wrong-tenant tests
- [ ] 10 All new specs in the standard test command

## Pitch (chat A, done)

- [x] Video published: https://youtu.be/TaVZmgPgoOQ
- [ ] You: submit the pitch form (video link, build link, app description)
- [ ] You: optional, check YouTube auto-captions and the AI-use disclosure
- [ ] You: keep or delete `scripts/staging-demo-seed.sql` and `staging-demo-cleanup.sql` (untracked)

## Conflict to resolve

Chat B's branch and chat A's branch both touch the tracker. Decide the order: merge PR 24 first and update the tracker once, or let B commit its tracker update on the PR branch and rebase A on it.
