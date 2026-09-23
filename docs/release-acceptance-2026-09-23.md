# Release acceptance — 23 September 2026

Status: executing for the seven-phase product scope. This receipt covers bounded tenant Notebook and one-agent Room journeys on the existing test service, not application-wide certification.

## Defect and correction
- In the authenticated client Notebook, creating `Acceptance notebook 2026-09-23` worked, but saving a synthetic note with that notebook selected placed it in the unfiled/all-sources collection. The client save request omitted `notebookId`; the API already stored a notebook link when one was supplied.
- Source `5c41f96` sends the selected notebook ID from the Library form. The records API now rejects malformed notebook IDs and verifies an active notebook belongs to the current tenant before linking. The initial unfiled synthetic note was retained, not deleted or silently moved.
- Regression checks were red before the edit and 2/2 green after it. The provisioner suite was 5/5 green, TypeScript passed, and a production Webpack build exited successfully. The default Turbopack build failed locally because its CSS processing could not bind a port under the sandbox; that is not evidence of a source compilation error.

## Test deployment and runtime evidence
- Cloud Build `64a85835-54ee-4466-930f-fd09fab293cb` succeeded for source `5c41f96`, producing image `sha256:e264db7ae0a8aec5e8ae45c4807848a9bfbd19908ec5fbe2a126726ced4e12b4`.
- Revision `veloce-cloud-test-acceptance-5c41f96` was staged at 0% traffic. Staged anonymous checks returned status/login 200, Notebook redirect 307, and records API 401. It was then promoted to 100% on `veloce-cloud-test`; older revisions remain at 0%. A fresh live `/status` returned 200. The workspace job was aligned to the same image digest without executing it.
- In the authenticated browser, a new `Scoped acceptance source · Cedar Lantern` note saved with the acceptance notebook selected appeared as the sole record in that notebook. After a page reload, the selected notebook still showed exactly one article: the scoped note; the earlier unfiled note was absent from that scope.
- Notebook Chat offered exactly one source in that scope. After selecting it, a bounded question returned the codename Cedar Lantern, a target of seven consenting interviews, and no set launch date—all supported by the synthetic note. No external search, outreach, publication or purchase was requested. This verifies one source-grounded chat response, not general answer quality, usage accounting, or every Notebook tab.

## Remaining
Provider activation, search-backed tenant research, the wider workflow matrix, edition parity, two-tenant onboarding, local installation and repository expansion remain open. The Cloud Run service-wide instance cap remains 20 while the active revision cap is 1; no live cap change was made. Other IAM/secret-access drift checks are still open.

## Room credential-readiness correction
- The authenticated Room offered Hermes on OpenRouter, but a bounded `@hermes` round failed `provider_not_configured`. The roster previously checked the provider/model allowlist without checking tenant execution activation and key availability.
- Source `25c0d61` checks tenant execution credentials before offering a persona, and resolves an approved, ready fallback when its preferred provider cannot execute. It never sends credential values to the browser. Room creation, roster changes and message dispatch all use the current readiness-aware roster. The Room body copy now explains fallback; the page-level introduction still uses the older “each on its own approved model” wording and needs a copy correction.
- The new source-contract tests were red before the change, then the focused Room suite passed 18/18; TypeScript and the production Webpack build passed. Cloud Build `d01d2f4f-f5f7-4844-8e72-9e996a5d7341` succeeded, producing `sha256:985f01b370f2cac61838394162fa322678260d4d8abd0cb08d10e73470b30da8`.
- Revision `veloce-cloud-test-acceptance-25c0d61` passed zero-traffic status/login 200 and anonymous Room API 401, then received 100% test-service traffic. The workspace job was updated to the same image digest after its prior execution completed; that update did not itself execute the job. Fresh service and job descriptions confirmed the digest and 100% traffic.
- After reloading the authenticated Room, all six personas showed the tenant's approved Groq fallback (`openai/gpt-oss-120b`) rather than unavailable primary providers. A bounded `@hermes` retest returned one sentence about governance drift, with approximately $0.0002 settled in the chat. The earlier failed round remains in history. This certifies one successful Room round and fallback behavior, not all six personas, native provider models, side effects, retries, or general answer quality.
