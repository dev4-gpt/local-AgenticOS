# v40–v42 production database rollout

**Status: applied and live verified.** Target: Supabase project
`ppmoqjtmjtfxadsnejqc` (Veloce AgenticOS, `main` production branch).
Migration source: merged commit `ce71e19652dc47be486979163888f8e33db19bf0`
([PR #12](https://github.com/dev4-gpt/local-AgenticOS/pull/12)).

## Application evidence

The SQL Editor preflight at **2026-09-08 04:02:55.768125 UTC** ran as
`postgres`: v40 was absent; v41 still used the transaction-based calculation;
v42 still used membership without a tenant-status join. The dashboard showed
the organization on **Free**. The project reference matched the configured
`SUPABASE_URL` before execution.

The three repository files were concatenated verbatim, in v40/v41/v42 order,
inside `begin`/`commit`, with a five-second lock timeout and a thirty-second
statement timeout. The batch SHA-256 was
`0ff26810e2ec903c39aa7dd89ef27b4ebcefe93ac3a88fb64eb3293bd39e70cf`.
Its SQL Editor URL was
[the production query](https://supabase.com/dashboard/project/ppmoqjtmjtfxadsnejqc/sql/9ea9aa53-23e3-46cc-9d30-a23d5188a660).
An initial manually reformatted batch was rejected by automatic approval
review and was not executed; the subsequent batch used the exact files.

Independent API calls after execution returned HTTP 200 for the new
`client_provider_execution_allowed` RPC (false for an absent tenant) and the
monthly-spend RPC (zero for an absent tenant). The full live canary below
then exercised the changed behavior of all three functions through separate
HTTP requests. This establishes persisted database behavior independently of
the editor's execution acknowledgement. A precise commit timestamp was not
captured from the editor result; the verification interval is recorded below.

## Live acceptance and cleanup

[`docs/evidence/v40-v42-live-2026-09-08.json`](evidence/v40-v42-live-2026-09-08.json)
records **38 passing checks**, executed from **04:16:11.166 UTC** to
**04:16:22.868 UTC** on September 8, 2026. It includes the SHA-256 of each
migration and exact fixture/reservation identifiers.

- **v40:** anonymous transport admits the correct tenant's worker token;
  foreign, missing and short tokens fail. A real Supabase Auth session admits
  its own tenant and refuses the other tenant. Revocation, a retained
  `revoked_at` timestamp, submitted status, suspension, a missing provider row,
  and deletion each deny execution.
- **v41:** a synthetic $2 prior-month settlement refunded this month leaves
  current spend at zero. With a $1 monthly cap, a $2 reservation is refused,
  exactly $1 is accepted, and one additional micro is refused. A current-month
  settlement records 700,000 micros; its refund and retry return spend to zero
  exactly once. The other tenant stays at zero. Anonymous and authenticated
  callers receive SQL permission error `42501` for the spend RPC.
- **v42:** the real authenticated owner's runtime request is visible while
  its tenant is active, then invisible under actual RLS after suspension.
  `client_member` also returns false after suspension and for another tenant;
  anonymous callers receive permission error `42501`.

Disposable tenant slugs were `ga-v4042-1c7b4e9c8934-a` and
`ga-v4042-1c7b4e9c8934-b`; the synthetic Auth user was
`e7f1dfa2-abd5-494c-b448-cb772f822a71`. Cleanup was followed by fresh GETs
confirming zero matching rows in ten tables and HTTP 404 for the Auth user.
All eleven cleanup checks passed with no errors. The wallet amounts were
synthetic database fixtures; no Stripe payment, provider inference, image
build, or cloud deployment was invoked.

The executable verifier is
[`scripts/verify-v40-v42-live.mjs`](../scripts/verify-v40-v42-live.mjs).
The executed copy's SHA-256 was
`6b7cbd1df64ced1f8a987fd4c610ba02be6e7c5332bae63c5fb4e484ecf64a7f`;
the checked-in copy only removes an unused `randomUUID` import after that run.
It requires `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and
`SUPABASE_ANON_KEY` in the environment and an explicit matching project ref:

```sh
node scripts/verify-v40-v42-live.mjs ppmoqjtmjtfxadsnejqc /private/tmp/v40-v42-evidence.json
```

This command performs a live database canary; it is deliberately excluded
from ordinary CI. It creates random fixture names, never enables an existing
tenant, and performs exact fixture cleanup in `finally`. Credentials, worker
tokens, and passwords are excluded from its evidence output.

## Acceptance boundary

Before fixture creation, the live database had three active tenants and
**zero provider-connection rows**. No existing connection was promoted or
backfilled. v40 will deny BYOK admission until each required connection is
properly promoted to connected state through the approved lifecycle.

These three database migrations are complete. Deploying the application and
runtime changes from PR #12 remains a separate release step: an old image
does not start calling v40 merely because the RPC exists. The 38 checks prove
the deployed database/API boundary; they do not attest the application image,
concurrent-session behavior, the full role/action matrix, or whole-product GA.
Professional deliverables in `needs-human/` remain separate.

Local validation: the SQL regression test passed (1 test, 2.4s, using
`playwright.unit.config.ts`); verifier syntax, ESLint, repository secret scan,
and `git diff --check` passed. An initial invocation with the browser config
could not bind its local web-server port inside the sandbox and collected no
tests; the unit config is the appropriate server-free invocation.
