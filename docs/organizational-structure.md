# Organizational structure

**Current stage: solo founder.** Veloce AgenticOS is operated by a single
founder who currently holds every functional role below. This document
exists so that (a) responsibilities are clearly defined even though one
person holds all of them today, and (b) as the team grows, each function
below has an obvious place to hand off to a dedicated hire without
restructuring anything.

No names are recorded here by design -- roles and functions only. This is
an accurate, not aspirational, org chart: it does not claim a team that
doesn't exist, and an auditor reviewing it at solo-founder stage should
see exactly that.

## Functional departments

Derived from the actual work this platform requires, not a generic
template:

### Engineering & Platform
Owns the application code, infrastructure (GCP, Vercel, Supabase), CI/CD
pipeline, and the technical controls documented in
`docs/information-security-policy.md`. Responsible for change management,
the automated policy gates, and incident technical response.

### Security & Compliance
Owns access control policy, credential lifecycle, the risk-tiered
integration registry, dependency/vulnerability monitoring, and this
compliance documentation set (`docs/soc2-readiness-self-assessment.md`
and everything it references). Responsible for incident classification
and the non-technical portions of incident response
(`docs/incident-response-plan.md`).

### Finance & Billing Operations
Owns the Stripe integration, managed-credit ledger, pricing, and
subscription lifecycle (`docs/v3.3-managed-credit-lifecycle-runbook.md`).
Responsible for payment-processing incidents and financial reconciliation
(reconciliation-drift monitoring, Phase 3e).

### Product & Customer Operations
Owns the onboarding pipeline, tenant provisioning, tenant lifecycle
(activation through offboarding), and support. Responsible for
tenant-facing communication during incidents
(the "communications lead" role in `docs/incident-response-plan.md`).

### Legal & Data Protection
Owns the privacy policy (`docs/privacy-policy.md`, pending legal review),
terms of service, data retention/deletion policy, and regulatory
correspondence if it ever arises. Responsible for determining lawful
basis for data processing and any required breach notifications.

## Current staffing

| Department | Current holder | Note |
|---|---|---|
| Engineering & Platform | Founder | |
| Security & Compliance | Founder | |
| Finance & Billing Operations | Founder | |
| Product & Customer Operations | Founder | |
| Legal & Data Protection | Founder (with external counsel as needed) | Privacy policy explicitly requires outside legal review before publication -- this is the one department where the founder should not be the sole reviewer even at solo stage. |

## Board oversight

Not applicable at the current single-founder, pre-formal-board stage. If
and when a board or advisory board is formed, this section should be
updated with its oversight responsibilities (typically: reviewing this
compliance program, approving material policy changes, and receiving
incident reports above a defined severity).

## Background-check policy

Not applicable while the founder is the only person with system access --
there is no one else to screen. The moment a second person (employee,
contractor, or anyone else) is granted any production access, this
section must be updated with an actual background-check requirement
before that access is granted, not after.

## Growth path

As the team grows, the intended order of first hires based on where
solo-founder bandwidth is thinnest relative to platform risk:
1. A second engineering hire, primarily to remove single-point-of-failure
   risk on Engineering & Platform and Security & Compliance.
2. A dedicated Legal & Data Protection function (even part-time/fractional
   counsel) once tenant volume or revenue justifies it.
3. Product & Customer Operations, once support volume exceeds what the
   founder can handle directly.

This document should be updated the moment any of the above actually
happens -- an org chart is only useful to an auditor if it reflects
reality on the date it's read, not a future plan.
