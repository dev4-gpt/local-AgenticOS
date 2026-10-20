# Veloce AgenticOS: start here

Last updated: 2026-10-19. Branch: `feat/approval-gateway`. Read this first, then `01-how-it-works.md`.

## What Veloce is, in one paragraph

Veloce is the **host**: one workspace that decides who you are, what you may do, how much money may be spent, and what the shared memory is allowed to remember. Separate products (Creator OS, a Knowledge vault, Forge, SymVibe + REA) plug into it as **adapters**. An adapter does the work in its own area. It never gets to decide for itself. It can only **propose**, and Veloce (the host) says yes or no.

## The picture

```
                        YOU (signed-in people, two needed for risky actions)
                                      |
                    +-----------------v------------------+
                    |   VELOCE HOST                      |
                    |   - who is allowed (login, roles)  |
                    |   - approvals (two people)         |
                    |   - budget (one ledger)            |
                    |   - shared memory (reviewed only)  |
                    +--+-----------+----------+--------+-+
                       |           |          |        |
                  Creator OS   Knowledge    Forge   SymVibe+REA
                  (adapter)    (adapter)   (adapter) (adapter)
                  private      private     private   private
                  memory       memory      memory    memory
```

- Each adapter is a **separate program** that talks to the host over the network. Their code never gets copied into Veloce. This matters because some of them (ContractorOS) use the AGPL licence, which would otherwise spread into Veloce.
- Each adapter has its **own private memory**. Nothing leaks into shared memory unless two different people approve it.

## The three promises the design is built around

1. **Adapters propose, the host decides.** Identity, approval, budget and shared memory belong to the host.
2. **We only promise what we control.** If client data goes to a place Veloce cannot erase from (an adapter's own database), we say so plainly instead of pretending.
3. **No real client data until the readiness gate passes.** The host's own checker still says `releaseReady=false`. Everything built so far is for the operator edition (you), not clients.

## Where we are (plain status)

| Area | State |
|---|---|
| Rules of the host/adapter contract (types and checks) | Built and tested |
| Database tables for adapters, memory, approvals, budget log | Built and tested (in a throwaway in-memory Postgres) |
| Two-person approval gateway (database functions, routes, tests) | Built and tested; a request stores the exact text it covers and the database checks it against the fingerprint |
| Approvals screen (`/adapters/approvals`) | Built (operator edition, behind the host flag); checked in a browser against a throwaway real Postgres; no notifications, and nothing executes an approved request yet |
| Short-lived signed adapter tokens | Built and tested, but nothing uses them yet |
| Knowledge-vault duplicate finder (scan, report, apply) | Built, tested, used once on your vault (4 notes marked) |
| Budget rules (reserve, settle, release, per-adapter caps) | Built and tested, including a real-Postgres test with simultaneous requests; nothing calls them yet |
| Adapters page and Budget tab in the UI | Built (operator edition, read-only, behind the host flag); checked with sample data only, not yet against a real database |
| Any real adapter speaking the contract | **Not built** (Creator OS only serves 4 read-only routes) |
| 28 + 7 day expiry, read barrier, purge, backup and restore for adapter data | Built and tested locally (in-memory Postgres and the project's real migration chain); not yet checked on a hosted database |
| Cleanup jobs on a schedule (expiry, purges) | **Not built.** The purge runs when an operator runs the lifecycle command with `--include-adapter-host` |
| Hosted (real cloud) verification of isolation and retention | **Not done** |

The checklist of everything open is in `04-open-items-tracker.md`.

## Glossary (every term used in these guides)

| Term | Plain meaning |
|---|---|
| **Host** | Veloce itself. The one that owns identity, approval, budget and shared memory |
| **Adapter** | A separate product plugged into the host through a narrow, fixed contract |
| **Contract `h1`** | The agreed list of things an adapter can be asked to do (version 1 of the host rules) |
| **Operation** | One thing in the contract, such as `health` or `task.run` |
| **Side-effect class** | How much harm an action can do: `read` (look only), `draft` (make something, nothing leaves), `publish` (something goes out into the world) |
| **Private memory** | Notes only one adapter can see (namespace `adapter:<id>`) |
| **Shared memory** | Notes every adapter may read; only enters after approval (namespace `shared`) |
| **Promotion** | A request to move one private note into shared memory |
| **Quarantine** | Where a promotion waits before a person has looked at it |
| **Tombstone** | A removed note: its text is erased, but a marker stays so we know it existed and was removed |
| **Provenance** | The history of where a note came from and what happened to it (append-only) |
| **Outbox** | A queue of "something happened" messages for the host to deliver, with receipts |
| **Approval** | A stored yes/no for one exact action, decided by a different person than the one who asked |
| **Action hash** | A fingerprint (SHA-256) of the exact action: kind, adapter, destination, policy version, payload. Change anything and the fingerprint changes |
| **Requester / approver** | The person who asks, and a *different* person who agrees. The database enforces they are not the same |
| **Worker token** | A secret the host's background worker uses to call certain database functions for one tenant. Never typed by people |
| **Adapter token** | A short-lived signed pass (Ed25519) that says "this call is for tenant X, adapter Y, operations Z, expires in a minute" |
| **jti** | The unique id inside a token so it can be used only once |
| **Micros** | Money as whole numbers of millionths of a US dollar (so $1 = 1,000,000). Avoids rounding errors |
| **Budget cap** | The most an adapter may spend in a period (day, month, total) |
| **Tenant** | One customer workspace. All data is separated by tenant |
| **RLS** | Row-level security: the database itself only shows a user rows they are allowed to see |
| **28 + 7 retention** | Client data stays active up to 28 days, then 7 recovery-only days, then it is purged |
| **PGlite** | A small, real PostgreSQL that runs inside the tests, so database rules are really executed |
| **ADR** | Architecture Decision Record: a short note explaining why a design choice was made |
| **Dedupe** | Finding duplicate notes in the knowledge vaults. We flag, we never auto-merge |
| **AGPL** | A licence that forces anyone running the code as a service to publish their changes. Kept at arm's length by running it as a separate program |

## Reading order

1. `00-start-here.md` (this file)
2. `01-how-it-works.md` (the ideas, in plain language)
3. `02-code-tour.md` (every file and what it does, with the test that proves it)
4. `03-safety-and-retention.md` (what is protected today and what is only promised)
5. `04-open-items-tracker.md` (everything still to do; tick it after each step)

Source of truth for plans and risks: `reports/Veloce master plan and error register.md` (outside the repo, in the AgentOS reports folder). Design decisions: `docs/architecture/adr-005-adapter-host-contract.md` and `adr-006-approval-gateway.md`.
