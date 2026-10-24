# Veloce AgenticOS: Hackathon Background

Prepared October 17, 2026. This is a redacted project briefing, not a release
approval, customer endorsement, or official hackathon submission.

## What the project is

Veloce AgenticOS is a governed AI workspace for moving approved context through
research, agent jobs, human review and delivery. The product problem is scattered
tools and context, unclear ownership, uncontrolled usage, and outputs without
traceable sources or approval state. These are product hypotheses, not claims
validated by buyer interviews.

The architecture separates a public intake surface, an authenticated tenant
workspace, bounded asynchronous workers, private artifacts, and a local operator
edition. Policy, tenant identity, budget and review state are part of the
workflow rather than instructions that a model is expected to remember.

## Read this pack

- [Architecture and implementation map](architecture.md)
- [Stripe background and pilot scope](pilot-and-stripe.md)
- [External sources and archive coverage](sources.md)
- [Verification, limitations and next gates](verification.md)
- [Machine-readable historical evidence summary](evidence-summary.json)

The [canonical system design](../architecture/agentos-system-design-2026-10-14.md)
and [execution board](../production-readiness-execution-board.md) remain the
source of truth. This briefing does not create a competing completion tracker.

## Existing-work baseline

The existing application baseline is commit
`a4c379aaac517e23ad2863c1b8695e63dd939b8f` on
`wip/backup-2026-10-03`, tree `0f8e82476932827bf1be4fb7a12ecdf093f25973`.
It predates this briefing and includes substantial application, billing,
retention, source-intake and test infrastructure. Do not present that work as
newly created during the hackathon.

The owner intends to use the project as background for a CreateOS x Stripe
hackathon. No CreateOS integration, event eligibility, judging-rule compliance,
new event-period feature, or submission has been verified here. Check the event's
actual rules and record the start commit, dates, new contribution and third-party
attribution before submitting. This document does not assert affiliation with
CreateOS, Stripe, Skool or the referenced repository authors.

## What is intentionally excluded

This pack uses original summaries and aggregate observations. It does not
redistribute course PDFs, paid manuals, transcripts, video files, exported
community pages, client files or repository README copies. It omits buyer names,
contact details, account identifiers, cloud project/tenant identifiers, private
Drive IDs, authenticated screenshots, raw logs, credentials and session data.
External references are pointers, not permission to copy or redistribute content.

The original private files remain outside Git. Their presence on one machine is
not a backup, a Drive upload or a promise of indefinite retention. No deletion or
retention renewal is performed by preparing this pack. Making the repository
private later does not reverse earlier exposure or make credentials safe to
commit. Repository visibility has not been changed by this operation.

Redaction applies to the six files in this briefing, not to a sanitization of
the entire repository or its existing Git history. Linked operational documents
remain separate and can contain deployment details or private artifact paths.

## Demonstration boundary

Use synthetic documents and fixture-backed outputs for an unapproved demo.
Distinguish mocked providers, offline checks and historical observations from
live behavior. Do not start live payments, model calls, deployments, hosted
imports or client-data ingestion without separate authorization. The project is
not currently accepted as production-ready.
