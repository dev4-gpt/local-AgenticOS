# Product completion ledger

## Problem and goal
Close the user-approved release gaps, then complete provider activation, workflow certification, edition parity, onboarding, local installation and evaluated repository expansion. Catalog presence is not evidence of execution.

## Scope and status
Status: executing. Execution gate: allowed by the user's explicit approval of the seven-phase plan. Target for current deployment work: existing `veloce-cloud-test` only. No new subscriptions, wider access, live payment activation or destructive customer-data drills are authorized by this ledger.

## Acceptance criteria
| Phase | Required evidence | State |
| --- | --- | --- |
| 1 Release | Deployed credential-status update; reproducible configuration; fresh login; authenticated Pipeline/Groq artifact and budget settlement; Jina extraction; ECC output | Functional smoke passed for login, Pipeline/Groq, budget, direct Jina extraction and ECC. Tenant research journey, full drift comparison, general content quality and visual UTF-8 display confirmation remain open |
| 2 Providers | Each enabled provider completes a bounded request with policy, failure and accounting checks; managed-credit activation separately validated | Pending |
| 3 Workflows | Orchestration, media, memory, research, artifacts and delivery have current-release persistence, output, retry and approval evidence | Partial: tenant Notebook save/scoped reload/source chat and one-agent Room fallback/response/settlement passed; other workflows and failure/accounting cases remain pending |
| 4 Edition parity | Shared screens/actions for remaining workspaces, with explicit backend capability differences and matching journey tests | Pending |
| 5 Onboarding | Two disposable tenants complete provisioning, login, BYOK lifecycle and isolation on the same release | Pending |
| 6 Local installation | Clean supported-machine installation, pairing, scoped execution, update/recovery and uninstall | Pending; supported-platform/signing choices required before release |
| 7 Expansion | Each promoted repository/method passes use-mode review and a defined functional/quality/resource acceptance test | Pending; not a promise to install all repositories |

## Current evidence
- Latest acceptance and deployment details: [22 September receipt](release-acceptance-2026-09-22.md) and [23 September Notebook/Room receipt](release-acceptance-2026-09-23.md). Credential readiness and Pipeline format correction are deployed. A second approved Groq build shipped UTF-8 Markdown with settled usage and passed a bounded grounding review; general content quality is not certified. ECC output and direct Jina extraction passed. A Notebook scoping defect was corrected and one current-release scoped note/chat journey passed. Room now gates its roster on tenant execution credentials; one Groq-fallback Hermes round returned a settled response.
- Original deployed source: `94f793e`; see deployment receipt dated 2026-09-21.
- A fresh sign-in was completed by the user in an isolated browser, and the authenticated managed-cloud pages loaded. Session expiry and two-tenant isolation remain unverified.
- Removed obsolete route overrides from the example GCP manifest; the provisioner remains authoritative for isolation routes.
- Fresh focused run: 31 tests passed, including explicit existing-secret binding, no IAM creation for existing secrets, malformed binding rejection, credential readiness and security regressions.
- The private test manifest now represents the restored Jina configuration using an explicit existing-secret binding. No secret value was copied and no IAM grant was added. Explicit runtime environment, derived environment, service image/resources and bucket lifecycle/CORS have been compared. The stale workspace-job image was aligned with the serving release, but not newly executed. The service-wide instance cap remains 20 against the manifest's 1; the provisioner now sets both service and revision caps for future deploys. Queue enqueue permission exists at project rather than queue scope; broader IAM/secret-access review remains.

## Open risks and dependencies
Provider quotas and enabled billing must not be inferred from stored keys. The tenant SEO journey is disabled without an approved search provider even though direct Jina extraction works. Its UI currently queues a Firecrawl-only search job; the Jina adapter only reads URLs returned by an approved search, so a direct client URL-reading mode would require its own scope, host/budget policy, tenant persistence and security review. Historical receipts do not certify current jobs. Local installer distribution may require owner-controlled signing credentials. External approvals must be requested only at their concrete action boundary.
