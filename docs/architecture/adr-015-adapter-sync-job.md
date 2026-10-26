# ADR 015: The scheduled adapter sync job

**Status:** decided 2026-10-22 with the owner (D1 to D6); built in Phase 2 slice 2d. Deployed to the staging project (job only, no schedule or alert yet) and proven end to end in the cloud on 2026-10-23.
**Builds on:** ADR-012 (adapter token keys), ADR-013 (adapter memory proposals), ADR-014 (deletion receipts), tracker item 9b (the retention job).

## The problem

Two commands move data between the host and an adapter: the events puller (adapter to host, ADR-013) and the tombstone
dispatcher (host to adapter, ADR-014). Both worked only when run by hand, so a proposal waited until someone ran a
command, and a withdrawn fact stayed in the adapter until someone ran another. A deletion promise that depends on a
person remembering is not a promise.

## Decision

1. **One job, two steps.** `scripts/run-adapter-sync.mjs` runs the puller and then the dispatcher in one Cloud Run job
   execution, with one trigger, one service account and one log stream. The steps are independent: the second runs even
   if the first failed. The exit code is the worst of the two (2 a setting is wrong, 1 needs a look, 0 clean), and Cloud
   Run marks a non-zero exit as a failed execution.
2. **Compiled, not transpiled at run time.** `scripts/build-adapter-sync.mjs` compiles the host libraries the commands
   import (following their relative imports) to `dist/adapter-sync/`. The image's first stage compiles with a pinned
   `typescript`; the final stage has no `typescript` and no `node_modules`. The loader `scripts/lib/hostLibLoader.mjs`
   uses the compiled folder when it exists and transpiles the source otherwise, so a checkout behaves as before.
3. **One job per client and per adapter**, named `veloce-adapter-sync-CLIENT-ADAPTER`. A second adapter is a second job
   from the same image.
4. **Every five minutes, 300 seconds, no retries.** A failed run waits for the next tick. Every step is safe to repeat:
   racing pullers store nothing twice (the cursor advances only from the value it read), and a repeated erase request
   returns the same receipt.
5. **Both steps check the background owner** (the record the retention job uses), so during a blue/green overlap only one
   deployment acts.
6. **A failed execution alerts.** A note given up on after ten tries makes the dispatcher exit 1, so the job fails and the
   alert policy fires until someone resolves it. Without this a deletion that was never confirmed would only show in a log.
7. **Secrets by reference.** The job reads exactly three Secret Manager secrets: the database address, the service key
   and the host's Ed25519 signing key (ADR-012). The adapter's address is plain configuration and must be https.

## What was built (all local, nothing applied to any cloud project)

`scripts/run-adapter-sync.mjs`, `scripts/build-adapter-sync.mjs`, `scripts/lib/hostLibLoader.mjs`, the two existing
commands switched to the loader, `infra/adapter-sync-job/` (Dockerfile, `job.yaml`, `alert-policy.yaml`, README),
`tests/adapter-sync-job.spec.ts` (the image simulated in a folder with no `node_modules`) and mutation-sweep targets.

## Cloud proof, 2026-10-23

In `agentos-mvp` (job `veloce-adapter-sync-agentos-staging-creator-os`, image `adapter-sync-job:v1` built by Cloud Build, signing key in Secret Manager) against a throwaway `zz-contract-fixture` Cloud Run service (the real Content OS service with a scripted model, public at the network level, every route 401 without a host-signed token):

1. Run 1, empty feed: one page read, nothing due, exit 0 (tokens accepted over https, owner gate, secrets by reference).
2. A task started on the fixture with a one-off token minted from the real key; run 2 ingested 1 proposal from 2 events, cursor 2.
3. The note was approved and withdrawn on staging (temporary admin membership, removed in the same transaction); run 3 sent the erase request and recorded the receipt: acknowledged, 4 copies erased, 1 attempt.
4. All staging rows were then removed. Still in place at the time of writing: the job, the image, the three secrets, the service account and the throwaway fixture service (to delete). Not created: the scheduler and the alert.

## Still open

- The scheduler and the alert (not created), and tearing down the throwaway `zz-contract-fixture` service.
- A real Content OS deployment (`main.ts` production wiring) is separate and still open.
