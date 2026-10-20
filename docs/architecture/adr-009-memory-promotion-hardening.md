# ADR 009: Hardening the road into shared memory

**Status:** accepted for local use; not applied to any hosted database
**Date:** 2026-10-20
**Builds on:** ADR 005 (governed memory), ADR 006 (approvals), ADR 008 (retention)
**Register item:** X-4 (shared-memory poisoning)

## The problem

Shared memory is read by every adapter. One bad note in it (text planted on a web page, a wrong fact, a note that tells
a reader what to do, a note that carries a secret) reaches all of them. ADR 005 put a second person in front of every
promotion, but research on poisoned shared memory shows a human glance alone does not stop it. Before this ADR the
promotion path also had gaps: the `scan_result` column was never written or checked, a promotion needed no record of
where its note came from, an adapter could queue unlimited promotions, a reviewer had no way to withdraw a note, and
nothing marked shared text as data when it was handed to a model.

## Decision

Layers, none of which is enough on its own:

1. **Private by default, shared only by promotion** (ADR 005, unchanged).
2. **A mandatory scan, enforced by the database.** `scanMemoryContent` (`src/lib/adapterMemoryGuard.ts`) looks for text
   that gives orders ("ignore previous instructions", "from now on you"), concealment ("do not tell the user"), model
   control tokens, tool-call markup, dangerous commands, hidden or direction-changing characters, secrets, passwords in
   links, and (as a "look twice") role markers, impersonation, markdown images, data links, long query links, encoded
   blobs. Matching uses compatibility-folded, lower-cased text with hidden characters removed and line breaks treated as
   spaces, so full-width letters, zero-width characters, odd spacing and phrases split across lines are still seen.
   The verdict is `clean`, `flagged` (medium findings) or `blocked` (any high finding). The result is stored in
   `scan_result` and **the promotion guard refuses**: a promotion with no scan, a scan of other content (the scan carries
   the content hash), or no provenance record for its source note; a queue of more than 25 waiting promotions per
   adapter; approval of a `blocked` promotion; approval of a `flagged` one without a written reason of at least 20
   characters; and any later change to the scan result.
3. **A reviewer who can see what they approve** (routes in commit B, screen in commit C; the routes are
   `GET /api/client-runtime/adapter-promotions`, `POST .../adapter-promotions/[id]/decision` and
   `POST /api/client-runtime/adapter-memory/[id]/revoke`, all closed unless the host flag is on): the content, the scan findings, the provenance, and
   whether the same fact is already shared. The decision function (`client_adapter_decide_promotion`) repeats the
   content hash, refuses the requester, plain members and other tenants.
4. **Safe reading.** `renderSharedFactForModel` shows a shared note to a model as quoted data with its origin, with
   hidden characters removed and markup escaped, shortened to 2,000 characters, and returns nothing for any note that is
   not active and reviewed.
5. **Rollback by a person.** `client_adapter_revoke_shared_memory` lets an owner or admin withdraw a shared note: its text
   is erased, it can never come back, and a `memory.tombstoned` event tells adapters to drop their copies.

## The review screen

`/adapters/promotions` (operator edition, behind the host flag) shows each waiting promotion with the note itself, the
scan verdict and findings in plain words, where it came from, and whether the same fact is already shared. Invisible
characters in a note are shown as `[U+200B]`-style markers so a reviewer cannot be fooled by text they cannot see.
Approve is offered only when the scan covers exactly this note, did not block it, the reviewer can read the note, and
the fact is not already shared; a flagged note also needs a written reason of at least 20 characters; Approve asks for a
confirmation that repeats the content fingerprint. Owners and admins can also withdraw shared notes, with a reason.
These are conveniences: the database enforces every rule independently.

## What this does not do

- **The scan is a tripwire.** It cannot recognise a well-phrased false fact, instructions in other languages, look-alike
  letters from other alphabets, or paraphrased orders. A test documents these cases on purpose. They rely on the second
  reviewer reading the content.
- **A blocked note must be rewritten and proposed again.** There is no override, so an honest note that quotes an attack
  phrase is stuck until rewritten. That is the intended cost.
- **The host writes the scan.** The service role stores `scan_result`; a compromised host could write "clean". The
  database only checks that a scan exists, matches the content hash and is not blocked.
- **Safe rendering lowers the chance a reader obeys a note; it does not remove it.** Nothing calls `context.read` yet,
  so it protects nothing until an adapter does.
- **Revoking cannot reach copies an adapter already holds in its own store** (X-2). It sends the drop notice and
  records it; whether the adapter complies is outside the guarantee.
- **A queued promotion is not rate-limited by time**, only by the number waiting.

## Rollback

The promotion rules are in the guard trigger: restoring the earlier function body in `supabase-client-adapter-host.sql`
removes them. The two functions can be dropped. Nothing else depends on them yet.
