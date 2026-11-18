# Scheduled retention job (tracker item 9b)

Runs the 28 + 7 day retention command for one client once a day. One job per client, because each client has its own
database and its own cloud project. Cloud Scheduler starts a Cloud Run job; the job runs
`scripts/run-scheduled-retention.mjs`, which calls `scripts/client-lifecycle.mjs --mode retention` with every
confirmation flag. Decided 2026-10-20 on the owner's behalf: Cloud Scheduler plus a Cloud Run job, because clients are
already on GCP and the service key stays in Secret Manager instead of GitHub. Choosing a different scheduler later
only changes who starts the job; the job itself does not change.

**Built and tested here:** the entry script, the Dockerfile, the job spec, and a test that the image contains
everything the command imports. **Not done, and only you can do it:** deploy it, and watch a scheduled run in the logs.
The tracker item is closed only after that.

## One-time set-up per client (placeholders in capitals)

1. Put the two secrets in Secret Manager, `CLIENT_SLUG-supabase-url` and `CLIENT_SLUG-supabase-service-role-key`, and
   let the job's service account read them (`roles/secretmanager.secretAccessor`). Never paste either into a file or chat.
2. Build and push the image from the repository root:
   ```bash
   docker build -f infra/retention-job/Dockerfile -t REGION-docker.pkg.dev/PROJECT_ID/veloce/retention-job:TAG .
   docker push REGION-docker.pkg.dev/PROJECT_ID/veloce/retention-job:TAG
   ```
3. Fill in `job.yaml` and create the job, then give the scheduler's service account `roles/run.invoker` on it:
   ```bash
   gcloud run jobs replace infra/retention-job/job.yaml --region REGION
   ```
4. Record which deployment is the background owner. This must equal `BACKGROUND_DEPLOYMENT_ID` in `job.yaml`:
   ```sql
   select public.client_adapter_background_owner_set(null, 'veloce-CLIENT_SLUG-main', 'your-name');
   ```
5. Schedule it (daily, early morning UTC):
   ```bash
   gcloud scheduler jobs create http veloce-retention-CLIENT_SLUG \
     --location REGION --schedule "17 3 * * *" --time-zone UTC --http-method POST \
     --uri "https://run.googleapis.com/v2/projects/PROJECT_ID/locations/REGION/jobs/veloce-retention-CLIENT_SLUG:run" \
     --oauth-service-account-email SCHEDULER_SERVICE_ACCOUNT
   ```

## Going live

1. The job starts as a dry run (`RETENTION_APPLY "false"`). Run it once by hand and read the log:
   ```bash
   gcloud run jobs execute veloce-retention-CLIENT_SLUG --region REGION --wait
   gcloud logging read 'resource.type="cloud_run_job" AND resource.labels.job_name="veloce-retention-CLIENT_SLUG"' --limit 50
   ```
   You should see `retention-job-start`, the command's JSON report, and `retention-job-end` with `exitCode: 0`.
2. Set `RETENTION_APPLY` to `"true"` in `job.yaml`, run `gcloud run jobs replace` again, and wait for the next
   scheduled run. That run in the logs is what closes the tracker item.

## Reading the log

- `"skipped": true, "reason": "this deployment is not the background owner"`: the owner record names another
  deployment. Nothing was purged. This is the safe answer during a blue/green overlap; fix the owner record if it is wrong.
- `retention-job-refused`: a setting is missing or malformed (the reason names which, never its value).
- `exitCode` other than 0: the command stopped. There are no automatic retries, so the next scheduled run tries again.

## Handing over to a new deployment

Deploy the new revision with its own `BACKGROUND_DEPLOYMENT_ID`, then move the record in one step so only one
deployment ever holds it: `select public.client_adapter_background_owner_set('veloce-CLIENT_SLUG-main', 'NEW_ID', 'your-name');`
(it returns `false` and changes nothing if someone else moved it first).
