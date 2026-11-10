# Scheduled adapter sync job (Phase 2 slice 2d, ADR-015)

Every five minutes, for one client and one adapter, this job (1) reads the adapter's `events` feed into the host, where
each proposal becomes a private note and a queued promotion (ADR-013), and then (2) tells the adapter to erase what the
host has erased and records its receipts (ADR-014). The two steps are independent, safe to repeat, and each one does
nothing unless this deployment is the recorded background owner.

**Built and tested here:** the compile step, the combined runner, the Dockerfile, the job spec and the alert policy.
**Not done, and only you can do it:** create the cloud resources below, deploy, and watch scheduled runs. Nothing in this
folder has been applied to any cloud project.

## One-time set-up per client and adapter (placeholders in capitals)

1. Service account `veloce-adapter-sync` with `roles/secretmanager.secretAccessor` on exactly three secrets:
   `CLIENT_SLUG-supabase-url`, `CLIENT_SLUG-supabase-service-role-key` and `ADAPTER_TOKEN_SIGNING_KEY` (ADR-012). You paste
   the values yourself; they never go into a file or a chat.
2. Build and push the image from the repository root (Cloud Build or Docker):
   ```bash
   docker build -f infra/adapter-sync-job/Dockerfile -t REGION-docker.pkg.dev/PROJECT_ID/veloce/adapter-sync-job:TAG .
   docker push REGION-docker.pkg.dev/PROJECT_ID/veloce/adapter-sync-job:TAG
   ```
3. Fill in `job.yaml`, create the job, and let the scheduler's service account invoke it:
   ```bash
   gcloud run jobs replace infra/adapter-sync-job/job.yaml --region REGION
   ```
4. The adapter must be reachable over https and must hold the host's **public** key (ADR-012). The deployment id in
   `job.yaml` must equal the background owner record (the same record the retention job uses):
   ```sql
   select public.client_adapter_background_owner_set(null, 'veloce-CLIENT_SLUG-main', 'your-name');
   ```
   The adapter must also be registered for this client with the `receipt` deletion guarantee, or the second step has
   nothing to send.
5. Schedule it:
   ```bash
   gcloud scheduler jobs create http veloce-adapter-sync-CLIENT_SLUG-ADAPTER_ID \
     --location REGION --schedule "*/5 * * * *" --time-zone UTC --http-method POST \
     --uri "https://run.googleapis.com/v2/projects/PROJECT_ID/locations/REGION/jobs/veloce-adapter-sync-CLIENT_SLUG-ADAPTER_ID:run" \
     --oauth-service-account-email SCHEDULER_SERVICE_ACCOUNT
   ```
6. Create the alert (replace the channel first): `gcloud alpha monitoring policies create --policy-from-file=infra/adapter-sync-job/alert-policy.yaml`

## The sync switch (keeps the bill down, ADR-019)

The job runs every five minutes, which is cheap. What costs money is calling the adapter, because that keeps its service running
all day (roughly $50 a month for one always-warm service). With `ADAPTER_SYNC_USES_SWITCH=true` (set in `job.yaml`) each run first
asks the host, and when the switch is off it ends at once with `skipped: true`, exit 0, and never calls the adapter, so the service
can scale to zero. Apply `supabase-client-adapter-sync-switch.sql` first; without it the run fails (exit 1) and the alert fires.

A run goes ahead when the switch is on (1, 4 or 24 hours from the Adapters page, then it turns itself off), when an admin pressed
Sync now (one run), or when a deletion is owed to an adapter that promised a receipt (a withdrawal is never paused by the switch).
"Always on" exists but only the operator can allow it for a client, for a client that pays for it:
`select public.client_adapter_sync_switch_allow_always('CLIENT_SLUG', 'ADAPTER_ID', true);` with the service role.

## First run

Run it once by hand and read the log before scheduling: `gcloud run jobs execute veloce-adapter-sync-CLIENT_SLUG-ADAPTER_ID --region REGION --wait`.
You should see three JSON lines: `events-puller-end`, `tombstones-dispatch-end`, then `adapter-sync-end` with `exitCode: 0`.

## Reading the log

- `skipped: true` on both steps: this deployment is not the background owner. Nothing was read or sent. Fix the owner record if it is wrong.
- `REFUSED: SETTING is not set` (exit 2): a setting is missing or malformed; the line names which, never its value.
- `events-puller-end` with `stopped` set: `adapter_refused` or `adapter_unreachable` means the adapter did not answer well; `database_unavailable` means the host database did not.
- `tombstones-dispatch-end` with `summary.gaveUp` above zero: an adapter has not confirmed an erasure after ten answers. This is a deletion promise not yet kept; the job fails and the alert fires until it is resolved.
- Exit code 1 means look, 2 means a setting is wrong. There are no automatic retries; the next run repeats safely.

## Rotating the signing key

Follow ADR-012: add the new public key to the adapter first, then add a new version of `ADAPTER_TOKEN_SIGNING_KEY`. The job
reads `latest`, so the next run uses the new key.
