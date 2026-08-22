# Public provider catalog and governed AI-OS beta

This is the release contract for the invite-only beta. The public boundary may
describe every catalog entry, but the executable client manifest contains only
Veloce-owned contracts and isolated workers with a closed evidence bundle.

## Customer journey

The first polished journey is:

`request → approved tenant manifest → research → citations/memory → plan → artifact → quality review → approval → delivery`

The public intake at `/start` stores a `deployment_requests` row with
`pending_approval` status and returns a request id. It must never accept API
keys, passwords, bearer tokens, or private documents. Provider credentials are
submitted only after an authenticated tenant runtime is provisioned.

## Activation states

Every public catalog row must have one of these labels:

- Available now
- Available with client key
- Review required
- Isolated worker
- Operator only
- Reference only

Submitting a BYOK key creates a server-side Secret Manager inbox version and a
safe `activationManifest` proposal. The proposal contains the tenant, catalog
entry, provider allowlist, secret binding, and required evidence, but keeps
`providerCallsEnabled: false`. An operator must validate, promote, deploy, and
record rollback evidence before activation.

## Evidence gate

For every provider-bound or expensive job, retain:

1. estimated USD micros and normalized credits;
2. reservation result and provider ownership;
3. settled, refunded, or failed ledger result;
4. citations or artifact lineage where applicable;
5. tenant and deletion evidence;
6. approval and rollback evidence for external actions.

Ponytail restraint is a Veloce-owned fail-closed trait. A prompt cannot bypass
it. The reason is recorded with the loop evidence and should block another paid
round when progress is not worth the expected cost.

## Operator promotion checklist

```text
node scripts/validate-client-manifest.mjs client-blueprints/<client>.json
node scripts/promote-client-credential.mjs --help
node scripts/verify-client-provider-policy.mjs
node scripts/verify-client-runtime-worker.mjs
```

Then run the authenticated journey against the approved deployment:

```text
EXPECTED_RESEARCH_PROVIDER=brave \
EXPECTED_RESEARCH_WORKER=jina-reader \
node scripts/verify-client-runtime-authenticated.mjs \
  --url <approved-runtime-url> \
  --cookie-file <tenant-cookie-file> \
  --workflow-only \
  --research-worker-smoke \
  --visual-qa-smoke
```

The research-worker smoke is only valid after citation, budget, idempotency,
two-tenant isolation, deletion-lineage, and disable/restore rollback outputs
have been retained. Visual QA remains an isolated worker gate and is not a
promise to the public catalog until its evidence bundle is complete.

## Repository boundary

Ponytail, Superpowers, Headroom, AGENTS.md, Agent Skills, Agency Agents, Open
Notebook, book-to-skill, i-have-adhd, and no-ai-slop are provenance inputs to
Veloce-owned traits or reviewed playbooks. They are not copied into the client
image. Jina, Brave, and Firecrawl are provider-layer entries; Company Research
Agent and OpenSEO remain reviewed workflow contracts. GPU, security,
communications, operator-worktree, and control-room references stay isolated
or gated until their own evidence bundles exist.

## Billing and support boundary

BYOK is the default: the customer pays the provider, while Veloce applies the
agreed minimum platform/setup fee. Managed credits are a separate future mode
and must never be implied by a catalog row. Exact USD micros remain internal;
the customer sees a versioned normalized credit estimate and settlement.

Public privacy, terms, security, support, and intake language lives in the
`product-experience` app. A real intake confirmation requires one controlled
submission in the production public form and a matching `deployment_requests`
row; this is an operational check and must not be faked by a unit test.
