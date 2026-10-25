# ADR 018: Running the real Content OS service for the host

**Status:** decided 2026-10-24 with the owner (D1 to D7, with D1 changed to a free model API); built in Phase 2 item 2 and pushed. The service is deployed to staging. Cloud steps 1 to 5 are done (mount test, state bucket, secrets, deploy, first real task); steps 6 and 7 are not.
**Builds on:** ADR-005 (the adapter host contract), ADR-010 (AGPL separation), ADR-012 (token keys), ADR-015 (the sync job), ADR-017 (draft text).

## The problem

Everything the host does with an adapter had been proven against the contract fixture: the real Content OS service with a
scripted model and scripted research, started only on loopback by a test script. Nothing could run the real service in the
cloud. The real service needed a model it could call over the network, a way to find and read web pages, durable state, a
production start script, and an image.

## Decisions

1. **The model (D1): any chat-completions API, free tier first.** `OpenAiCompatRunner` takes an address, a model name and a
   key, so Groq, OpenRouter's free models or Google's compatible endpoint are a setting, not code. Prices default to zero. It
   retries rate limits and server errors with a growing wait (honouring `Retry-After` up to a cap), refuses redirects and
   plain http (except loopback), caps the answer size, and never puts the key, the prompt or the provider's words in an error.
   Because a free model costs nothing, the dollar cap can never stop a runaway task, so the run manager also keeps a
   per-task **token cap** (default 60,000). It is checked before each paid step, so a step can carry a task over it by at most
   itself.
2. **Research (D2):** the existing `WebResearch` and `PoliteFetcher` (public hosts only, robots.txt, redirect and size limits,
   a delay per host) read the pages; a new Brave Search adapter only finds their addresses. A search result is a suggestion
   and never evidence.
3. **Storage (D3):** the service keeps its vault, run state, event log and used token ids as files. The production start
   script runs a **storage self-test** (replace by rename, append in order, flush, keep a private file private, list) in a
   folder of its own and refuses to start if any step fails, naming the step. The plan is a Cloud Storage bucket mounted as
   the state folder with the service pinned to exactly one instance. **That is unproven**: the self-test exists so a mount
   that cannot be trusted is found at start-up and not as lost data. The fallback is a small VM with a persistent disk.
4. **Tenant and keys (D4):** tenant `agentos-staging`; the host's public key (up to three while one rotates) is a setting. A
   private key in that setting is refused.
5. **Safety defaults (D5):** draft class only; at most 2 tasks at once (a new task over the limit gets `503 busy`, and a replay
   of a known task is never refused); a ceiling on the budget a task may ask for (default $1, over it is `400 budget_too_high`);
   the token cap above. The old read-only routes stay locked unless a service key is given.
6. **Every setting is checked at start-up, by name.** All problems are reported at once, each naming the setting and never its
   value. `--check` validates and self-tests without listening (exit 2 for a setting, 3 for the folder).
7. **Order (D7):** everything is built and tested locally first; each cloud step (bucket, secrets, image, service, a proof run,
   then pointing the sync job at it) waits for the owner's yes.

## Checked so far

The runner, the search adapter, the limits and the start-up have tests and breakage checks (every mutation caught or
recorded as redundant). The image was **built and run locally**: non-root user, `--check` passes against a mounted folder and
cleans up after itself, it refuses missing settings, it listens, answers 401 without a token and serves the manifest to a
signed token once (a second use is refused), and it keeps its used-token log on the mounted folder.

## Cloud step 1: the Cloud Storage mount, 2026-10-24

The production image (`creator-os:v1`, built by Cloud Build) ran as a Cloud Run **job** with a throwaway bucket mounted at
`/data` (second-generation environment, `uid=1000;gid=1000;file-mode=600;dir-mode=700`) and the same `--check` the service
runs before it listens. **Every self-test step passed on the real mount and the container exited 0**: replace by rename,
append in order, flush, keep a private file private, list. Notes:

- The mount logged one "directory not empty" error while the self-test removed its own folder; the bucket was empty afterwards.
  It shows a brief delay in how removals appear, not a failure.
- Cloud Run reports the mounted files as owned by an internal user (uid 2000), not the service's user. The permissions came out
  private and reads and writes worked, so nothing is affected.
- This proves the sequence the service depends on. It does not prove behaviour under heavy concurrent writes, so the service stays
  pinned to **one instance maximum** (it may scale to zero when idle: state is in the bucket, only a cold start is lost).

## Cloud step 2: the real state bucket

`veloce-creator-os-agentos-staging-state` in `europe-west1`: uniform access, public access prevention enforced, no versioning and
**soft delete off** (Cloud Storage otherwise keeps deleted objects for 7 days, which would undo "erased for good"). Only the
`veloce-creator-os` service account has access beyond the project's own default roles (`objectUser`: read, write, list, delete
objects; no bucket administration). The throwaway test bucket and test job were deleted.

## Cloud step 5: the first real task, 2026-10-25

The first `content.draft` task (a made-up one-sentence brief) failed after 10 seconds with spend 0. Search and page reading had
worked (5 citations), so the failure was the first model call. Listing the models the Groq key can use showed that
`llama-3.3-70b-versatile`, the configured model, is **not available to this key**. The model name is a setting, so the fix was
`CONTENT_OS_LLM_MODEL=openai/gpt-oss-120b` (new revision `00002`, nothing else changed). The service log cannot show why a task
failed, because it prints setting names and counts only; a failed task's state says just "failed".

The rerun with a new idempotency key **succeeded in 57 seconds**: quality passed with score 100 after 1 repair, 5 citations,
2 drafts (the first and its repair, about 1,100 characters each), spend 0 (free tier), 0 proposals (normal for a draft task).
Observations:

- The drafts ran about 170 words against about 150 asked for, and the title is the brief cut off at 70 characters.
- Token use is not reported on the task. With spend 0 the dollar cap cannot stop a runaway task; the per-task token cap does.
- A failed task should record a short, key-free reason. That is not built.

## What is not checked, and why it matters

- **One real model and search call have been made (step 5), with one task.** It passed the factory's quality checks, but one
  task does not show how often a free model does. Expect more failed drafts than with a paid model.
- **Data terms of free tiers.** Free model APIs often have looser terms than paid ones (some may log prompts or use them to
  improve products). The briefs and research a task sends are client content. For staging with made-up briefs that does not
  matter. **Before a real client's work goes through a free API, someone must read that provider's current terms.** This is an
  open item for the owner.
- **The model list changes.** The model name is a setting; check what the free tier offers before the first run.

## What comes next (not built)

- **Models through the host.** The owner's intent: after this self-contained test proves the capability, let Content OS use
  the models already in Veloce AgenticOS. That needs a new contract operation where the adapter calls the host, a credential
  in the other direction, and a reversal of the rule that an adapter never calls the host (ADR-005, ADR-012). It gives one place
  for provider keys, caps and policy, and puts every model call in the budget ledger so the Spend check (ADR-016) compares
  reserved against actual. It needs its own ADR and the owner's decision. The runner is behind the small `AgentRunner`
  interface, so a host-brokered runner would replace it without touching the rest.
- The cloud steps in decision 7, and then the scheduler and alert for the sync job (ADR-015) once the service has an address.
