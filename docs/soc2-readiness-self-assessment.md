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
- **Covered.** `docs/information-security-policy.md` provides the formal,
  written policies (access control, change management, risk assessment,
  data classification/retention, encryption, vendor risk, business
  continuity, acceptable use/code of conduct), each citing the real
  technical control that already enforces it. `docs/organizational-structure.md`
  now documents the actual org structure -- currently a single founder
  holding every functional department, honestly stated as such rather
  than implying a team that doesn't exist. Board oversight and
  background-check policy are explicitly marked not-applicable at
  solo-founder stage, with the exact trigger for when each becomes
  required (a board forming; a second person being granted system
  access) rather than left as an open question.

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
- **Covered.** `docs/information-security-policy.md` §4 documents the
  risk-assessment process and cadence. **Remaining gap**: the review
  cadence itself is a commitment, not a fact yet -- an auditor will want
  evidence the quarterly review actually happened, which only accrues
  by actually doing it and logging it going forward.

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
- **CC7.3/7.4 (security event evaluation and response): covered.**
  `docs/incident-response-plan.md` now documents the formal process
  (NIST SP 800-61 structure), with roles, detection sources, and
  containment playbooks for the specific real incident classes already
  encountered in this engagement (credential compromise, billing-
  reconciliation drift, tenant isolation failure, payment-processing
  incidents) -- not generic scenarios, but the actual ones this system has
  already faced and fixed.
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
- **Covered.** Tenant data retention is explicit and configurable
  (`retention.days` per manifest), and tenant offboarding proved real,
  complete, independently-verified data deletion (Phase 3b and the
  two-tenant strict-mode drill). `docs/privacy-policy.md` now documents
  what is collected, why, the specific third parties involved, and user
  rights. **Remaining gap**: it is drafted from the actual system
  behavior, not lawyer-reviewed -- it says so explicitly and should not be
  published at a public URL until it has been.

## Honest summary

Almost every Security criterion now has both a real, live-proven technical
control and a written policy describing it
(`docs/information-security-policy.md`, `docs/incident-response-plan.md`,
`docs/privacy-policy.md`). What's built with free, open-source references
(`docs/soc2-readiness-self-assessment.md`'s own research: Probo, Comply,
JupiterOne's policy templates, a NIST-SP-800-61-based incident-response
template, and open privacy-policy generators) covers the organizational
side that pure engineering never could. What genuinely remains outside
any session's ability to produce: a lawyer's review of the privacy
policy, and an actual paid CPA attestation whenever the founder is ready
for one.
