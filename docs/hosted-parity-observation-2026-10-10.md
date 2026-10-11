# Manual Local and Cloud Test Observation

Date: 2026-10-10 America/New_York  
Local surface: `http://127.0.0.1:3941`  
Cloud Test surface: `https://veloce-cloud-test-mquo4bf7aq-el.a.run.app`

## Observed

- Both signed-in browser tabs rendered the client workspace landing page and
  the broad six-lens navigation. Both showed no completed agent runs and no
  provider token usage.
- Local `/memory` exposed a `Community sources` section and `Review JSON source
  packs` action. Cloud Test `/memory` did not expose either control in the
  rendered page.
- Local `/memory` reported 2 tenant memories, 114 graph nodes, and 113 edges;
  Cloud Test reported 24 tenant memories, 33 graph nodes, and 57 edges.
- The local landing page reported telemetry available, `$0.00` budget usage,
  and one older `Provider Workspace Opened` activity. Cloud Test reported
  `$0.00` usage, zero provider-reported tokens, tenant-scoped controls active,
  and no hosted activity.
- Cloud Test described source links as staying local on its landing page;
  local described tenant records and source links as inspectable in the
  workspace.

## Interpretation and Limits

The missing local-only source controls are a concrete UI/feature-parity lead.
The data counts differ, but the browser view alone does not prove both tabs
were bound to the same tenant or backing database, so the count mismatch is
not yet evidence of data loss or a tenant-isolation failure. No records were
created or modified, and no provider calls were made. The automated read-only
surface-map verifier remains blocked because its session-cookie file is absent.

Next verification should establish both runtimes' tenant/build identities,
then compare the same source-import and memory surfaces without creating
records. No deployment or hosted changes are authorized by this observation.
