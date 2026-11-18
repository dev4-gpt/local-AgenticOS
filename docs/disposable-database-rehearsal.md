# Disposable Database Rehearsal

This procedure supports the canonical system design's parity and retention
gates. Current status and evidence belong only in the
[execution board](./production-readiness-execution-board.md). This document is
a procedure, not an approval, deployment plan or second tracker.

## Target And Budget Boundaries

The [control-plane staging tier](./staging-environment-runbook.md) shares
production Supabase and is unsuitable for migration, purge or recovery drills.
Use an independently identified, owner-approved disposable database containing
only synthetic users, tenants and files. A project name or browser tab group
does not prove isolation. Never reuse another application project based on its
name, idle state or apparent lack of records.

The intended disposable-project name is `veloce-agentos-staging`. Current
approvals and completed actions are recorded in the execution board, not granted
by this procedure. A Free setup inspection is read-only and cannot authorize
project creation, terms acceptance, schema installation or fixture writes.
Supabase's [billing FAQ](https://supabase.com/docs/guides/platform/billing-faq)
describes two active Free projects, with quota affected by organization
Owner/Admin members, and organization-level plans. Seeing the form without an
upgrade warning is not proof that creation will succeed or remain within quota.

Stop on a quota, upgrade, payment or paid-add-on requirement. Do not pause,
delete or transfer another project, change organization roles, create another
organization, upgrade, or enable an add-on to make room. Any paid alternative
needs a separately approved total cap, duration and teardown plan. A free buyer
pilot does not authorize provider spend.

## Approval Phases

1. **Availability inspection:** Read the intended organization's new-project
   form without changing fields or security settings. Record plan, visible
   warnings and uncertainty privately. Stop before password entry, terms,
   creation or payment. Do not capture credentials or a full unrelated account
   inventory in a public artifact.
2. **Owner-controlled creation:** Obtain separate permission for the named Free
   project and its settings. The owner enters and stores the database password,
   reviews any binding terms and completes creation. Never ask them to paste a
   credential into chat. Stop if the agreed Free-only scope changes. Do not link
   GitHub, production services or provider credentials as an incidental step.
3. **Target attestation and plan review:** Privately record the new project ID,
   organization/plan, region, database version, default grants, RLS behavior and
   empty synthetic scope. Prove its ID differs from every production target;
   verify no production application points to it. Review Data API exposure,
   default table grants and automatic RLS settings rather than assuming that
   dashboard defaults match the local role fixture. No schema writes yet.
4. **Separate schema and synthetic fixture approvals:** Present exact candidate SHA,
   configuration hashes, ordered SQL files/hashes, target ID, maximum operations
   and a reviewed recovery/cleanup plan. Obtain target-specific approval before
   installing schema or creating users/rows. Schema-only approval does not
   authorize auth users, memberships, fixture rows or application RPC calls.
   Keep provider calls, production credentials, schedules, billing events,
   outbound messages and deployment
   disabled. A saved hosted catalog is not a schema/data backup; do not apply
   only a delta while prerequisite definitions remain unverified.
5. **Bounded rehearsal:** Capture before/after metadata and actual outcomes.
   Require all intended SQL files to apply without replaced application stubs;
   preserve named worker contracts and intended grants. Test actual Supabase
   authentication with two synthetic members/tenants across read, execution,
   export and deletion. Check anonymous denial, unauthorized cleanup denial,
   service-only previews, original-clock restore, expired/future/missing-clock
   rejection and transactional rollback. Stop on any unexpected target, access,
   cost, external call or partial failure; record what already committed.
   Treat a platform rate-limit response as a stop, not an automatic retry.
   Preserve the failed submission and obtain a separate checked-resume approval.
   Reconcile partial effects from catalog metadata before resubmitting a pending
   file; retain the original order and approved pacing. Never reset the project
   or rerun already successful files to force completion. A resumed batch must
   retain both approval phases and all submission timestamps in its receipt.
6. **Separate recovery and release decisions:** Destructive cleanup, backup
   restore, object operations and eventual project teardown require their own
   exact approval. Prove active expiry at 28 days, the seven-day recovery window,
   post-window deletion and preservation of foreign-tenant data across all
   copies. Keep nonzero financial balances until spent/refunded; expire
   purchase/allocation linkage at day 35 and route late refunds to manual review.
   Synthetic aging is not real elapsed-time scheduling, physical deletion or
   vendor/backup expiry evidence. Passing this drill does not authorize a
   production migration, deployment or release.

## Evidence Contract

### Identity And Fixture Preconditions

Schema installation alone cannot supply the 34 populated sentinels required by
the read-only isolation command. A fixture plan must enumerate the exact rows,
foreign-key dependencies, two distinct synthetic Auth users and memberships,
per-table operation counts, fixed source clocks and follow-up disposal scope.
Keep provider execution, object storage, deployment and outbound email absent
unless separately approved. Do not use SQL `SET ROLE` or manufactured JWT claims
as a substitute for real hosted Auth sessions.

Have the owner create/store the disposable credentials and handle any new
credential entry. Do not collect tokens from browser storage, cookies or hidden
state, or paste credentials into chat. Before executing the CLI, establish an
approved way for the owner to supply short-lived sessions privately; reading
existing user/operator credentials is not authorized by a fixture plan. Existing
password login is distinct from creating a new password/account and its possible
email effects. No user invitation or sign-up email is implied by test approval.

The data-only builder `tests/helpers/client-isolation-fixture.mjs` prepares
exactly 72 synthetic application rows: two tenants, two ordinary `member`
memberships and two rows in each of the 34 read-probe tables. Dependencies are
ordered for the real schema. Jobs are cancelled, deliveries blocked, and
artifact metadata has no stored object. Approval-table sentinels are explicitly
synthetic, not human approval. No provider or execution request is made.

Review the generated SQL as one transaction, not as independent inserts. It
requires two distinct existing Auth UUIDs without memberships, unused fixture
tenant names, and a preparation clock no more than 20 minutes old or one minute
ahead. Reuse and drift fail closed; it does not overwrite existing records.
Regenerate with the owner-created UUIDs and current clock before final review
and separately authorized submission. Its SQL comments cannot attest a project:
independently verify the target in the execution surface. Local demonstration
UUIDs must never be mistaken for hosted users. Local tests cover rollback after
a failure at the end of the batch and count changes across all application
relations, not just the populated tables.

### Owner-Controlled Sign-In And Read Check

`scripts/verify-client-isolation-owner.mjs` is plan-only by default. Its private
JSON plan contains exactly `schemaVersion: 1`, `environment: disposable-staging`,
`projectRef`, the exact `https://<ref>.supabase.co` origin (no slash/path/query),
`tenantA`, `tenantB`, `userA`, `userB`, `preparedAt` and `expiresAt`. Use the
reviewed fixture's two distinct tenants and owner-created UUIDs. Clocks must be
canonical ISO strings; preparation cannot be in the future, and the plan lasts
at most one hour. Keep the real plan outside Git. It contains no password, key,
email or token. Independently recheck the named project; a JSON label is not
proof of a staging destination or permission to use credentials there.

Inspect the plan without a terminal prompt or network request:

```sh
node scripts/verify-client-isolation-owner.mjs \
  --plan-file /absolute/private/staging-auth-plan.json \
  --expected-project-ref <independently-verified-staging-ref>
```

Only after a separate target-specific Auth/read/local-sign-out approval, the
owner runs the same command in a real private terminal with Node 24 and adds:

```sh
--run --confirm-staging-auth-reads-and-local-signout \
  --out /absolute/private/new-isolation-receipt.json
```

The run refuses non-TTY input, a dirty candidate or an existing output path
before credential entry. The parent directory must already exist. The owner
privately enters the staging publishable/legacy anon key and the two existing
test emails/passwords. No admin/service-role key is accepted. Input is not
echoed; timeout, cancellation and Ctrl-C restore terminal raw mode. Passwords
and access/refresh tokens are never requested in chat. Do not collect them from
browser storage, cookies or an operator session.

The proposed maximum is **142** HTTP requests: two password sign-ins, two Auth
identity reads, 136 minimal table reads and two current-session-only sign-outs.
No redirect or retry is allowed; requests have ten-second deadlines, and the
read subprocess is bounded to seven minutes. Both expected UUIDs must resolve
through Auth before any table read. Stop after the first failed table group.
Only a private stdin pipe passes the public key and access tokens to that
subprocess; none are put in arguments, environment, temporary files or receipts.
Credentials and sessions remain in process memory; memory/swap erasure is not
attested. The response and child-output sizes are bounded. Receipts persist
only allowlisted outcomes/counters, source/plan fingerprints and expiry limits.

The helper attempts `scope=local` sign-out for every session token it obtained,
including partial failure and cancellation; it never signs out other existing
sessions. A lost sign-in response can leave the created-session outcome unknown,
and a failed sign-out is not silently accepted. Supabase documents that
[local sign-out revokes the current session's refresh token, while its access
JWT remains valid until expiry](https://supabase.com/docs/guides/auth/signout).
The helper accepts at most 65 minutes of reported access-token lifetime and
does not refresh tokens or change project security settings. Auth can retain
session/audit records; this is a hosted Auth mutation, not a pure read-only run.

A passing receipt proves only the two supplied identities and populated
read boundaries in that approved staging environment. It does not prove the
deployed application login, writes/execution, reviewed export, anonymous reads,
physical deletion, recovery or production readiness. Those remain separately
approved and evidenced gates. A test harness with fake Auth responses is not
an actual hosted receipt.

Pin `--expected-project-ref` to the independently observed staging reference and
the HTTPS Supabase project origin. The current read-only command checks two
distinct Auth users and 136 tenant reads, requires positive own sentinels and
successful empty cross-reads, and fails closed on malformed results. A passing
command is not the full journey: independently test application allowlists,
membership checks, mutations, provider-disabled job admission, review/export,
anonymous denial and all-copy retention/recovery under their approved scopes.

### Receipt Boundaries

Define the baseline, expected denials, acceptance criteria, operation bounds and
stop conditions before evaluating a candidate. Preserve failures as well as
passes. Bind results to source SHA, clean-tree status, source/configuration
hashes, SQL order, database/image versions, target identity, fixture version,
timestamps and actual cleanup results. Keep raw catalogs, tenant records,
authentication material and private account inventory out of the public repo.

The local PostgreSQL 17 rehearsal is a prerequisite, not a substitute for the
hosted drill. It uses a pinned preinstalled image, no network, ports or host
mounts, bounded CPU/memory/PIDs and synthetic auth helpers. Verify removal of
only its uniquely labelled container after success or failure; never clean up
unrelated containers. Preserve exact image identity and minor-version
differences in the receipt. Local role claims are not a Supabase login, fresh
schema installation is not a populated production upgrade, and catalog hashes
are not proof of effective permission or semantic equivalence.

Use the [release checklist](./production-release-acceptance-checklist.md) and
[ledger procedure](./release-evidence-ledger-runbook.md) for the final decision.
All required customer, import, parity, evaluation, buyer and retention gates
remain independent; no narrow local pass closes them implicitly.
