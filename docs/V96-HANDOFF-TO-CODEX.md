# V96 handoff — the base is clean, the STAR work can start

**Written for the session that picks up the STAR portfolio.** V96 close-out is
finished. This file says what is true right now, what was fixed getting here,
and the small number of things still open. It is deliberately short; the detail
lives in [V96-VERIFICATION-REPORT.md](V96-VERIFICATION-REPORT.md) and
[V96-EXECUTION-LOG.md](V96-EXECUTION-LOG.md).

**Date:** 2026-08-11

---

## State

| | |
|---|---|
| **Live** | `veloce-cloud-test-00139-w6s` · `v101-plan-artifacts` |
| **Tests** | **250 passing, 0 failing** |
| **Build** | clean · three security gates passing |
| **`npm audit --audit-level=high`** | exits 0 (3 moderates remain) |
| **Next.js** | 16.2.12 |
| **Surfaces** | 26/26 verified live (on `00138-68l`; unchanged since) |
| **Media lanes** | 4/4 verified by magic bytes |
| **Provider lanes** | **8/8** complete a workspace execution |
| **Spend** | $0.385 of the $10 cap |

Everything above is verified against a named revision. A claim without one has
expired — that rule exists because three claims in the log had quietly rotted.

---

## What was fixed getting here

**A Next.js middleware bypass, live in production.** `next` was pinned to
16.2.6 against nine advisories covering `<16.2.11`, including a middleware/proxy
bypass. `src/middleware.ts` is where the client route allowlist and auth
enforcement run, so that was a bypass of the tenant boundary — the same boundary
that keeps a client session out of `/api/integrations`, which writes operator
credentials. Now 16.2.12.

**Four of eight provider lanes could never complete a workspace execution.**
Providers with `toolMode: "reviewed-plan"` get a *forced* tool choice, so the
model cannot return prose; its output is a JSON envelope with no fenced block,
and `artifactFromWorkspaceOutput` required a fence. Forced tool-calling and
fence-based extraction were mutually exclusive by construction. Fixed by
rendering the plan as markdown, verified live: all 8 lanes now succeed where 4
failed every time.

**Nineteen test failures, none of them product defects.** Ten because there was
no Playwright config at all; eight because a `next-server` started 17 days
earlier held port 3737 and served no stylesheet; one genuine test drift.

---

## Still open — read before starting

### 1. `parseLoopVerdict` and the pipeline shape parser (bug, scoped out)

The reviewed-plan fix covers the **artifact** path only. The same four providers
also feed `parseLoopVerdict` (`src/app/api/internal/client-runtime/jobs/route.ts`
around line 452) and the pipeline shape parser, which receive the same envelope
and fail with `loop_verdict_unparsable` / `pipeline_shape_unparsable`.

Two call sites at `jobs/route.ts:359` (Ruflo) and `:470` (Loop) tolerate a null
artifact with `if (artifact)`, so they **silently drop a report** rather than
failing. That is worth changing regardless of the parsers.

### 2. Supervision visual QA — deferred by decision, not oversight

`V96VisualQaReport` is a ready contract imported by nothing. Building it means
turning `provision-gcp-client.mjs` from a one-service deployer into a
multi-service one, plus a lifecycle table and route registration in three
places. **Decided: defer until a client asks.** Do not re-cost it.

### 3. Three moderate advisories

`@tailwindcss/postcss`, `next`, `postcss` — below the CI threshold. The `next`
one needs 16.3.0, a minor bump.

### 4. Housekeeping

The repo lives in iCloud Drive, which resurrects deleted files as `name 2.ext`,
including stale copies of real source. Now covered by a `.gitignore` pattern
rather than the per-clone `.git/info/exclude` it used to rely on. **Never `rm`
an untracked file here without diffing it first** — one turned out to be a
superseded July snapshot, another was byte-identical.

---

## Traps that cost real time — do not re-pay for these

- **A correct fix in the repo is not a correct deployment.** Compare the
  deployed image's build time against the commit time before believing any live
  test. This project has hit it twice.
- **Before blaming the UI for a visual test failure, confirm the page loaded its
  stylesheet.** A dead server produces failures that look exactly like design
  regressions — eight did, and all four of the first diagnoses were wrong.
- **n=1 per cell is not evidence.** The provider defect was misread twice
  (surface-specific, then "probably nondeterministic") before an isolation test
  holding everything but the provider constant gave the real answer.
- **Job state is nested under `job.status`,** not top level. A poller reading the
  top level sees `""` and records a false hang.
- **Loop reports `passed`, not `succeeded`.**
- **`workspace-execution-write` is 12 per 900s.** 26 surfaces cannot be swept in
  one window by design.
- **Artifact download is a 302 to a signed `storage.googleapis.com` URL.** Read
  the `Location` and fetch it *without* the cookie — a plain `curl -L` forwards
  headers to the redirect target.
- **`grep -icE "python|pip" Dockerfile.client` returns 1 and it is a false
  positive** (`/pipeline` in a route list). Anchor to `^(FROM|RUN)`.
- **Verify a gate by breaking it.** Every gate here was confirmed by planting a
  violation and watching it fail.

---

## Starting the STAR work

`V96-INFRASTRUCTURE-STAR-PLAN.md` is Codex-owned and defines the portfolio and
merge order. Its steps 2 and 3 are done: typed contracts exist in
`v96Contracts.ts`, and the curated Agency skill pack ships with an enforced
closed tool vocabulary — a role cannot widen platform permissions, and that is
asserted by a test that was verified by planting `execute-shell`.

The next unstarted item in that order is **step 4, the Hermes Content Factory
plan**, run through the existing Hermes SEO/Kanban path with publication
disabled until approval.

**Deploy loop:** build with `CLIENT_IMAGE=…:vNN-name`, bump `gcp.image` and
`VELOCE_RELEASE` in `.private-client-kits/veloce-cloud-test.gcp.json`, run
`node scripts/validate-client-manifest.mjs`, then
`npm run provision:gcp-client -- --config … --phase deploy --apply`. A
config-only change needs no rebuild.

**Never handle the owner's key values.** Create the secret container and IAM,
then hand over a `printf … | gcloud secrets versions add … --data-file=-`
one-liner. Secret names are prefixed `veloce-veloce-cloud-test-<name>`; the bare
name is not read.
