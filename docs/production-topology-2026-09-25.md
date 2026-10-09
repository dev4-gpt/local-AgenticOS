# Canonical Production Topology

**Status:** active working record; this is not a GA release acceptance.
**Verified:** 2026-09-26

This record supersedes historical "current deployment" claims in older
runbooks. It describes what was directly verified in the connected Vercel and
Google Cloud accounts. It does not authorize a deployment to a new cloud
target.

## Verified current state

| Surface | Verified target | Current state | Role |
| --- | --- | --- | --- |
| Editorial front door | `https://app.veloceos.cloud` | Vercel deployment `dpl_ECwKPW7sLjQhS364gM1pEJERX6Qa`, READY; live page title is `Veloce AgenticOS | Private Operator Edition` | Public product narrative and runtime-request entry, not the authenticated workspace |
| Apex domain | `https://veloceos.cloud` | Older Git-connected Vercel deployment from `d658ad6` | Existing public route; not the current application revision |
| `www` domain | `https://www.veloceos.cloud` | Separate `veloce-agenticos-public` Vercel deployment | Existing public marketing route |
| Legacy Cloud Run | `agentos-mvp`, service `agentos`, `europe-west1` | Revision `agentos-00013-q7f`, image `agentos:4a347ad3fc308086fdb1b38b7ac56fb3e55251ae`, deployed 2026-05-27 | Legacy service; not associated with this repository's current commit |
| Internal beta Cloud Run | `agentos-mvp`, service `agentos-internal-beta`, `europe-west1` | Revision `agentos-internal-beta-00034-v69`, image `sha256:70d24863d095aa9753cf02629a30458f7fdd8ef81bfc5ed2ce35e2c0ed16da57`, 100% service traffic, owner-only allowlist, provider calls disabled | Controlled internal beta runtime; live email callback accepted, public customer activation still closed |

Read-only Cloud Run configuration check on 2026-10-09 confirmed that this
internal-beta service uses `SUPABASE_URL=https://ppmoqjtmjtfxadsnejqc.supabase.co`
and `CLIENT_SLUG=internal-beta`. The same Supabase project is the production
database in the recorded Veloce rollout. `internal-beta` is a tenant, not a
separate database. A migration that replaces a `public` RPC in that project
changes the function for every tenant; beta-only approval does not authorize
that project-wide write. The new source-pack RPC guard has not been applied
there. Use a separate disposable database for beta-only migration testing or
obtain explicit project-wide approval after preflight and rollback review.

Live browser inspection on 2026-09-26 confirmed that the `app` domain serves the
`product-experience` editorial site. Its `Runtime access` > `Client login`
link targets `https://veloce-cloud-test-1075094991117.asia-south1.run.app/login?next=%2F`,
an approved test runtime, not a shared production workspace. The root repo's
local Next.js UI and the `app` domain are therefore different applications;
visual comparison between them is not deployment parity evidence. See
[the UI parity observation](./ui-parity-observation-2026-09-26.md).

The current source no longer has an implicit cloud-test login fallback. Its
public menu links to `/login`, where a disabled-by-default server route can
request a non-signup email link for an existing active account. The existing
`/auth/callback` resolves one active onboarding account to its tenant runtime
and now rechecks active tenant membership before handoff. None of this source
change is deployed or accepted; email delivery, callback path, customer
domain, and signed-in repeat-login evidence remain release gates.

Read-only live check on 2026-10-03: `https://app.veloceos.cloud/` returned 200,
but `https://app.veloceos.cloud/login` returned 404. The older Cloud Run test
login returned 200. This confirms the shared-login source is not live on the
public `app` domain; do not offer that URL as a working client login yet.

Read-only refresh on 2026-10-06: the public `Runtime access` > `Client login`
menu still points to the single `veloce-cloud-test` login, and the public
`/login` route still returns 404. In the user's Chrome Work profile, the
`agentos-internal-beta` workspace was signed in and its `/memory` page loaded
tenant-scoped records. The visible `Classroom Research` link redirected to
`/client-unavailable?route=%2Fclassroom-research`; its presence in navigation
is not evidence that the client feature is available. A read-only Cloud Run
revision query was denied `run.services.get`, so this refresh does not confirm
the current internal-beta revision or replace the 2026-09-26 revision receipt.

Read-only refresh on 2026-10-07: the signed-in Chrome Work window still showed
`agentos-internal-beta-vbimnfseva-ew.a.run.app/memory` with tenant-scoped
memory and graph counts. Its navigation still exposed `Classroom Research` and
`Social Research`, and the Memory page offered Markdown import/export but no
`Community sources` JSON source-pack import. Local source commit `e8eacac`
renders that import control on Memory and excludes operator-only research from
default client navigation; local tests do not prove those changes are hosted.
No Cloud Run revision, deployment identity, or same-commit parity was verified
in this browser check. Treat `sourceImportResult` and `uiParityResult` as open
release gates; do not describe the bonus link index as a full classroom import.

Further read-only Chrome Work check on 2026-10-07: the current public
`https://app.veloceos.cloud/login` rendered a 404 page, while the local client
server at `http://127.0.0.1:3569/memory` redirected to its own login page in
the same Chrome profile. The signed-in beta session therefore did not establish
a signed-in local comparison. A fresh `vercel inspect` was inconclusive because
the CLI's saved token was invalid; the earlier Vercel deployment identity above
was **not** revalidated. Public J08 requires a reviewed deployment of the
`product-experience` app, a working `/login`, configured email/callback routing,
and an actual disposable-tenant sign-in/recovery test. Do not send customers to
the 404 URL or substitute the single-tenant Cloud Test link as their shared login.

Read-only Cloud Run and Cloud Build recheck on 2026-10-09, using a second
already-configured Google account with `run.services.get`: 100% of the
`agentos-internal-beta` service traffic still reaches revision
`agentos-internal-beta-00034-v69`, image
`sha256:70d24863d095aa9753cf02629a30458f7fdd8ef81bfc5ed2ce35e2c0ed16da57`.
Cloud Build `e53232d7-620b-4783-b720-903486ae2ae2` produced that digest on
2026-09-26 at 16:23 UTC from a storage source. Its metadata has no resolved
repository commit or commit substitution, and the Cloud Run service has no
`VELOCE_BUILD_SOURCE_COMMIT` stamp. The digest is verified; a source SHA for
that image is not. The service's page allowlist includes `/capabilities` and
`/paperclip`, while its API allowlist omits both
`/api/client-runtime/source-import` and `/api/client-runtime/build-identity`.
`CLIENT_ENABLED_CAPABILITIES` is `tenant-data,artifacts,orchestration,quality`,
provider calls remain disabled, and `CLIENT_RETENTION_DAYS` is `1`, not the
owner-selected 45-day customer-data period. This is an internal-beta setting,
not evidence of a compliant production policy. A new image alone would leave
the two APIs unreachable under this runtime configuration. Reconcile the
allowlists and retention setting in a reviewed new revision, then verify its
source stamp, image digest, signed-in routes, two-member isolation, and data
retention before claiming local/cloud parity. No setting or traffic was changed
by this read-only check.

Read-only storage-policy follow-up on 2026-10-09: the internal-beta bucket
`agentos-mvp-veloce-internal-beta` has one Delete lifecycle rule with `age: 1`
and `matchesPrefix: ["internal-beta/"]`. Its reported soft-delete retention is
604800 seconds (seven days); the bucket description did not report a versioning
setting. This is consistent with the one-day runtime configuration, but it is
not the selected 45-day policy and does not prove object-by-object permanent
deletion, database-row cleanup, backup deletion, or vendor-copy deletion. No
object names or bytes were inspected, and no bucket setting was changed.

The legacy Cloud Run service is publicly reachable but its `/`, `/healthz`, and
documented `/status` routes returned `404` during this verification. Its source
image commit is not present in this repository. It must not be used as a
client runtime, provider worker, or release-evidence target without a new
design and acceptance run.

## Cost and safety controls

- `agentos-mvp` has a project-scoped monthly budget alert named `AgentOS monthly
  $5 guardrail`, with alerts at 50%, 90%, 100%, and forecasted 100% spend.
- The legacy `agentos` service has a minimum instance count of zero and a
  service-level maximum of one instance. It still receives 100% of traffic to
  its own legacy URL; no new image, traffic migration, or deletion was made.
- The internal beta service also has a minimum instance count of zero and a
  service-level maximum of one. It is app-auth protected, allowlists one owner,
  has no provider credential, and receives only a tenant-scoped Supabase
  publishable-key secret.
- A budget sends alerts. It is not a hard billing cutoff.

## Architecture decisions

1. Vercel is the canonical host for the current public editorial surface. Its
   acceptance uses `app.veloceos.cloud` and a named Vercel deployment. Tenant
   workspace acceptance must use the exact Cloud Run service and revision under
   test; it cannot be inferred from the Vercel page.
2. The desired domain topology remains unresolved: `veloceos.cloud` and
   `www.veloceos.cloud` may serve marketing, but `app.veloceos.cloud` currently
   does too. Moving the `app` domain to a shared authenticated workspace first
   requires that workspace, routing, and a separate domain-change acceptance.
   No live domain reassignment is authorized by this record.
3. `agentos-mvp/agentos` is a legacy workload. Keep it constrained and do not
   duplicate the Vercel application into it. Its eventual disposition is an
   explicit retirement or a minimal redirect/migration service.
   The separately deployed client-safe internal-beta service is recorded under
   the controls in
   [the beta runtime assessment](./agentos-mvp-beta-runtime-assessment-2026-09-25.md).
4. References to `veloce-agenticos-2026` are historical configuration, not a
   verified active cloud target. No command may use it by default until its
   ownership, billing, and deployed services are freshly verified.

## Consequences for releases

- A Vercel deployment alone proves only the public application surface.
- The existing release-ledger workflow cannot be used as proof for a public or
  GA launch until provider, domain, and commercial activation evidence exists.
  The internal-beta email callback, owner, and client artifact boundary now
  have separate live evidence.
- Future release commands must receive their cloud project, region, service,
  image digest, and ledger bucket explicitly. Do not infer them from older
  documentation.

## Next controlled changes

1. Review the apex and `www` marketing deployments, then approve or reject the
   proposed domain topology.
2. Keep the verified `agentos-internal-beta` callback and owner-only access
   separate from any public customer or paid flow; its live disposable browser
   acceptance passed on 2026-09-26.
3. Review provider, domain, and commercial activation decisions separately;
   do not infer them from the internal-beta deployment.
