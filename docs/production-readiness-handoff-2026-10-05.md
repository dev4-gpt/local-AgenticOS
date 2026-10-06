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

## Internal-beta continuation, October 5

This section records work after the original checkpoint above. The older
"Remaining requirements" table is historical, not the current state.

- In Supabase project `ppmoqjtmjtfxadsnejqc`, the verified auth user
  `a2c2812c-1473-4ea3-92ba-1c106643869d` (`aryamandev777@gmail.com`) now
  has an active `member` membership in the newly created active `internal-beta`
  tenant. The real local `/api/client-auth/session` response changed from
  `tenant_membership_required` to `workspaceAuthorized: true`. Memory loaded
  with an empty tenant graph before import.
- The reviewed `product-experience/supabase-client-runtime-source-pack-graph.sql`
  migration was applied to the project's main database in one transaction after
  explicit user approval. The import and search functions are present. The
  pre-existing graph stayed at 33 nodes and 57 edges immediately after the
  migration; no other tenant graph was refreshed by this test.
- The approved bonus index was uploaded and imported through the signed-in
  local UI into `internal-beta`. The preview reported two sources, 111 link
  entries and one skipped entry. The import reported two added, zero updated,
  zero unchanged. Database readback found two active memory records with the
  expected pack SHA-256, 111 stored links, one import audit, 111 URL nodes and
  110 `links_to` edges. The graph view reported 114 nodes and 113 total edges;
  repeated targets within a source collapse to one graph edge. A search for an
  imported link title returned its source record. This verifies the bonus
  *index* only, not the linked documents, Skool lessons or videos.
- Google Cloud project `agentos-mvp`: a temporary `signBlob`-only grant on the
  beta runtime service account and a temporary `storage.objects.get`-only
  bucket grant scoped to `internal-beta/` objects were added for
  `aryamandev777@gmail.com`. Both conditions expire at
  `2026-10-06T18:23:41Z`. The bucket CORS policy also allows the exact local
  origin `http://127.0.0.1:3939`; this CORS rule does not expire automatically
  and should be removed when local upload acceptance is finished. Neither
  binding grants object listing or deletion. The CLI credential initially
  resolved to a different signed-in email; reauthentication restored the
  intended identity, and a direct `signBlob` probe returned HTTP 200.
- No app push, Cloud Run revision, Vercel deployment, paid model call or release
  ledger acceptance occurred in this continuation. The customer journey,
  same-release cloud parity, complete authorized source inventory, MiroFish
  repeat and hosted release gates remain open.
- Chrome comparison on the same signed-in account: local and hosted-beta home
  pages have the same main layout and copy. Both `/memory` pages read the two
  imported records and report 114 nodes / 113 edges from the same tenant data.
  The local Memory page has a `Community sources` JSON-pack review/import
  control; hosted beta does not. Its existing Markdown import is a different
  control. Therefore the migration made the data visible in cloud, but the new
  source-pack workflow is not deployed. The hosted revision observed was
  `agentos-internal-beta-00034-v69`, image digest
  `sha256:70d24863d095aa9753cf02629a30458f7fdd8ef81bfc5ed2ce35e2c0ed16da57`;
  image provenance did not establish a matching source commit.
- The isolated MiroFish pilot environment still has no `ZEP_API_KEY`. The
  prepared bounded repeat `sim_3b7bfff26e22` remains unexecuted. The approved
  paid-spend limit is $0; do not substitute a paid fallback.
- Current focused verification at `0fe2e36`: 33 source-pack/auth/identity unit
  checks passed, one optional private-input check skipped; TypeScript typecheck
  passed. The release verifier returned `releaseReady: false`: the local dev
  server added generated `.next-client` includes to `tsconfig.json`, so the
  worktree is dirty, and the ledger bucket is not configured. Later hosted
  gates were not evaluated. Leave that generated change untouched while the
  local server is running; do not mistake a unit-test pass for release approval.

## Memory presentation and export follow-up

- Local source `6afeeac` renders imported source-pack Markdown as readable text
  and links, collapses long source bodies, and blocks embedded images from
  auto-loading. Synthetic Chrome browser checks passed 3/3, TypeScript passed,
  and the live local Memory page showed two compact source records. File-wide
  lint still reports pre-existing hook warnings in `ClientDataWorkspace.tsx`;
  the new browser test file lints cleanly. This source is not deployed.
- On hosted beta revision `agentos-internal-beta-00034-v69`, the signed-in
  `internal-beta` user exported the two Memory records through the UI. Chrome
  reported `internal-beta-memory.md` downloaded successfully (15,090 bytes).
  Local readback found both expected section headings and 112 parsed Markdown
  links. This is a narrow hosted Memory-export observation on the older
  revision, not a full tenant export, current-source acceptance, or a J12
  release receipt.

## October 6 candidate and cleanup

- Candidate `23a3344` is clean and committed locally, not pushed or deployed.
  The canonical root `npm run build` now uses Next's supported Webpack path,
  matching the local client launcher and public-site build. With the client
  container flags, it produced a standalone artifact; pruning removed 235
  disallowed route entries and retained 117, and the trace/route verifier
  passed. A locally started copy of that packaged server passed the
  unauthenticated access-control smoke test: login reachable, private pages
  redirected, and private APIs denied. The temporary smoke server was stopped.
  This is packaged-local evidence, not a Cloud Run revision receipt.
- The source-matched deterministic AI report at
  `tmp/ai-release-local-v1-report.json` records 9/9 cases passed for
  `23a3344`, with no model or Zep calls and `productionReady: false`.
  Focused local tests passed 297/298 with one optional private-input skip.
- The temporary `signBlob` and bucket object-read grants expired at
  `2026-10-06T18:23:41Z`. At 21:25 UTC, readback still showed the exact
  localhost CORS origin. It was removed; subsequent bucket readback contained
  only the pre-existing hosted Cloud Run origin with its original GET, PUT,
  OPTIONS methods, headers, and 900-second cache age. Local browser uploads
  on port 3939 will therefore require a new, approved temporary CORS change.
- The release verifier still returns `releaseReady: false` without a release
  ledger destination. A read-only inventory of `agentos-mvp` buckets found
  the beta object bucket and Cloud Build bucket, not a release-ledger bucket.
  Hosted J01-J15 receipts, current-source deployment identity, complete
  classroom export/import, MiroFish Zep configuration and buyer run, and
  operations/legal approval remain outstanding.
