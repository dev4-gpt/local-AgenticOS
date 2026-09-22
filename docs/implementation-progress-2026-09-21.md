# Implementation and verification — 21 September 2026

Status: source increment `94f793e` deployed to `veloce-cloud-test`; full product completion remains outstanding. See [deployment receipt](deployment-receipt-2026-09-21.md) for current live configuration and verification limits. Provider-readiness UI changes are a separate, not-yet-deployed increment.

## Implemented

- Pipeline uses the same workspace component for local and cloud, with a browser-safe transport translating local slugs, dates, actions, and artifact paths into the shared contract. Board, artifact gallery, capture, pin, review, build, and artifact access share the screen. Storage and execution backends remain separate.
- Local APIs reject building before approval and approval outside review. Non-project classification now also reaches review rather than being silently shipped.
- Shared navigation and headers receive edition state from the server. Removed three redundant credential lookups used to infer the edition after rendering. Edition labels distinguish Private Local and Managed Cloud.
- GTM planning methodology now runs in local planning as well as hosted planning. Local model failure produces an explicitly untested GTM template requiring evidence and human review. This is not upstream MiroFish simulation or validated customer research.
- Case-normalized catalog joins repair Crawl4AI and Open-Generative-AI classification without bypassing unresolved license gates.
- Groq credential label now identifies text and speech support. Existing key/adapter work is preserved; no live-generation claim is made.

## Verification

- TypeScript: passed.
- Focused lint on the shared pipeline, transport, methodology, portfolio, and transport tests: passed.
- 36 focused tests: passed, covering pipeline contracts/transport, GTM, portfolio identity, provider catalog, Groq policy, and filesystem separation.
- Production build: `next build --webpack` passed on the final application changes. Default Turbopack failed because its CSS worker could not bind a local port, including on the escalation retry.
- Browser: local production pipeline rendered the shared UI and an accurate storage-setup state.
- Isolated production-server acceptance: capture, pin, persisted reload, and rejection of unreviewed approval/build requests passed. No model calls. The test created and removed only its own item; removal was verified. Reusable verifier: `scripts/verify-local-pipeline.mjs` (run against a loopback server with an isolated `AGENTIC_OS_VAULT`).
- Live login endpoint returned HTTP 200. Chrome already had an authenticated client session; credentials page loaded successfully. This is not a fresh-login/password-reset certification.

## Pre-deployment observations (superseded where noted in the deployment receipt)

- Current cloud traffic remains on `veloce-cloud-test-00197-fwx`. None of this increment was deployed.
- Groq secret binding and model/provider allowlists exist; provider calls are enabled at runtime. The credentials page nevertheless reports provider connections unconnected. Tenant connection activation must be reconciled and actual generation verified before describing Groq as production-ready.
- Cloud pipeline defaults to OpenRouter because `CLIENT_WORKSPACE_PROVIDER` is absent. Adding a Groq key does not select it for the pipeline.
- Research worker configuration is empty; `ecc-workflows` is absent from enabled capabilities. Restore from a validated tenant configuration and verify the workers, avoiding another overwrite from a stale manifest.
- Strict release check fails: uncommitted source, missing current-release ledger record, and missing release-environment evidence. These gates were not bypassed.
- Remaining workspace families still have separate local/cloud bodies. This increment establishes Pipeline parity, not application-wide parity. A full shared workflow migration, local installer/bridge hardening, and current-release end-to-end certification remain.
- Repository expansion beyond the repaired joins remains the prioritized work in the adoption audit; reference-only counts are not production-completion percentages.

Prior analysis and reasons: [edition parity plan](native-capability-and-edition-parity-plan-2026-09-21.md) and [repository adoption audit](repository-adoption-audit-2026-09-21.md).
