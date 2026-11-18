# ECC integration and rollout

## Foundation — 2026-09-11

Pinned upstream: [affaan-m/ECC at c9148d0](https://github.com/affaan-m/ECC/tree/c9148d0bb239ed01a95724a5928b98cdf9c30658), MIT. `infrastructure/ecc-upstream.lock.json` records SHA-256, nature, disposition and implementation path for all 3,700 source files. `src/data/ecc-components.json` accounts for 872 components: 291 skills, 68 agents, 107 commands/shims, 122 rules, 277 supporting runtimes, 3 hook configurations, 2 workflows and 2 MCP configurations. The remaining 2,828 files are classified supporting references. Preserved source is not evidence of executable compatibility.

The native Codex plugin `ecc@veloce-ecc`, version `2.2.1-veloce.2`, is installed in the active Codex home. It exposes 291 namespaced skills, 68 on-demand role entrypoints and `ecc:veloce-ecc`. Existing skill names are not overwritten. Role definitions grant no tools, models, permissions or background execution.

The packaging overlay preserves original modified files in `.veloce-upstream-originals/`, copies the MIT license, and writes an ownership/checksum receipt. It removes startup references **and empties default-discovered MCP/hook configuration files**. Removing manifest references alone was insufficient: Codex's plugin specification supplements them with default discovery. Hooks, observers, automatic instinct injection and bundled MCP startup remain disabled. Supporting Node/Python runtimes and provider integrations are preserved references; their dependencies have not been installed or declared operational.

`veloce-ecc` uses explicit checkpoints: scoped reviewed recall, relevant guidance, execution within existing permissions, verification, then a sanitized project lesson proposal. Confidence is not approval. Project lessons do not become global lessons automatically. This developer workflow is not a tenant authorization system.

### Reproduction and removal

Download the exact upstream revision and extract it into a directory without running its installer. Then, from the Veloce repository:

```sh
node scripts/inventory-ecc.mjs /path/to/pinned-upstream
node scripts/verify-ecc.mjs
node scripts/install-ecc-codex.mjs --action install --source /path/to/pinned-upstream --codex-home /path/to/isolated-home
node scripts/probe-ecc-codex.mjs /path/to/isolated-home /path/to/project-a /path/to/project-b
node scripts/install-ecc-codex.mjs --action uninstall --codex-home /path/to/isolated-home
```

Omit `--codex-home` to use the active global home. Installation uses native CLI registration, not the deprecated configuration-copying installer. Reinstallation checks ownership and checksums; a conflicting registration or changed package fails closed. Uninstall removes the owned registration, native cache and receipt-owned source files. It preserves unrelated config, skills, memories and Finder metadata. It refuses a modified package; inspect those changes rather than deleting them blindly.

Use `ecc:veloce-ecc` in a fresh Codex session. Select individual guidance such as `ecc:ecc-search-first` or the role `ecc:ecc-agent-code-reviewer` when relevant. Do not load every skill into context. Existing browser/GitHub integrations remain the execution tools.

### Evidence and limits

[Machine-readable foundation evidence](evidence/ecc-foundation-2026-09-11.json) records:

- CLI 0.143.0 discovery: 360 entrypoints, including 68 role wrappers, in each of two isolated projects and each of two projects using the global installation. Discovery uses `skills/list`, creates no model turn and makes no inference calls.
- Install, repeat install, uninstall and reinstall; unrelated configuration, skill and memory canaries preserved. Global verification found 0 changes across 10,374 existing skill/memory files.
- Native plugin validation passed. Focused tests: 176 passed. Policy gates passed, including ECC coverage/provenance checks.

Discovery proves registration and parsing, not behavioral compliance by every upstream prompt. The 21 previously identified name collisions are contained by the ECC namespace. The native hook path documented upstream for CLI 0.146 is not enabled on 0.143.0. No automatic learning observer or tenant-global memory sharing is introduced.

## Subsequent stage gates

Separate PRs implement adapters/evaluations, tenant learning and lifecycle, product sections/workflows, then deployment acceptance. Product components remain awaiting adaptation/configuration until a registered adapter, exact evidence and tenant policy admit execution. Catalog visibility grants no permission. Unsupported and paid integrations remain gated under the no-new-cost policy.

ECC evidence does not change the GA release ledger. The existing refund-notification defect and outstanding GA acceptance gates remain open; see `ga-live-stripe-verification-2026-09-11.md`.

## Adapter stage — 2026-09-11

`src/data/ecc-adapters.json` is the versioned activation overlay over the unchanged upstream inventory. Seven registered adapters map to six departmental collections and the existing playbook/capability systems. They implement bounded Veloce adaptations, not the entire upstream skill runtime. The authenticated skills API adds `ecc` catalog/availability metadata without changing existing response fields.

`src/lib/eccAdapter.ts` creates hashed artifacts from validated brief/evidence inputs. It measures UTF-8 context bytes, retains source references, identifies missing evidence and instruction-like text, and leaves checklist actions awaiting review. Supplied source hashes are explicitly unverified. Provider calls, external actions and semantic/deployment verification are never claimed. Provider cost is zero; unmeasured infrastructure cost stays null. Tenant enablement and an authorized role are required, and unknown adapters, extra tool/provider/tenant fields and secret-bearing inputs fail closed.

`tests/ecc-adapters.spec.ts` exercises every registration, all six departments, repeatable artifact hashes, missing/unverified evidence, context overflow, unavailable adapters, unauthorized roles, permission-field injection and secret-bearing input. A network tripwire observes zero calls. The focused suite passes 180 tests, and TypeScript checking passes. CI checks the component pin, adapter evidence paths, permitted runtime imports and zero-egress configuration.

This stage provides library adapters and catalog contracts. Authenticated job dispatch, SQL authorization, learning storage and product controls follow in the remaining PRs; no deployed tenant capability is enabled by this source change.

## Learning stage — 2026-09-11

`product-experience/supabase-v43-ecc-learning.sql` introduces tenant policy, learning items and immutable reviewed skill revisions. Authenticated clients have SELECT grants and tenant RLS only; mutation RPCs derive the actor from `auth.uid()`. Members can propose and edit their own lessons; owner/admin roles review, revoke and enable policy. Viewers cannot mutate. Approval requires the exact current PostgreSQL content hash and locks the item against competing reviews. Editing revokes prior revisions and returns the item to proposed status. Confidence never authorizes activation.

Content reads remain authenticated. Worker admission checks the actual job requester, active tenant, policy and worker-token hash. Its lesson validator returns only a boolean and requires exact approved content/hash/revision, active retention and no revocation. It rejects cross-tenant, duplicate, changed and stale snapshots. No public RPC returns lesson content. Prompt-injection fixtures stay untrusted, known secret patterns are rejected, and lesson fields cannot introduce tools or permissions.

For enabled tenants, a terminal-job trigger proposes a fixed structured summary of job identity, capability and status. It never copies prompts, transcripts, unrestricted output or credentials. Source edits invalidate approvals. The original v43 migration cascaded source deletion through dependent lessons and revisions; the v48 retention-reference migration instead detaches source IDs so a learning item keeps its own configured retention clock, capped at 28 days by the current local policy. Automatic outcomes remain proposed at confidence zero. Developer-global promotion has no product endpoint and requires a separately reviewed, sanitized artifact.

`/api/client-runtime/learning` supports authenticated list/create plus edit/review/revoke actions. `?active=1` returns currently approved, unexpired revisions. The API derives tenant identity from the authenticated runtime and rejects tenant/permission fields in requests. Request bodies are bounded before JSON parsing.

The existing lifecycle exporter/restorer includes all three new tables with explicit column lists. Restore disables ECC policy, retains old revisions as revoked evidence, and requires fresh approval. After deploying the relevant retention migrations, `node scripts/client-lifecycle.mjs --mode retention --slug <tenant>` previews runtime records, Notebook sources and containers, structured research rows, due ECC lesson removal, and expired onboarding token hashes. Token hashes are eligible only seven days after their unusable `expires_at` boundary. Apply requires `--apply --confirm-retention-records --confirm-retention-learning --confirm-retention-sources --confirm-retention-notebooks --confirm-retention-research --confirm-retention-onboarding-tokens`; it uses bounded batches and checks the hosted learning-reference guard before purging. Each cleanup scope is a separate database operation; inspect results and rerun after partial failure. Expired instructions are ineligible even before cleanup runs. Rate-limit row expiry and other tenant data classes, exports, backups and vendor copies remain outside this coverage. Offboarding cascades from the tenant record.

Validation: `tests/ecc-learning-sql.spec.ts` executes the migration in PostgreSQL (PGlite) and exercises roles, RLS, hash races, retries/conflicts, immutable revisions, source deletion/invalidation, expiry, restore/offboarding and worker validation. `tests/ecc-learning-api.spec.ts` checks authenticated tenant derivation, role enforcement and bounded inputs. The focused suite passes **186 tests**. The competing-review test uses PGlite's serialized connection; multi-connection live concurrency remains a deployment acceptance check, not a claim of this local test.

At the end of the learning stage, the migration was not yet applied. The deployment sections below record its subsequent live application and acceptance.

## Product stage — 2026-09-12

The existing Context, Capabilities, Govern and Orchestrate sections now expose Learning, Skills & Specialists, Evaluations and Department workflows. The catalog is searchable across all components with departmental and availability filters. Seven bounded adapters cover the six departmental collections; unsupported specialists retain their prerequisites and gated status. Availability requires both runtime capability configuration and tenant database policy.

`/api/client-runtime/ecc` authenticates the tenant and role, gates execution on both `ecc-workflows` and `artifacts`, and dispatches through the existing job/Cloud Tasks system. Retry keys are scoped to the requester, with content-hash conflict checks. The API resolves selected reviewed lessons from the authenticated database rather than trusting submitted content. The worker rechecks requester authorization and exact active lesson snapshots, writes the resulting artifact through existing private artifact storage, and rechecks lessons before completion. Reviewed actions become checklist entries, never tools or spending permissions.

The Learning controls support proposal, editing, exact-hash approval, rejection and revocation. Department workflows accept briefs and optional evidence; persisted results expose missing evidence, context use, measured provider cost and downloadable artifacts. Unmeasured infrastructure costs remain unknown. Container, local-runtime and provisioner API allowlists include the new authenticated routes; a regression test prevents a source-only route implementation from silently disappearing at deployment.

Validation on Node 24.19.0: **189 focused tests passed** (15.8 seconds), including job admission, stale/altered lesson rejection, API role/policy controls, dispatch retries and idempotency conflicts. The browser acceptance test passed (13.7 seconds), exercising all four existing sections and an artifact download with explicit API fixtures. Policy gates, security verification and secret scanning passed. A production webpack build passed, including TypeScript and all 61 static pages. The local Turbopack build could not bind its compiler port under the desktop sandbox; CI retains the standard production build and now runs the browser acceptance test in the existing `verify` job. Browser fixtures and local SQL tests are not live deployment evidence.

Live database migration, enabled test-tenant jobs, multi-connection review races and running-image revision evidence remain the deployment stage. No new paid inference or service was introduced by this stage.

## Deployment stage history — 2026-09-12

This dated snapshot is superseded by the September 13 deployment acceptance below.

Stages 1–4 are merged through [PR #20](https://github.com/dev4-gpt/local-AgenticOS/pull/20), source `3671d70b5be322985cd41ea2799e130c3580a942`. All three required checks passed before merge. [Staged deployment evidence](evidence/ecc-staged-deployment-2026-09-12.json) records the actual image, database checks and zero-traffic revisions.

The exact v43 migration (SHA-256 `95a3f8f2982501c2436f4b41ce7a293b18515207335a45a4fb13853281d0c2c3`) was applied in Supabase project `ppmoqjtmjtfxadsnejqc`. Independent readback found three RLS-enabled tables, fourteen functions, zero direct authenticated write grants, no anonymous learning-content read permission and zero enabled tenant policies. The rollback-only live canary passed **31 checks** against real authenticated/anonymous PostgreSQL roles. A separate query confirmed zero remaining fixture tenants, users and learning items after rollback. This live test does not claim multi-connection concurrency coverage.

The local linux/amd64 image build succeeded with the standard Turbopack build. Its merged-commit label matches the identical tested source tree. Registry digest: `sha256:0fa07713ef814ce0423874fec16f47bee41145b4feaab4a44f1127e2f6d14bdd`. The staged revisions are `veloce-cloud-test-ecc3671` and `veloce-dofgfood-ecc3671`. Five protected endpoints returned 401 on the local container, and all ten corresponding staged endpoint checks returned 401. Other container configuration and service accounts were compared and preserved.

**This is not production promotion or completed acceptance.** Original revisions `veloce-cloud-test-00210-pez` and `veloce-dofgfood-00005-vec` retain 100% production traffic. The staged runtime permits the ECC capability, but tenant database policy remains disabled. Authenticated two-tenant artifacts, concurrent review, fixture cleanup and final running-revision verification remain pending. The live verifier `scripts/verify-ecc-runtime.mjs` requires explicit private owner/member/viewer cookie files for each test tenant; it never substitutes fixtures for a passing live result. Its cleanup records exact test identifiers for independent database cleanup.

| State | Evidence / boundary |
| --- | --- |
| Installed globally | 291 namespaced skills, 68 role entrypoints and the workflow; two-project discovery evidence in foundation receipt |
| Implemented and source-verified | 872 catalog dispositions; seven bounded adapters, learning APIs/lifecycle and four existing product sections; PRs #17–20 |
| Live database-verified | v43, 31 rollback-only role/RLS/lifecycle checks and independent cleanup |
| Staged | Two running zero-traffic revisions with the new digest and protected-route checks |
| Still gated | Tenant activation, authenticated deployed artifacts, multi-connection acceptance and final production rollout; unsupported upstream runtimes/hooks/MCPs and paid functionality |

The local HTTP smoke test initially met a temporary automatic-approval usage limit and succeeded when review became available again. Automatic approval separately rejected creating six temporary owner/member/viewer users in the existing test tenants and persisting a production service key. Specific user approval was requested for the test accounts and temporary login allowlists; the proposed implementation keeps the service key in memory. No such accounts were created by that rejected action. The rollback-only SQL canary used isolated fixtures in one rolled-back transaction.

The live verifier now downloads each artifact from its authenticated signed GCS URL and checks the stored content/hash against the job record. This avoids a false failure from PostgreSQL JSONB reordering object keys. The focused regression uses an actual PostgreSQL JSONB round trip and also rejects changed artifact content, changed metadata and mismatched evaluation hashes (1 test passed, 2.7 seconds). Signed URLs and session cookies are excluded from evidence.

## Deployment acceptance — 2026-09-13

[Production deployment evidence](evidence/ecc-production-deployment-2026-09-13.json) records completed acceptance on the two existing test tenants. The runtime source remains `3671d70b5be322985cd41ea2799e130c3580a942`, tree `9847d00ec65a46f680dcf8e09c4f09d54e1b0ae4`, image digest `sha256:0fa07713ef814ce0423874fec16f47bee41145b4feaab4a44f1127e2f6d14bdd`. Later Stage 5 commits change verification and evidence, not this deployed application code. No separate Vercel application deployment was needed for these tenant-runtime features.

| Tenant | Final Cloud Run revision | Traffic | Retained rollback revision |
| --- | --- | --- | --- |
| `veloce-cloud-test` | `veloce-cloud-test-ecc-ga0913` | 100% | `veloce-cloud-test-00210-pez` |
| `dofgfood` | `veloce-dofgfood-ecc-ga0913` | 100% | `veloce-dofgfood-00005-vec` |

The user explicitly approved six temporary accounts (owner, member and viewer per tenant) and temporary login allowlists. No invitation emails were sent. The production service key was loaded only into the fixture process environment; private session cookies were removed after account deletion. The approval-review usage limit temporarily interrupted cleanup; it resumed after the reset and finished with independent readback.

The authenticated suite ran from `2026-09-13T04:50:47.438Z` to `04:55:39.947Z`: **183 checks passed**, with all seven adapters producing a real artifact in each tenant (**14 artifacts**). The suite used authenticated application endpoints and existing Cloud Tasks workers. Each artifact was downloaded from private storage and verified against its expected content hash and database metadata. Exact IDs and hashes are in the receipt. Missing source evidence stayed missing, `releaseReady` stayed false, and no external inference was used.

Real concurrent HTTP review requests produced one successful approval and one conflict per tenant. Viewer writes and member review attempts failed; cross-tenant sessions failed; confidence did not activate a proposal. Retry keys returned the same job, changed submissions conflicted, and dispatch using a revoked lesson failed. Automatic outcomes remained proposed at confidence zero without copying input briefs.

After restoring the original login allowlists and normal Cloud Tasks base URLs, the final revisions were promoted. **14 additional worker checks passed** from `05:01:51.725Z` to `05:02:29.829Z`. These checks used authenticated member database admission and the existing OIDC-authenticated production task queue to create one fresh job per final revision. Both workers completed and their stored artifact bytes matched. Temporary fixture login was correctly denied on the restored application allowlist. This additional probe verifies the final production worker path; it is not presented as a second complete browser suite.

Cleanup passed **28 checks**: six Auth users and memberships, 18 learning items, two dependent reviewed revisions, 16 jobs, 14 fixture audit events, 20 fixture rate-limit rows, and the last two artifact metadata rows were removed. The original 14 artifacts had already been deleted through the authenticated artifact API; the two final worker objects were also deleted. Readbacks found no fixture users, memberships, lessons, revisions, jobs, artifact metadata, audit/rate rows, storage objects or queued tasks. The fixture jobs created no financial ledger entries. Six local cookie files were deleted. Only the two intended tenant ECC policies remain enabled.

Final configuration readback at `2026-09-13T14:58:19.370Z` passed **14 checks**: the proven revisions retain 100% traffic and the immutable digest, original environment and service accounts match, temporary routing tags and OIDC audiences are removed, and anonymous access still returns 401. Both services retain their existing maximum of one instance; no new always-on infrastructure was introduced. Provider inference cost was zero. Infrastructure cost is unmeasured and remains null; existing GCP trial credits were authorized, so this is not a claim that all cloud execution is inherently free.

### Acceptance scope and evidence

| Plan requirement | Evidence and actual scope |
| --- | --- |
| Full pinned inventory and licensing | `ecc-upstream.lock.json`, `ecc-components.json`, `verify-ecc.mjs`: 3,700 files, 872 component dispositions, MIT provenance, dependency/configuration gates |
| Global native installation and isolation | Foundation receipt: 360 namespaced entrypoints in two isolated and two global project contexts; repeat install/uninstall; 10,374 unrelated files unchanged; no inference turns |
| Reviewed packaging and compatibility | Native plugin 2.2.1-veloce.2 on CLI 0.143.0; preserved originals and checksums; hooks/MCP defaults empty; no unverified 0.146 hook behavior claimed |
| Department artifacts and unavailable features | Seven deterministic adapters, six departments; 14 authenticated deployed artifacts plus two final worker artifacts; unsupported adapters and provider/tool fields fail closed in adapter/API tests |
| Tenant, role and exact-hash controls | v43 real PostgreSQL canary: 31 checks; deployed role/cross-tenant/concurrent-review tests; `ecc-learning-sql.spec.ts` covers altered, expired and revoked revisions and immutable review records |
| Learning safety and lifecycle | SQL/API tests cover injection, secret-bearing proposals, source edits/deletion, duplicate proposals, export/restore, retention and offboarding; live canary confirms role/RLS and rollback cleanup. Export/restore is locally tested, not a claim of a live production restore |
| Product integration | Existing Context, Capabilities, Govern and Orchestrate sections; browser acceptance with explicit fixtures; deployed authenticated APIs, job workers and artifact storage verified separately |
| Cost and evaluation discipline | Deterministic test network tripwire, zero-inference adapter contract, real output metrics; missing evidence never becomes a pass; no paid model judges |
| Deployment and rollback | Actual revision/digest/traffic readback, final worker artifacts, restored login settings, fixture cleanup; prior revisions retained |
| Delivery workflow | Separate PRs #17–20 merged with all three required checks; Stage 5 PR #21 contains the final verification and receipt and must meet the same checks before merge |

### Eligible client rollout and rollback

The two existing test tenants are enabled. Other tenants remain gated until their existing approved runtime configuration includes both `ecc-workflows` and `artifacts`, their deployed image contains these routes/worker adapters, and an authenticated owner/admin enables ECC through the existing Orchestrate controls (`PATCH /api/client-runtime/ecc`, body `{"enabled":true}`). Apply the existing manifest approval/deployment workflow and repeat tenant-specific acceptance before enabling a client. Catalog visibility alone is never permission, and these receipts do not certify untested client configuration.

For an ECC-only rollback, an owner/admin disables the tenant policy with the same endpoint and `{"enabled":false}`; workers recheck this gate. For an image rollback, use `gcloud run services update-traffic <service> --to-revisions <retained-revision>=100 --project veloce-agenticos-2026 --region asia-south1` with the exact retained revision above. Preserve the v43 tables and learning evidence; an image rollback does not require deleting tenant data. Re-enabling requires current configuration and acceptance evidence.

**Installed:** all 291 namespaced guidance skills, 68 role entrypoints and the global workflow. **Activated and deployment-verified:** seven bounded departmental adapters and governed learning on the two test tenants. **Still gated:** automatic hooks, observer/injection, bundled MCP startup, unadapted specialists and paid/unconfigured integrations. A role definition does not grant tools or start an agent. Global learning promotion remains a separately reviewed, sanitized artifact.

ECC deployment acceptance does not close the refund-notification defect, replace GA journey/sign-off evidence, or produce legal review or SOC2 attestation. The separate GA release ledger remains `releaseReady: false`.
