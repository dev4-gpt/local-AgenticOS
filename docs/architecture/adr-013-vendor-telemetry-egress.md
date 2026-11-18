# ADR 013: What the telemetry vendors may receive

**Status:** decided 2026-10-20 with the owner (Sentry and Datadog allowed, on the condition that a test proves no client text leaves).
**Builds on:** the 28+7 day deletion promise (`docs/guide/03-safety-and-retention.md`). **Code:** `src/lib/clientRuntimeObservability.ts`. **Proof:** `tests/client-vendor-egress.spec.ts`.

## The problem

A vendor keeps what it receives on its own schedule, outside our 28+7 days. If a client's words reach Sentry, Datadog or PostHog, we can no longer
promise they are deleted. So the rule is not "be careful what we send"; it is "client text cannot be sent".

## Decision

1. **One gate.** Every vendor sink (PostHog, Sentry, Datadog) is fed only by `vendorSafeFields`. No other file in `src/` may contain a vendor
   address; the egress test scans for it, so a new sink cannot skip the gate.
2. **Ten field names, nothing else:** `tenant`, `status`, `reason`, `provider`, `capability`, `classification`, `requestId`, `jobId`, `attempt`,
   `messageCount`. The list is pinned in the test. Changing it is a decision, not a side effect.
3. **Values are shaped or fixed.**
   - `tenant` is a one-way hash (`tenant:<24 hex>`); the client's name never leaves.
   - `status`, `attempt`, `messageCount` are whole numbers from 0 to 999. `requestId` and `jobId` must be UUIDs.
   - `reason`, `classification`, `provider` and `capability` must be on a fixed list in the code (the provider contracts, the capability catalog, the
     known error codes, the seven failure classes). Anything else is sent as `other`. A client slug that looks like a code (for example
     `acme-q3-pricing`) therefore cannot get through.
4. **No error text, stack traces, prompts, messages, URLs or emails, ever.** There is no vendor SDK: unhandled exceptions are not sent anywhere.
5. **Off by default.** Each vendor needs its own switch and key (`CLIENT_POSTHOG_CAPTURE_ENABLED`, `SENTRY_DSN`, `CLIENT_DATADOG_CAPTURE_ENABLED`
   with `DATADOG_API_KEY`). Keys live in Secret Manager (ADR-012), never in the repository. A vendor failure never fails the operation (2 second limit).
6. **Datadog** goes to `https://http-intake.logs.<site>/api/v2/logs` with the key in the `DD-API-KEY` header, on one of the commercial sites only
   (`datadoghq.com`, `us3`, `us5`, `datadoghq.eu`, `ap1`, `ap2`, `uk1`); the gov sites are not allowed. Checked against the vendor's documentation on 2026-10-20.
   Our fields sit under a `veloce` object so they cannot overwrite Datadog's own `status` (log level).

## What each vendor still holds, for the deletion promise

Only the ten fields above plus the event name (a fixed code such as `runtime.provider_failed`) and a timestamp. None identifies a client, because the
tenant is hashed, and none contains client content. Set the shortest retention each vendor allows. If a client leaves, the hashed tenant tag is the
only thing that ties events to them; we cannot reverse it, and the vendor cannot either. State this to the client in plain words in the data processing terms.

## Adding a new reason, provider or capability

A new error code shows up in vendors as `other` until it is added to `KNOWN_REASONS`. That is deliberate: the cost of a missing entry is a less specific
chart, not a leak. Add it with the code that introduces it.

## What this does not cover

Our own Google Cloud logs (`console.info`) still carry the real tenant slug. They are inside the client's own project and follow its retention, not a vendor's.
Student offers (Sentry, Datadog) end with student status; check each plan's terms before relying on one for a client.
