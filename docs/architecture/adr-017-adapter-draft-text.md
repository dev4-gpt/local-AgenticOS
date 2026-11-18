# ADR 017: Reading an adapter task's draft text

**Status:** decided 2026-10-23 with the owner (D1 to D4); built in Phase 2 slice 3c, local commits only. No page uses it yet.
**Builds on:** ADR-005 (the adapter host contract), ADR-012 (adapter token keys), ADR-013 (what the feed may carry), ADR-014 (erasure).
**Closes:** the Content OS half of the open item "returning the draft text (the memory store gives asset ids, not bodies)".

## The problem

A reviewer who is asked to approve a publish action, or to judge a task, needs to read the draft. The events feed carries
no draft text on purpose (ADR-013: no brief, no draft text, no requester or approver), and `task.get` gives only the ids
of the saved drafts. The memory store holds the bodies, but the host had no way to ask for them.

## Decision

1. **A new read-only operation, `task.result`.** `GET /h1/task.result?id=<task>` behind its own token scope. It answers
   `{ ok, taskId, drafts: [{ assetId, title, body }], omitted }` for a task of this tenant that succeeded. An unknown
   task, a malformed id, another tenant's task and a task that is still running or failed all get the same 404. Any
   parameter other than one `id` is a 400. No other method works.
2. **Caps, with nothing cut.** At most five drafts and 60,000 characters in total. The newest drafts are tried first; a
   draft that does not fit is left out whole and a smaller, older one can still fit. Left-out drafts, erased drafts and
   unreadable ones are counted in `omitted`, never invented.
3. **Erased means gone.** A draft that a tombstone has erased (ADR-014) is skipped, so withdrawing a fact also stops the
   drafts that quoted it from being handed out.
4. **Fetched on demand and never stored.** The host's `fetchTaskDrafts` (`src/lib/adapterDraftFetcher.ts`) makes one
   request with a single-use `task.result` token, over https only, without redirects, with a timeout and a response size
   cap, and checks the answer field by field (exact fields, the task id it asked for, the caps again). It returns the text
   to its caller and writes nothing. Storing draft text on the host would add a new thing to retain, export, restore and
   delete.
5. **The text is untrusted.** The host scans every body itself and returns the verdict beside it; a blocked or flagged
   draft is still returned, so a reviewer can see why. Whatever shows it must show it as plain text.
6. **Failures are reasons, not messages.** `invalid_task`, `not_found`, `adapter_unreachable`, `adapter_refused`,
   `redirect_refused`, `too_large`, `bad_response`. Nothing from the adapter's reply or any text is passed on.

## What is deliberately not done: showing it in a page

The web app has no adapter address and no signing key today; only the background job has them. A page that shows a draft
would need the Next.js server to mint a `task.result` token, and the signing key can mint a token for any operation,
including `task.run`. A compromise of the web server would then reach the adapter. Two ways to avoid that, neither built:
a small internal service that holds the key and answers only draft requests, or a separate signing key that the adapter
accepts only for `task.result`. This is the owner's decision before any screen uses the fetcher.

## What was built (all local)

Content OS: `GET /h1/task.result`, `RunManager.result`, the pure `selectDrafts`, an optional `MemoryStore.read`, the
manifest entry, and tests with a breakage check. Host: `task.result` in the operation list, the fetcher with its spec,
mutation targets, and a contract test against the real Content OS service (fetch, scan, wrong scope, unknown task, erase).

## Still open

- Which of the two key designs above to use, and then the review screen itself.
- The 60,000-character and five-draft caps are a first guess; real drafts may need other numbers.
