# Release acceptance — 22 September 2026

Status: executing; not accepted. Scope is the approved seven-phase completion ledger.

## Credential release deployed
- Source: `8d0bd91`; build `4e5f3e3a-96c5-49f9-ac28-feeab9b44a1b` succeeded.
- Image digest: `sha256:0a4ec33ee48eac5dda7fb98897be26718b0acf89cfbb590fe8cd439e2cc41659`.
- Revision `veloce-cloud-test-readiness-8d0bd91` promoted to 100% on the existing test service, preserving configuration with an image/release-only update.
- Staged checks: status/login 200; credentials/Pipeline/ECC anonymous requests 401. Post-promotion status/login 200 and anonymous credentials 401.
- Local acceptance before build: 31 focused tests, production webpack build, focused lint and diff checks passed.

## Real execution evidence
- Authenticated browser capture and approval gate worked for the synthetic fictional desk-organizer GTM checklist. No outreach or publishing was requested.
- Groq planning job `0573bffe-679c-4668-8cf3-ce2aab9a647d` succeeded using `openai/gpt-oss-120b`. Ledger records 528 input tokens, 1029 output tokens, and 697 configured cost micros. This is internal accounting, not proof of the provider's invoice or free quota.
- Approved build job `516f9eba-d5aa-4322-811d-93a339e273b7` failed with `workspace_artifact_invalid`. The original failed response shape is not persisted, so its exact cause remains unproven. The synthetic item remains in Execute for retry; no customer records were deleted.
- Direct authenticated Jina worker extraction of `https://example.com` returned HTTP 200, complete status, title Example Domain and 149 Markdown characters containing the expected documentation text. This verifies the worker, not the full tenant research/queue/accounting journey. The first probe incorrectly expected the title inside Markdown; the corrected probe checked the separate title field and content.

## Additional defects found; local fixes pending deployment
- Artifact validation failure previously settled incurred provider usage to zero. Changed to required usage-based settlement (estimated cost only if usage absent), preserving failed job status.
- Added content-free output diagnostics: intent, character count, bounded finish reason, fence-presence booleans and withholding flag. No raw output or prompt is added to failure records.
- Cloud Orchestrate renders ClientOrchestrationWorkspace, which omitted the ECC creation panel present in the replaced ClientWorkspaceView. Restored the existing panel, retaining server authorization and policy checks.
- 28 focused tests and TypeScript passed for these changes. Two new checks are source-contract tests; they are not live acceptance proof.

## Remaining
Fresh login needs user participation. Pipeline artifact generation remains failed until diagnosed and rerun. ECC output needs the restored UI deployed and exercised. Full manifest equivalence and remaining phases are open; no broader production certification is claimed.
