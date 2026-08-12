# V96 Native Capability-Traits implementation map

This document maps the approved plan to the source implementation and keeps
later waves explicitly gated.

| Plan area | Source boundary | State |
|---|---|---|
| Baseline + capability resolver | `src/lib/capabilityTraits.ts` | implemented |
| STAR repository references | `src/lib/v96RepositoryCatalog.ts` | cataloged; adapters not implied |
| Automatic job attachment | `src/lib/clientDataPlane.ts` | implemented at enqueue |
| Worker enforcement | `src/app/api/internal/client-runtime/jobs/route.ts` | fail-closed validation |
| Operator inspection | `src/app/api/internal/client-runtime/trait-inspection/route.ts` | local/operator only |
| Research evidence | structured research worker output metadata | implemented |
| Knowledge evidence | `src/lib/contextCompiler.ts` snapshot + reviewed activation | implemented |
| Visual-QA persistence | `product-experience/supabase-client-visual-qa.sql` | identifier defect fixed; wave gated |
| Client UX | existing workflow and manifest | unchanged; no skill/tool selector |

## Promotion order

1. Run `npm run verify:capability-traits`, `npx tsc --noEmit`, the focused
   Research/Notebook/SEO suites, security and client-isolation checks, and the
   production build.
2. Deploy the same image to local and owner-cloud test lanes.
3. Run authenticated Research + Knowledge smoke with a fresh query and
   idempotency key. Verify citations, trait evidence, tenant isolation,
   deletion lineage, retry identity, budget settlement, and operator inspection.
4. Record the image digest/revision in `docs/V96-VERIFICATION-REPORT.md` before
   promoting the manifest.
5. Only then advance a catalog entry into a pilot or enabled state.

Visual QA, GPU media, security execution, communications, and resumable
worktrees remain gated. Their repository references are useful contracts, not
permission to run imported runtimes in the Next.js process.
