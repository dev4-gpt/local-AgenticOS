# Information security policy

Covers the formal, written policies that SOC2's Security criteria expect
in addition to working technical controls. Where a section states a
policy, it also cites the real technical control that already enforces
it -- the goal is a document that describes what actually happens, not an
aspiration.

## 1. Purpose

This policy establishes how Veloce AgenticOS protects the confidentiality,
integrity, and availability of tenant data and platform infrastructure.
It applies to all personnel, contractors, and automated systems (including
this project's own AI-assisted development tooling) acting on the
platform's behalf.

## 2. Access control policy

- Access to any system is granted on a least-privilege, role-scoped
  basis. Tenant-level roles (`owner`, `admin`, `member`, `viewer`) are
  enforced at the database layer via security-definer functions, not left
  to application-layer trust.
- Access to operator-level actions (tenant provisioning, rollback,
  credential lifecycle, managed-provider controls) requires a distinct
  operator secret held in Secret Manager, never in source control or
  plaintext configuration.
- New tenant access is granted only through the reviewed onboarding
  pipeline: request, approval, provisioning, smoke test, activation. No
  tenant runtime exists before this sequence completes.
- Access is revoked immediately on offboarding: exact deletion of cloud
  resources, database rows, and credentials is independently verified
  after every offboarding, not assumed.

## 3. Change management policy

- Every change to production code or infrastructure is committed to
  version control, opened as a pull request, and must pass automated
  verification (secret scanning, security checks, policy gates, the
  focused test suite) before merge.
- Infrastructure changes are additionally gated by pre-build and
  pre-deploy drift checks that refuse to proceed if the target
  environment has already silently drifted from its expected
  configuration.
- Every deployment records a rollback target (the immediately preceding
  known-good revision) before promotion, and a real rollback mechanism is
  proven functional, not merely documented.

## 4. Risk assessment policy

- Third-party integrations are risk-tiered (`low`/`medium`/`high`/
  `critical`) before consideration for activation, with an explicit
  data-boundary statement, required activation evidence, and rollback
  procedure -- enforced by an automated contract check in CI, not left to
  a spreadsheet that goes stale.
- Dependency risk is assessed on every change via automated
  high-severity vulnerability scanning; findings block merge until
  resolved.
- Review cadence: the risk-tiered integration registry and dependency
  scan results should be reviewed by the team at least quarterly, or
  immediately upon any new integration proposal. [This cadence is a
  policy commitment to be tracked going forward -- it is not itself
  automatable, and is the kind of item an auditor will ask "show me
  evidence this actually happened" about, so a lightweight log of these
  reviews should be kept from here forward.]

## 5. Data classification and retention policy

- Tenant workspace data is classified as confidential by default; no
  tenant's data is accessible to another tenant, enforced by database
  row-level security and independently verified through live
  cross-tenant access testing.
- Provider credentials submitted by a tenant (BYOK) are classified as
  restricted: written to a storage location the tenant's own runtime
  cannot read back, never logged, never displayed after submission.
- Retention periods must be configured per tenant and enforced through the
  offboarding/deletion process, with independent post-deletion verification
  as standard practice, not an occasional check.
- The owner selected a 28-day maximum active period for all tenant data and
  files, followed by seven recovery-only days; purge is due at each item's
  active expiry plus seven days. This applies across database rows, objects,
  exports, backups, and vendor copies. Any statutory, contractual, or incident
  hold conflict must be documented as an explicit exception, not silently
  exempted. The complete inventory and vendor/backup deletion procedures still
  need implementation and verification. The checked-in
  `supabase-client-runtime-record-retention.sql` adds a service-role-only,
  bounded tenant-runtime-record purge using the configured retention window,
  with graph cleanup and minimized audit counts. The new
  `supabase-client-retention-policy-28.sql` caps tenant configuration and
  existing artifact/source/learning expiry metadata at 28 days; neither file
  alone proves that every tenant table, export, backup, or vendor copy expires
  on schedule.
  The local `supabase-client-research-retention-28.sql` migration also adds an
  age-based read boundary and bounded cleanup for structured research runs,
  records, citations, and worker-failure rows. Its SQL tests do not prove that
  the migration or a scheduled cleanup has been deployed.
  The notebook-container migration similarly expires notebook metadata while
  detaching its live sources and records rather than deleting their content.
  After that migration and `supabase-v48-ecc-learning-retention-references.sql`
  are deployed and verified, `client-lifecycle --mode retention` previews
  runtime records, Notebook sources and containers, research rows, learning
  items, and expired onboarding token hashes. Token hashes are physically
  purged only seven days after their unusable `expires_at` boundary. Tenant
  content preserves the seven-day recovery period (maximum 35 days from creation).
  Apply requires `--apply --confirm-retention-records --confirm-retention-learning
  --confirm-retention-sources --confirm-retention-notebooks
  --confirm-retention-research --confirm-retention-onboarding-tokens`; the CLI checks the
  hosted learning-reference guard before any purge. This is
  not scheduled or deployed yet. The CLI now holds learning rows until seven
  days after their active expiry; local SQL purge families use the same delay.
  This is partial local coverage, not proof all tenant data/files follow the
  policy. The purge calls are not one database transaction: review each result
  and rerun bounded batches after a partial failure. Tenant storage lifecycle
  and offboarding do not prove a complete active-expiry + 7-day purge of all
  tenant database rows, private exports, backups, and vendor copies. The read-only
  `scripts/audit-client-retention-snapshot.mjs` inventories age from a private
  lifecycle export and counts missing, invalid, expired, and over-window
  artifact/Notebook source expiry metadata without printing content. A missing
  table is reported as unmeasured, not empty. It does not authorize deletion,
  blanket backfills, or prove enforcement.

## 6. Encryption policy

- All data in transit uses TLS (HTTPS enforced platform-wide; verified
  security headers including HSTS on the public application).
- All credentials at rest are stored in a managed secret store (Google
  Secret Manager), never in application configuration files, environment
  files committed to source control, or database columns.
- Database connections and storage use the underlying cloud providers'
  standard encryption-at-rest for all managed data stores.

## 7. Vendor and third-party risk management policy

- Every third-party integration considered for the platform is entered
  into the governed integration registry with a risk tier, a stated data
  boundary, and a rollback plan before any activation decision is made.
- Integrations remain disabled by default until their required
  activation evidence is genuinely satisfied -- a risk tier alone does not
  authorize activation.
- The platform's core infrastructure vendors (Stripe, Supabase, Google
  Cloud, Vercel, Resend, OpenRouter) are documented in the privacy policy
  along with the specific purpose each serves.

## 8. Business continuity and disaster recovery policy

- A tested backup/restore mechanism exists at the tenant level, with real
  measured recovery timing (well inside a 4-hour recovery-time
  objective for the data volumes tested).
- A tested rollback mechanism exists at the infrastructure level for both
  the control plane and individual tenant runtimes.
- [Gap to close: a written statement of the target recovery point
  objective at the platform-database level depends on the underlying
  managed database provider's own backup/point-in-time-recovery
  configuration and retention window -- confirm and document this
  explicitly, since it is a fact about the vendor's plan/configuration
  rather than something this codebase controls directly.]

## 9. Acceptable use and code of conduct

- Platform credentials (operator secrets, service account keys, database
  service-role keys) are used only for their intended, documented
  purpose, are never shared outside the systems that require them, and
  are never displayed, logged, or transmitted in plaintext outside a
  single authorized command execution.
- Personnel and any automated tooling acting with elevated access must
  verify a claimed fix or change with real evidence (a log entry, an
  independent read of the affected system, a live re-test) before
  reporting it complete. This standard has been applied consistently
  throughout this platform's development and is a policy commitment
  going forward, not just a past practice.
- Destructive or hard-to-reverse actions (deleting production data,
  force-pushing shared branches, disabling a security control) require
  explicit confirmation from a person with authority over that system
  before being executed, regardless of who or what is performing the
  action.

## 10. Incident response

See `docs/incident-response-plan.md` for the full incident response
procedure, including real past incidents that inform the playbooks.

## 11. Policy review

This policy should be reviewed at least annually, or immediately upon any
material change to the platform's architecture, vendor list, or data
handling practices. [Tracking this review is, like the risk-assessment
cadence above, a commitment an auditor will want evidence of -- keep a
simple log of review dates and any resulting changes.]
