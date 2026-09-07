# SOC2 readiness self-assessment

**This is a self-assessment, not a SOC2 report.** SOC2 Type I/II attestations
can only be issued by a licensed CPA firm performing an AICPA attestation
engagement. Nothing in this document is a substitute for that, and it must
not be represented to customers or investors as "SOC2 certified" or "SOC2
compliant" -- accurate language is "SOC2-ready, self-assessed, third-party
audit pending."

Purpose: map what this engagement has already built and *proven with live
evidence* against the AICPA Trust Services Criteria (2017, as revised
2022), so that (a) the honest current state is visible, (b) real gaps are
named rather than glossed over, and (c) a future paid audit has less
ground to cover, not more.

Every row below cites the actual file, commit, or runbook section that is
the real evidence -- not a claim. Where there is a genuine gap, it is
stated as a gap, not implied to be covered.

## Security (Common Criteria) -- mandatory for every SOC2 report

### CC1 -- Control environment
- **Gap.** No formal, written organizational policies exist (code of
  conduct, acceptable use, background-check policy, org chart, board
  oversight). This is organizational work, not code -- a template set
  (many free ones exist, e.g. via GitHub search for "SOC2 policy
  templates") plus an afternoon of adapting them to this company is
  realistically how this gets closed, not more engineering.

### CC2 -- Communication and information
- **Covered.** Extensive real runbooks document objectives, roles, and
  known risks: `docs/production-operations.md`,
  `docs/gcp-client-runtime-runbook.md`,
  `docs/v3.3-managed-credit-lifecycle-runbook.md`,
  `docs/staging-environment-runbook.md`. These are not written for this
  assessment -- they are the actual operating documentation used
  throughout this 100-day engagement, each backed by live evidence.

### CC3 -- Risk assessment
- **Covered.** Automated policy-as-code gates run on every change:
  `scripts/verify-license-compliance.mjs`,
  `scripts/verify-provider-egress-budget.mjs`,
  `scripts/verify-client-runtime-tenant-boundary.mjs`,
  `scripts/verify-integration-catalog-contract.mjs`, wired into CI via
  `npm run verify:policy-gates` (`.github/workflows/control-plane-image-deploy.yml`,
  `.github/workflows/security-release.yml`). Provider integrations carry an
  explicit `riskTier` (Phase 4, `infrastructure/integration-control-plane.manifest.json`).
- **Partial gap.** No formal, written risk-assessment *process document*
  (who reviews, how often, sign-off). The automated gates are real risk
  controls; the paperwork describing the process around them isn't
  written yet.

### CC4 -- Monitoring activities
- **Covered.** CI runs `verify:secrets`, `verify:security`,
  `verify:policy-gates`, and the full focused test suite (158 tests) on
  every push and PR (`security-release.yml`, `product-experience.yml`).
  Pre-build and pre-deploy drift-detection gates
  (`scripts/verify-control-plane-cloud.mjs`) refuse to build or promote on
  top of a silently-drifted environment.

### CC5 -- Control activities
- **Covered.** Concrete technical controls exist and are proven live
  throughout this engagement, not just designed: managed-credit hard caps
  (Phase 3c), BYOK revoke/delete lifecycle (Phase 3d), managed-provider
  reconciliation against the provider's own authoritative billing (Phase
  3e), tenant-role RBAC (Phase 3f).

### CC6 -- Logical and physical access controls (the largest category for a SaaS platform)
- **CC6.1/6.3 (least privilege, RBAC): covered.**
  `client_memberships.role` (`owner`/`admin`/`member`/`viewer`) is now
  actually enforced, not just stored -- `revoke_client_provider_connection`
  and `record_client_provider_connection` require `owner`/`admin`,
  proven live via a real viewer-vs-owner canary
  (`product-experience/supabase-v39-tenant-rbac-canary.sql`).
- **CC6.2 (registration/authorization before access): covered.** The full
  onboarding pipeline (request -> approve -> deploy -> smoke-test ->
  activate) gates every tenant before its runtime exists.
- **CC6.6 (external/customer-facing access controls, tenant isolation):
  covered, proven at two layers.** App layer: a real cross-tenant token
  presented to the wrong tenant's live service was refused in both
  directions. Database/RLS layer: a real cross-tenant RPC call was refused
  by `client_memberships`-scoped security-definer functions. See
  `docs/v3.3-current-release-audit.md`'s two-tenant drill section for the
  full live evidence.
- **CC6.7 (restricting transmission of sensitive data): covered.** Every
  credential-handling path in this engagement follows the same discipline:
  secrets fetched and piped directly into the one command that needs
  them, never displayed, never echoed, never stored in plaintext files.
  BYOK secrets land in a write-only Secret Manager inbox the tenant's own
  service cannot read back (`docs/gcp-client-runtime-runbook.md`).
- **CC6.8 (malicious/unauthorized software detection): covered.**
  `npm audit --audit-level=high` gates every deploy; two real
  newly-published high-severity advisories were found and fixed live
  during this engagement (not hypothetically -- see PR #2's commit
  history). SBOM generation + cosign keyless signing on every built
  control-plane image (`control-plane-image-deploy.yml`).

### CC7 -- System operations
- **CC7.1 (configuration-change monitoring): covered.** Pre-build and
  pre-deploy drift gates, as above.
- **CC7.2 (anomaly monitoring): partially covered.** Managed-provider
  reconciliation against the provider's own authoritative billing (Phase
  3e) is a real anomaly-detection control for one specific risk (billing
  drift). No general-purpose application-level anomaly/intrusion
  monitoring exists.
- **CC7.3/7.4 (security event evaluation and response): partial.** Real
  incidents were found and handled live during this engagement (a Stripe
  webhook signing-secret drift, a missing IAM permission, a stale
  provisioner allowlist) -- each investigated, root-caused, and fixed with
  documented evidence. **Gap**: none of this followed a *written* incident
  response plan, because none exists yet. The muscle memory is real; the
  document isn't.
- **CC7.5 (recovery from incidents): covered.** A real backup/restore
  drill (Phase 3f) proved actual recovery mechanics with measured timing,
  well inside a 4-hour RTO target. A real tenant-level rollback mechanism
  (Phase 3b) was built from scratch and proven live.

### CC8 -- Change management
- **Covered.** Every change in this entire engagement went through the
  same pattern: implement, verify with real evidence (not assumed), open
  a PR, pass CI, merge. Nothing was represented as done without live
  proof -- this is the single most consistently applied control across
  the whole 100 days, and it is exactly what CC8 is checking for.

### CC9 -- Risk mitigation
- **CC9.1 (business disruption): covered** via the backup/restore drill
  and rollback mechanism above.
- **CC9.2 (vendor/partner risk): covered.** The versioned integration
  catalog contract (Phase 4) requires every third-party integration to
  carry a risk tier, data-boundary statement, activation evidence, and a
  rollback procedure before it can be marked active -- enforced by
  `scripts/verify-integration-catalog-contract.mjs` in CI, not just
  documented.

## Availability (optional category, relevant here)
- **Covered.** Real, measured RTO (backup/restore drill, well under 4
  hours) plus a real, working rollback mechanism. **Gap**: no formally
  published uptime SLA or historical uptime tracking exists yet -- that
  requires operating in production long enough to have a real track
  record, not something achievable by writing more code.

## Confidentiality (optional category, relevant here)
- **Covered.** Consistent throughout: Secret Manager for all credentials,
  no plaintext secret storage anywhere in this codebase, the BYOK
  write-only-inbox pattern, and the credential-handling discipline
  documented under CC6.7 above.

## Privacy (optional category, relevant given customer PII)
- **Partial.** Tenant data retention is explicit and configurable
  (`retention.days` per manifest), and tenant offboarding proved real,
  complete, independently-verified data deletion (Phase 3b and the
  two-tenant strict-mode drill). **Gap**: no published privacy policy or
  documented lawful basis for data processing exists yet (organizational,
  not technical, work).

## Honest summary

Roughly three-quarters of what SOC2's Security criteria actually check for
is already built, and -- unlike a lot of compliance theater -- genuinely
*proven with live evidence* rather than just designed on paper. The real
remaining gaps are almost entirely organizational documents (written
policies, a formal incident-response plan, a privacy policy) rather than
missing engineering. That is a meaningfully shorter, cheaper path to an
actual paid audit than starting from zero.
