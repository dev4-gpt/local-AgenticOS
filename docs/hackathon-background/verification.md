# Verification and Open Gates

## Historical local evidence

The accompanying [JSON summary](evidence-summary.json) is an allowlisted
projection of a locally retained receipt, not the full receipt or independently
replayable release evidence. Its source was checked by SHA-256 before preparing
this pack. Hash equality detects a changed artifact; it is not a signature,
proof of authorship or access to omitted evidence.

The run ended at `2026-10-17T16:58:45.270Z`. It used base commit
`7344a7d9d47a93a5553d4b0d57c9bdeab8a70b87` with uncommitted changes bound to
working-tree fingerprint
`bdc1b86205485f79fcfd678c220b679a4ce58e2e9cc051bcd29e80c9e00af2c8`.
The later `a4c379a` commit captures the application baseline but does not change
the old receipt's identity into a new clean-commit run.

| Local check | Recorded outcome | Scope |
|---|---|---|
| Focused regression selection | 458 passed | Selected tests, not every repository test |
| Named offline AI cases | 24 passed | Fixture-backed; zero real-model samples |
| Notebook browser scenarios | 6 passed | Synthetic services and loopback application handlers |
| Focused ESLint and TypeScript | Passed | Local source checks |
| Lifecycle contract and retention inventory | Passed | Local contracts, not operated hosted deletion |
| Strict release verifier | Not ready, exit 1 | Missing required release evidence/gates |

The historical strict report lists `working_tree_clean`,
`ledger_bucket_not_configured` and `release_environment` failures and 56
unevaluated categories. Committing subsequently resolves the dirty tree as Git
state, not the other gates or the validity of an old receipt for a new commit.
The pack does not claim a fresh full evaluation of its own documentation commit.

## What remains unverified

- A real customer's authenticated end-to-end journey and accepted deliverable.
- Same-member local/cloud identity, source/image identity and two-tenant isolation.
- Approved hosted migrations, ledger/reviewer approval and rollback evidence.
- Full authorized source contents, reviewed omissions and confirmed tenant import.
- Hosted 28-active-plus-seven-recovery behavior, final deletion, backups and vendors.
- Live model quality, telemetry delivery/loss detection, invoices and hard cost caps.
- Real buyer validation and a freshly approved, bounded MiroFish provider run.
- Official hackathon eligibility and any CreateOS integration/new event-period work.

Room inline writes and non-atomic domain/job outcomes also remain open; generated
file guards must not be described as universal approval enforcement.

## Reproduction entry points

Use supported Node 24 and the installed locked dependencies. Run only in an
isolated local test environment without real provider or production credentials.
The existing evaluator strips its child environment; do not broaden it for a demo.

```sh
node scripts/verify-client-lifecycle.mjs
node scripts/verify-client-retention-inventory.mjs
node scripts/run-ai-release-evaluation.mjs
node scripts/run-notebook-journey-evaluation.mjs
node scripts/verify-production-readiness.mjs --strict --out /private/tmp/agentos-readiness.json
```

These commands are starting points, not a promise to reproduce all 458 selected
checks. Browser evaluation needs an installed supported browser and loopback
process permission. The strict verifier is expected to reject incomplete release
evidence. Full source/configuration/runner hashes and before/after identity must
be captured for any new result. No deployment, hosted mutation, provider spend
or release approval is authorized by this pack.
