# How Veloce works, in plain language

Read `00-start-here.md` first for the picture and the glossary. This file explains each idea one at a time: what problem it solves, how it works, and what stops it going wrong. Each section ends with "where to look" so you can find the code.

---

## 1. The host and the adapter contract

**The problem.** You have four separate products. If each one decided for itself who can do what, who pays, and what is remembered, you would have four different security systems that disagree.

**The idea.** Veloce is the one place that decides. Each product (adapter) talks to Veloce through a short fixed list of requests, called contract `h1`:

| Request | What it means |
|---|---|
| `manifest` | "Describe yourself": name, what tasks you offer, how risky each is |
| `health` | "Are you alive?" |
| `context.read` | "Show me what you know about this topic" |
| `task.run`, `task.get`, `task.cancel` | Start, check, or stop a piece of work |
| `events` | "Tell me what happened" |
| `memory.propose` | "I would like this note remembered" (a proposal, never a command) |
| `memory.tombstone` | "Confirm you removed everything derived from this note" |
| `ui.launch` | Open the adapter's own screen inside Veloce |

**Risk labels.** Every task has a side-effect class, taken from the adapter's manifest (never from whoever calls it):

- `read`: only looks
- `draft`: makes something, nothing leaves the system
- `publish`: something goes out into the world (a post, an email, a deploy)

A `publish` task cannot run without an approval (section 3).

**Honest deletion label.** An adapter must say whether it can truly erase client data: `none` (it cannot), `host-owned` (Veloce holds the data, so Veloce can erase it), or `receipt` (it can erase and prove it). An adapter that says `none` is labelled "outside the guarantee" and kept out of the client edition.

**Where to look.** `src/lib/adapterContracts.ts` (types and checks), `docs/architecture/adr-005-adapter-host-contract.md` (why).

---

## 2. Memory: private first, shared only by approval

**The problem.** If every adapter writes into one shared pool, one bad or poisoned note (for example, text planted on a web page that says "ignore your rules") spreads to everything.

**The idea.** Two layers.

- **Private memory.** Each adapter writes only to its own area (`adapter:forge`, `adapter:knowledge`, and so on). Other adapters cannot read it. Only owners and admins of the tenant can read private memory through Veloce.
- **Shared memory.** Everyone can read it. A note gets there only through a **promotion**:
  1. Someone asks to promote one private note. The promotion starts in **quarantine**.
  2. A **different** signed-in owner or admin reviews it and approves the **exact content fingerprint** (hash). If the note's text changes, the fingerprint no longer matches and the approval is useless.
  3. Only then can the database create the shared copy, marked "reviewed".

**Rules the database enforces by itself** (not just the app):

- A shared note cannot exist without an approved promotion that matches its hash.
- The same fact cannot be shared twice (one active shared note per fingerprint).
- A note's text and identity cannot be edited afterwards.
- A note can only be **tombstoned**: the text is erased and replaced with `[tombstoned]`, a marker stays, and it can never be brought back.
- The history of what happened to each note (provenance) can only be added to, never edited or deleted.

**What this does not fully solve.** Research shows a human glance may not stop a clever poisoned note. That is why shared memory is the exception, private is the default, and the open-items list keeps a task for source-linked review and rollback.

**Where to look.** Tables `client_adapter_memory_items`, `client_adapter_memory_promotions`, `client_adapter_memory_provenance` in `product-experience/supabase-client-adapter-host.sql`.

---

## 3. Approvals: two people, one exact action, one use

**The problem.** "Pause and wait for a human" is not enough. The thing approved could change after approval. The person who asked could approve their own request. An old approval could be reused.

**The idea.** An approval is a database record tied to one exact action.

1. **Request.** A member asks to do something: `publish`, `promote`, or `enable-adapter`. The server (not the caller) computes the action fingerprint from the kind, adapter, destination, policy version and full payload. The caller cannot supply their own fingerprint.
2. **Decide.** A different owner or admin approves or rejects. To approve, they must repeat the fingerprint they looked at. If it does not match, it is refused.
3. **Execute.** The host worker uses the approval once, with a receipt. A second try fails.

**Safety properties, each proven by a test:**

| Property | Meaning |
|---|---|
| Requester is never the approver | Enforced by a database rule, even for admins |
| Identity comes from the login | No route accepts "who I am" from the request body |
| Exact action only | Different payload, destination or policy means a different fingerprint |
| Expires | 1 minute to 3 days (default 24 hours); expired means dead |
| Single use | Executing twice returns false |
| Limits | At most 50 open requests per tenant |
| Quiet errors | A stranger asking about an approval gets "not found", same as for a nonexistent one |
| Closed by default | Routes answer 403 unless `ADAPTER_HOST_ENABLED=true` |

**Where to look.** `product-experience/supabase-client-adapter-approval-gateway.sql` (three functions), `src/lib/adapterApprovalGateway.ts` (hashing, errors), routes under `src/app/api/client-runtime/adapter-approvals/`, `docs/architecture/adr-006-approval-gateway.md`.

---

## 4. Adapter tokens: proving who is calling

**The problem.** When the host calls an adapter (or the reverse), the receiver needs proof about who sent it, for which tenant, for which operations, and that it is fresh.

**The idea.** A small signed pass, valid for a minute by default (five at most):

- Format: `base64url(claims) . base64url(Ed25519 signature)`.
- Claims: version, issuer `veloce-host`, tenant, adapter (audience), allowed operations, unique id (`jti`), issued-at, expires-at.
- The receiver checks the signature first, then every claim: right tenant, right adapter, operation allowed, not expired, not from the future (30 seconds of clock slack), lifetime not above five minutes.
- **Single use.** Each `jti` is recorded in `client_adapter_token_uses`. A replay of the same token fails. Only the host worker can write to this table.

**Status.** Built and tested. **Nothing sends or checks these tokens yet**, and where the signing key lives (and how it rotates) is not decided. This waits for the first real adapter.

**Where to look.** `src/lib/adapterTokens.ts`, `product-experience/supabase-client-adapter-token-uses.sql`.

---

## 5. Budget: one ledger, caps per adapter

**The problem.** Three systems count money in different units, and some calls get counted twice. A shared counter can also go stale when many requests arrive together.

**The idea (partly built).**

- **One unit:** whole-number **micros** (millionths of a US dollar). No decimals, so no rounding drift.
- **One ledger:** the existing central runtime budget ledger. The adapter table `client_adapter_budget_events` is only a **log** that points to it (`reserve`, `settle`, `release`). It is not a second ledger.
- **Each adapter has an optional cap** per day, month or total, stored on the registry.
- **Planned behaviour:** reserve the money before a task starts, settle the real cost after, release if cancelled; if the ledger is down, refuse the task (fail closed); show unknown costs separately.

**How it works now.**

1. **Reserve** before a task starts. The database checks, in order: the caller is the host worker, the adapter is registered and in `preview` or `enabled`, the idempotency key is new, the task has no reservation yet, the adapter's own cap for its period (day, month or total) has room, and the tenant's monthly cap has room. Only then is a central ledger row written (tagged with the adapter and task) plus a log row.
2. **Settle** when the task finishes: the ledger row changes to the real cost. It can never exceed what was reserved.
3. **Release** if the task is cancelled: the reservation drops to zero and frees room under the cap.
4. A repeated call with the same key returns the first answer and charges nothing more. A task closes once.
5. Anything unexpected is a refusal (fail closed). All three functions take the same per-tenant lock as the existing budget code, so two requests arriving together cannot both squeeze under a cap.

**Status.** The functions, the wrapper and their tests are built and committed. A real-Postgres test fires 20 requests at once at a cap that fits 3 and gets exactly 3 (it was run once on a throwaway local database, not a hosted one). **Screens.** The `/adapters` page shows each adapter's state, what it may do, whether it can prove deletion, and its spend against its own cap. The main page (operator edition) has a Budget tab that splits the workspace's monthly spend by adapter and adds an "other spending" line so the parts add up to the total. Both are read-only, need sign-in and the host flag, and were checked in a browser with sample data only. **Not built:** any real adapter calling the budget functions, showing unknown costs separately, reading the tenant cap from one place, and these screens in the client edition.

**Where to look.** `product-experience/supabase-client-adapter-budget.sql`, `src/lib/adapterBudget.ts`, `docs/architecture/adr-007-adapter-budget.md`.

---

## 6. Knowledge vault and the duplicate finder

**The problem.** Notes live in three Obsidian vaults. Some are duplicates. You wanted them unified, but never merged blindly.

**The idea.** Three small command-line tools, run in this order:

1. **`scan`**: reads the vault folders (read-only) and records, for each note, a fingerprint of its text, its title, and links. It skips tool folders and reports iCloud notes that are not downloaded.
2. **`dedupe-report`**: groups notes. *Exact* = same text (or same web address for source notes). *Near* = same text apart from formatting, or same title; near matches are marked low confidence. Notes generated by Graphify are left out. It only reports.
3. **`apply`**: after **you** approve specific groups in a decisions file, it adds two lines to the notes' frontmatter (`duplicate_of` on the copy, `supersedes` on the keeper). It never deletes, moves or renames anything and never rewrites links. It makes a backup outside the vault first, writes each file via a temporary file, and puts everything back if any write fails. Dry run unless `--apply` is given.

**Used so far.** Group 1 (4 notes) was approved and marked in `llm-wiki`; groups 2 and 3 were rejected.

**Where to look.** `scripts/knowledge-unify/` (scan.mjs, dedupe-report.mjs, apply.mjs), `docs/knowledge-layer-schema.md`.

---

## 7. Retention: 28 + 7 days

**The rule you chose.** Client data is active for up to 28 days, then 7 recovery-only days (not visible to normal reads), then it is purged.

**How it is classified.** A checker (`scripts/verify-client-retention-inventory.mjs`) fails if any `client_*` table is not assigned a class in `docs/retention-table-map-2026-10-15.json`. The new adapter tables are classified:

| Table | Class |
|---|---|
| `client_adapter_registry` | tenant control and identity |
| `client_adapter_memory_items`, `_promotions`, `_provenance` | tenant content (28 + 7) |
| `client_adapter_outbox`, `client_adapter_token_uses` | ephemeral security state |
| `client_adapter_approvals` | tenant content, 28 + 7 (confirmed 2026-10-20) |
| `client_adapter_budget_events` | financial records (provisional) |

**Important.** Classifying a table is not the same as enforcing the rule. The expiry, purge and restore code for the adapter tables is **not written yet**, and nothing has been verified in a hosted environment. So these migrations must not be applied to a hosted project, every adapter stays `disabled`, and no real client data may flow. See `03-safety-and-retention.md`.

---

## How the pieces connect: one example

*"Forge wants to publish a post."*

1. The Forge task is marked `publish` in its manifest, so it needs approval.
2. A member requests approval. The host fingerprints the exact post, destination and policy.
3. A different admin reviews and approves that fingerprint.
4. The host worker calls Forge with a one-minute signed token for this tenant and adapter.
5. Forge checks the token, does the work, and returns a receipt.
6. The host marks the approval executed with the receipt. A second attempt fails.
7. The cost is reserved, then settled, in the budget ledger against Forge's cap.
8. Any lesson Forge wants remembered shared goes through a quarantined promotion approved by a second person.

Steps 1-3 and 6 exist today. Steps 4, 5, 7 and 8's cap and UI parts are the open work.
