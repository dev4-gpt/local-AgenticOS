---
name: agentos-release-acceptance
description: Verify an AgentOS release candidate with current customer-journey, tenant, billing, rollback, and immutable deployment evidence before claiming production readiness.
---

# AgentOS release acceptance

Use this skill when assessing, testing, or promoting an AgentOS release. The source of truth is `docs/production-release-acceptance-checklist.md` and `docs/public-launch-runbook.md`; this skill keeps the non-obvious evidence rules close at hand.

1. Identify the candidate source SHA, Vercel deployment, Cloud Run revision/image digest, applied Supabase migrations, environment, and rollback target. Never combine evidence from unrelated revisions into one passing claim.
2. Run the disposable test-mode journey before live billing. Preserve signed-webhook, duplicate-event, failure, refund/reconciliation, and tenant-isolation results without secrets, card data, or customer content. A Stripe Test-mode result cannot satisfy the live-mode gate.
3. Test two tenant identities across read, execution, export, and deletion. Prove credential values are absent from browser output and evidence. Include an actual first-use action and offboarding/restore drill, not just onboarding endpoints.
4. Record each required gate as passed, failed, or untested with a timestamp and evidence pointer. Keep owner-controlled approvals separate from automated test outcomes. Do not infer approval from an enabled route or a previous release's receipt.
5. Report `passed / required` for critical gates and `evidenced actions / promised actions` for customer journeys, with denominators and blockers. A failed critical gate blocks readiness even if the percentage is high.
6. Run `npm run verify:production-readiness -- --strict` only when the candidate and ledger are ready. Claim production readiness only if it returns `releaseReady: true` for that candidate. Otherwise state the exact blockers and rollback posture.

No live charge, provider-spending pilot, production migration, or public promotion is authorized by this skill. Those actions need the corresponding owner approval and hard cost controls from the release checklist.
