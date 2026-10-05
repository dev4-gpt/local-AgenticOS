# Production readiness handoff

This is a checkpoint, not release acceptance. Source under test:
`c60ecd641e017d0d18076f5091c056a5d40a4a8a` (test-registration and documentation
changes following authentication repair `2c5f347`). No push, deployment,
permission grant, source upload, or paid provider call occurred in this check.

## Verified progress

- Standard local regression suite: 297 passed, one optional private-source-pack
  check skipped without its input. The new login-membership and development
  Google-identity tests are now included in this suite.
- Supplying the private bonus-index pack separately: all 12 Markdown/parser/
  embedded-Postgres import checks passed. The database checks verify exact
  normalized text/link preservation, idempotency, tenant denial, graph URLs,
  transactional failures, and graph cleanup. This is not a hosted import.
- Private pack: `.private-client-kits/bonus-index-source-pack.json`, mode 0600,
  SHA-256 `1898663eda7549bf1bae50c02c3c602ef9ce828280782a3d527e115efe857303`.
  Two sections, 111 outbound links, one skipped empty URL. It is a bonus index,
  not the complete May-September classroom text/video export. No linked content
  was fetched. Private contents are ignored by Git.
- Login repair: 19 focused authentication checks and six browser checks passed;
  mobile/desktop screenshots inspected; type check and targeted lint passed.
  The real session authenticated but returned `tenant_membership_required` for
  internal-beta. No tenant membership was silently granted.
- Deterministic AI evaluation: 9/9 at clean source `2c5f347`; receipt in
  `tmp/ai-release-2c5f347.json`. No model samples or hosted reliability claim.
- Release verifier: `releaseReady: false`, ledger bucket not configured, other
  hosted release gates not evaluated. Historical ledger records do not qualify
  the current candidate.

## Remaining requirements

| Workstream | Missing authoritative evidence / next dependency |
| --- | --- |
| Customer journey | Current deployment J01-J15 receipts remain unaccepted. Local internal-beta account needs approved membership before its data journey can continue. |
| Source-to-graph | Hosted artifact upload and applied graph migration unverified. Local signer lacks `iam.serviceAccounts.signBlob`; bucket CORS does not include localhost. Full lesson/video source inventory remains unavailable. |
| Local/cloud parity | Internal-beta and old cloud-test are different tenants. No same-release, all-promised-actions parity receipt exists; current code is not deployed. |
| AI engineering | Local policy tests pass, but hosted job/ledger/trace reconciliation, model-backed reliability, alert delivery and operational acceptance remain open. |
| MiroFish | Reviewed repeat `sim_3b7bfff26e22` has matching hashes but no execution artifacts. Durable pilot env has LLM settings and no Zep key. Existing completed run fails current workflow-fidelity audit. Paid-spend approval remains $0. |
| Release | Need approved target deployment, migrations, ledger destination, rollback reference, and operational/legal signoffs. Source is committed locally, not pushed or promoted. |

## Resume order

1. Resolve the pending approval to add the known account as a regular member of
   internal-beta, or sign in as its existing approved member. Confirm the
   session reports workspace authorization before claiming any data access.
2. Resolve narrowly scoped upload access and local origin policy through an
   approved change, or verify the import on the approved hosted origin. Do not
   disable tenant authentication or broaden project-level IAM as a shortcut.
3. Restore Zep configuration in the private MiroFish research environment; run
   only the already-reviewed bounded repeat, audit its output, and retain the
   distinction between synthetic hypotheses and real buyer evidence.
4. Continue the complete journey/parity and hosted engineering acceptance on an
   explicitly approved immutable deployment. Do not convert local green tests
   into a production-readiness percentage.
