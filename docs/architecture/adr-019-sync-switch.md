# ADR 019: The sync switch

**Status:** decided 2026-10-26 with the owner (D1 to D4, with D2 changed to add "always" for paying clients); built, tested, and **applied to staging and deployed on 2026-10-26** (migration, job image `adapter-sync-job:v2`, `ADAPTER_SYNC_USES_SWITCH=true`, scheduler enabled at `*/5`). **The page was checked in a browser on 2026-10-26** (see "Deployed").
**Builds on:** ADR-015 (the sync job), ADR-014 (deletion receipts), ADR-018 (the real Content OS service and its cost).

## The problem

The sync job asks the adapter for its events and tells it what to erase, every five minutes. The job is cheap. The adapter is not:
the real Content OS service keeps its CPU allocated so tasks can run in the background, and a Cloud Run instance stays up for
about fifteen minutes after each request, so a call every five minutes keeps it up all day. One CPU and 1 GiB around the clock
is roughly $50 a month (an estimate from published rates, not a bill). Hourly polling is about a quarter of that, and no polling
is nothing. The owner wanted the cost under control, with the control visible in the product.

## Decisions

1. **The switch is a flag the job reads (D1), not a thing the app controls.** The scheduler keeps firing; each run first asks the
   host (`client_adapter_sync_switch_job_check`, service role only) and, when the answer is "skip", ends with exit 0 and never
   calls the adapter. The app needs no cloud credential: changing the switch writes one row through an admin-only function.
   Without `ADAPTER_SYNC_USES_SWITCH=true` every run goes ahead as before. If the answer cannot be got or understood, the run
   fails (exit 1, so the alert fires) and the adapter is not called; it never guesses "go".
2. **Time-boxed, with "always" gated (D2).** Admins choose off, 1 hour, 4 hours or 24 hours; it turns itself off at the end.
   "Always" exists, but only the operator (service role) can allow it for a client, for a client who is paying for it. A tenant
   admin cannot give themselves an unlimited bill; forbidding it again turns it off.
3. **Sync now (D3).** An admin can ask for exactly one run; the next run uses the request up. Asking twice is one request. It does
   not turn the switch on. A deployment that is not the background owner never uses a request up (the owner check comes first).
4. **A deletion is never paused (D4).** A run also goes ahead, whatever the switch says, when a note the host erased has no
   confirmed copy-erasure at an adapter that promised a receipt (ADR-014). A deletion given up on after ten tries does not force a
   run, since the job's own alert already covers it and more runs would only repeat it. Both steps of the job are switched
   together.
5. **Who sees and changes it.** Any active member reads the state; only an owner or admin changes it (the same check as
   promotions); each change is audited. Nothing tenant-specific comes from the request: the tenant is the server's setting.
6. **The page.** A "Sync switch" panel at the top of the Adapters page: a clear on/off switch, the time left, a duration choice,
   a Sync now button, and a plain line about what each state costs. If the state cannot be read the panel says so; it never shows
   a guess.

## Checked

SQL tests on real PostgreSQL (PGlite): the default is off, the three durations, expiry, owner and admin versus member, outsider and
another client's owner, bad modes, an adapter that is not enabled, "always" refused until allowed and turned off when
forbidden, only the service role can ask or allow, Sync now used up once, owed deletions forcing a run until the receipt is
recorded, and no-receipt and given-up deletions not forcing one. Runner tests run the real script in an image-shaped folder against stub servers: each reason to
run, the off case (exit 0, the adapter and the feed untouched), a missing or unclear answer (exit 1), a missing setting (exit 2, by name only),
and no switch configured. Route tests: every gate, tenant only from the server, a closed set of modes, database refusals as stable
codes. 18 deliberate breakages of these rules were each caught by a test.

## Deployed (2026-10-26)

- The migration is applied to staging; the grants were read back (the job check and "allow always" are service role only, the
  admin and member functions are for signed-in users only, nobody anonymous).
- The job runs `adapter-sync-job:v2` with the switch on. With the switch off, a manual run and then a scheduled run each took about
  1 second, exited 0, logged `skipped=True` with the reason "the sync switch is off", and made no request to the adapter service.
- The scheduler `veloce-adapter-sync-agentos-staging-creator-os` is enabled at `*/5 * * * *`. **It had never worked until now:** its
  address was created ending in `creator-osun` (zsh read `$J:run` as a modifier on the variable), so its 01:40 UTC attempt
  failed with NOT_FOUND. It was fixed with `${J}:run`, and the 01:45 UTC scheduled run succeeded. Anyone building such a
  URL in zsh should write `${J}:run`.
- The registry row for `creator-os` is a normal row (not marked `zz-`), so the staging deployment now has a registered adapter.
- **The page, in the browser pane against staging.** With a temporary admin membership (added and removed afterwards) the panel
  showed `creator-os` Off, the switch, the duration choice and Sync now. Turning it on read "On, 1 h left"; Sync now read "Sync
  queued"; the next scheduled run logged `run=run_now`, ran both steps and exited 0 in 7.5 s (cold start included), after which the
  request was no longer pending; turning it off read Off in the page, the API and the database. One fault found and fixed: the
  confirmation text appeared a few seconds before the headline changed, so the panel now waits for the new state first.
- A signed-in account that is not a member of the tenant the app serves sees "Sign in to see adapters", which is the same notice as
  being signed out. That is correct for the data but confusing; wording that tells the two apart is not built.

## Not done
- Nothing yet stops the adapter service from being kept warm by something else (a task started by hand, for example).
- Turning the switch on does not warm the service ahead of time; the first run after it is on pays the cold start.
- The cost figures are estimates, not measurements. A real bill should be checked after a week of use.
