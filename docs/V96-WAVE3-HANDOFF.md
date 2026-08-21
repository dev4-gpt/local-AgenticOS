# Wave 3 handoff — named loop registry

**Historical handoff.** This document is retained for provenance. Wave 3 has
since landed on `main`; use the current state below rather than the original
“not started” instructions.

**Date:** 2026-08-13

---

## State right now

| | |
|---|---|
| **HEAD** | Current `main`; corrected image evidence is recorded in the verification report |
| **`origin/main`** | Current `main`; local changes are pushed |
| **Live cloud** | `veloce-cloud-test-00158-24s`, 100% traffic; image digest is recorded in the verification report |
| **Repo** | `/Users/aryamandev/Documents/Codex/Projects/AgentOS/source` |
| **Waves 1 and 2** | complete and **accepted** |
| **Wave 3** | **implemented and accepted; hosted-loop cloud smoke passed on revision `00158-24s`** |

Verify before trusting any of it:

```bash
git log --oneline -3 && git rev-list --left-right --count origin/main...HEAD
gcloud run services describe veloce-cloud-test --region asia-south1 \
  --format='value(status.latestReadyRevisionName)'
npm run test:focused && npm run verify:references
```

---

## Wave 3: make Loop reachable with named templates — landed

Wave 1 added `loop` to `ClientIntentSurface` and put three playbooks behind it,
so the router *can* select the Loop lane. Named contracts now live in
`src/lib/clientLoopRegistry.ts`, and the hosted worker consumes their budget
and stop decisions. `/loop` remains a free-text goal box, but the default
contract is applied server-side; no client skill or tool selector was added.

The source is [15 AI loops worth stealing](https://learnaiwithmariah.com/guides/ai-loops-worth-stealing/).

### Build

`src/lib/clientLoopPlaybooks.ts`, in the existing `ClientPlaybook` shape from
`src/lib/clientPlaybooks.ts`, running on `src/lib/clientLoopAdapter.ts`
(`LOOP_MAX_ROUNDS = 5`, `LOOP_DEFAULT_ROUNDS = 3`, `LoopVerdict { pass; score;
issues; summary }`). Reusing that adapter is what makes the work parity-correct
by construction — it is the same code in both environments.

### Catalogue, do not rebuild

Most of the fifteen already exist unnamed. Naming them is the deliverable;
reimplementing them is waste.

| Loop | Status in Veloce |
|---|---|
| Plan-Generate-Verify-Fix (hard cap) | **Exists** — `clientLoopAdapter`, `LOOP_MAX_ROUNDS` |
| Human-in-the-loop approval queue | **Exists** — the approval boundary |
| Adversarial review / verifier | **Exists** — `loopEngine` builder+judge, **local only**, needs a hosted twin |
| Goal-meta-skill (vague → verifiable goal) | **Is the intent router** |
| Completion contract (no success claim without evidence) | **Is the house rule** |
| Anti-spin (stalls, retries, contradictions) | **New** — pairs with the `drift-guard` trait |
| Quality streak (N consecutive clean passes) | **New** |
| Build-Test-Fix, roborev, production error sweep | Operator plane — repo-mutating, not client-safe |

Only client-safe loops become playbooks.

### Rules that already bind this work

- Every playbook's `requiredTraits` is **enforced** — `missingRequiredTraits`
  in `capabilityTraits.ts`, checked in the intent worker before *both* dispatch
  and `ready`. A loop declaring a trait its capability cannot resolve fails
  closed.
- `eligibleCapabilities` must already exist in the manifest. A playbook may not
  invent a capability.
- No shared registry may reach an operator-filesystem lane —
  `tests/lane-parity.spec.ts` walks the import graph and fails on
  `os.homedir()` / `~/.hermes` / `process.env.HOME`. **`loopEngine` is exactly
  such a lane**, so a loop playbook must go through `clientLoopAdapter`, never
  `loopEngine`.
- New files must be added to the **lint allowlist** in `package.json` or they
  are silently unlinted, and to `test:focused` / `verify:references`.

---

## Verification

```bash
npm run test:focused && npm run verify:references
npm run typecheck && npm run lint && npm run build
node scripts/verify-client-runtime-worker.mjs && npm run verify:security
PW_USE_EXISTING_SERVERS=1 npx playwright test tests/ --reporter=line   # 311+ expected
npm run verify:parity:local && npm run verify:parity:cloud
```

Local parity needs the launcher fully configured — it will name anything
missing:

```bash
CLIENT_SLUG=<slug> CLIENT_ALLOWED_USER_EMAILS=<email> CLIENT_MODEL_ALLOWLIST=<models> \
  npm run dev:client-runtime -- --env-file ~/.veloce-supabase.env --port 3939
```

**Verify every new gate by breaking it.** A gate never observed failing is not a
verified gate. Both Wave 1 gates and the Wave 2 filesystem guard were confirmed
by planting a violation and watching the right test fail.

---

## Traps — do not re-pay for these

- **A correct fix in the repo is not a correct deployment.** Compare the image
  build time to the commit time before believing any live test. Hit twice here.
- **`git checkout -- <file>` destroys uncommitted work.** It cost a full
  re-implementation of `clientPlaybooks.ts` in this session. Back up first, or
  revert with a precise inverse edit.
- **Codex works this repo concurrently.** A broad `git add -A` swept 11 of its
  in-flight files. **Stage explicit paths**, then check `git diff --cached
  --name-only` before committing.
- **`workspace-execution-write` is 12 per 900s.** Two parity sweeps in a row
  return `429` — the guard working, not a failure. Wait ~15 min between runs.
- **A bare HTTP status hides the cause.** A `503` meant `task_base_url_not_public`,
  not "service down". The parity script now reports error codes; keep it that way.
- **Job state is nested under `job.status`.** A top-level poller sees `""` and
  records a false hang.
- **Loop reports `passed`, not `succeeded`.**
- **Before blaming the UI for a visual test failure, confirm the page loaded its
  stylesheet.** A dead server produced eight failures misread as design
  regressions.
- **n=1 per cell is not evidence.** Vary one thing.
- iCloud resurrects `name 2.ext` and `name 2`. Both are gitignored now. **Never
  `rm` an untracked file here without diffing it first.**

---

## Gated — leave unchanged

Visual QA cloud promotion, GPU, Supervision enhancement, security execution,
communications, worktrees, streaming speech. **Crawl4AI and Crawlee** remain
pinned Apache-2.0 catalog references only. Jina Reader now has an isolated
owner-cloud worker and a passing authenticated Brave→Jina smoke on
`veloce-cloud-test-00168-h5t`; budget reservation/settlement, two-tenant
isolation, deletion lineage, and manifest rollback have now passed. The full
Jina external-worker evidence bundle is closed. **Brave Search** is
cloud-enabled with its Secret Manager binding and authenticated smoke.

The current image has passed the shared authenticated workflow, provider
compression, intent-routing, hosted-loop, Brave, and Jina worker smoke.
Visual QA and full tunnel-parity remain separate work.
Waves 4A/4B/4C and 5A/5B are implemented and locally verified; their
specialized provider and operator-runtime evidence remains bounded by the
gates below. This is an evidence-status boundary, not permission to activate
the separately gated runtimes.

## Related

- [External corpus integration](./V96-EXTERNAL-CORPUS-INTEGRATION.md) — dispositions, waves, links
- [Verification report](./V96-VERIFICATION-REPORT.md) — what is proven, against which revision
- [Local-to-cloud product model](./local-to-cloud-client-product-model.md) — graduation contract, guardrails
- [Capability reference register](./future-integrations/v96-capability-reference-register.md)
