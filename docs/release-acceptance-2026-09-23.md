# Release acceptance — 23 September 2026

Status: executing for the seven-phase product scope. This receipt covers one bounded tenant Notebook journey on the existing test service, not application-wide certification.

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
