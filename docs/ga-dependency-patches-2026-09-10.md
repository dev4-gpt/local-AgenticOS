# Dependency security follow-up, 2026-09-10

PR #14's first CI attempt failed on dependency audits, after the source-only
deployment evidence change. The advisory database had changed since the
earlier passing checks. Actual failed runs:
[application](https://github.com/dev4-gpt/local-AgenticOS/actions/runs/34302419958)
and [runtime](https://github.com/dev4-gpt/local-AgenticOS/actions/runs/34302419984).

Targeted repairs in both Next.js package trees:

| Dependency | Resolved version | Reason |
| --- | --- | --- |
| Next.js / eslint-config-next | 16.3.4 | Patch the newly reported Next.js vulnerabilities; keep lint tooling aligned |
| Sharp | 0.35.4 | Patched image-processing dependencies |
| js-yaml | 4.3.2 | Patched merge-source CPU limit, retaining the existing major version |
| Hono | 4.13.7 | Patched body/query parsing and static-output advisories |
| brace-expansion, affected 1.x instances | 1.1.18 | Remove the application's obsolete 1.1.12 override so compatible resolution is patched |

Primary maintainer evidence:
[Next.js image optimization advisory](https://github.com/vercel/next.js/security/advisories/GHSA-2xp9-vwfh-vxw4),
[Sharp advisory](https://github.com/lovell/sharp/security/advisories/GHSA-rgj7-g3m4-5g8c),
[js-yaml advisory](https://github.com/nodeca/js-yaml/security/advisories/GHSA-2883-xcg3-v3hh).
No exploitability finding against a particular live deployment is inferred
from an audit's package-range match; the affected dependencies are patched.

The [fresh audit evidence](evidence/ga-dependency-audit-2026-09-10.json) records
zero findings in **both full dependency trees**, including dev dependencies.
All 174 focused tests, security verifiers and policy gates passed locally.
The runtime production build and application lint/typecheck/production build
also passed. The first sandboxed application build could not fetch its existing
Google Fonts inputs; it passed with the required network access.
Both lockfiles were regenerated. No audit exclusions, severity reductions,
forced major-version audit fixes, or CI bypasses were introduced.

**Deployment completed:** all required PR checks passed, PR #14 merged as
`9ba8d46`, and the patched application and both tenant services were deployed.
See [the deployment evidence](ga-production-deployment-2026-09-10.md).
The September 9 evidence remains historical for `e72140e`. Remaining live
Stripe authentication and whole-product acceptance/sign-off gaps still apply.
