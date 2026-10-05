# Local and Cloud UI Parity Observation

**Observed:** 2026-09-26. This is a routing diagnosis, not acceptance of a
production customer journey.

| Surface | Evidence | Role |
| --- | --- | --- |
| Root repo local Next.js UI | `src/app/page.tsx` and client runtime components | Operator and tenant workspace code under development |
| `https://app.veloceos.cloud/` | Live page title `Veloce AgenticOS | Private Operator Edition`; matches `product-experience/src/app/layout.tsx` and edition components | Editorial front door, not an authenticated workspace |
| Live `Runtime access` > `Client login` | Link to `https://veloce-cloud-test-1075094991117.asia-south1.run.app/login?next=%2F` | Separate approved test runtime |

On the local production build at `http://127.0.0.1:3941/`, the home page
identified itself as `Private Local runtime`; `Connect Memory` navigated to
`/memory`, where the operator view showed an unconnected Obsidian vault and
Graphify status. The client edition takes the other branch in `src/components/Shell.tsx`
and renders `ClientDataWorkspace` for that route. This is a source-level branch
observation, not a successful authenticated client-edition browser test.

| Shared customer action | Local operator | Client edition source | Authenticated cloud evidence |
| --- | --- | --- | --- |
| Open memory | Obsidian/Graphify route opened in browser | `ClientDataWorkspace` route branch exists | Existing Cloud Run session opened tenant Memory on Sep 28; candidate parity unverified |
| Import authorized source pack | Not an operator-memory control | Review/import component mounted in tenant memory | Control absent from observed older Cloud Run UI; migration state unverified |
| Inspect source and outbound links | Local research source-pack viewer exists | Record and graph UI render link references | Missing |
| Navigate from public page to workspace | Not applicable | Cloud Run login is a separate target | Login link verified; post-login journey missing |

The visual mismatch is primarily a deployment/surface mismatch, not proof that
the root workspace UI compiled differently in cloud. The editorial page's
feature-card `Open` links currently lead to its contact section; they do not
open workspace tools. Do not count those links as customer workflow evidence.

Before claiming parity, capture the exact Cloud Run service, revision, image
digest, tenant identity, and source commit; then compare the authenticated
tenant workspace with a local build from the same commit at desktop and mobile
sizes. Record screenshots and complete the customer-journey matrix. A public
domain switch or shared-portal release must pass the separate release gates.

**Follow-up, 2026-09-28:** The Chrome tab at `app.veloceos.cloud` still shows
the editorial front door; its feature-card `Open` links point to `#developer`.
The separate Cloud Run URL above loaded the client-runtime sign-in form, not
an authenticated workspace. This confirms the two surfaces remain distinct,
but it does not prove parity or a defect inside the tenant workspace. Await a
user-authenticated tenant session before capturing route/action and responsive
evidence; no credentials should be copied into release artifacts.

**Authenticated follow-up, 2026-09-28:** An existing Chrome client session on
the Cloud Run test runtime opened `/` and `/memory` without a login redirect.
The landing route is the client-edition Mission Control, not the Vercel front
door. Memory loaded tenant records and a tag graph, with Markdown import/export,
Recent/Search/Graph/Galaxy controls, and ordinary record actions. Its visible
controls did **not** include the local candidate's reviewed community source-pack
import. This is evidence of a cloud deployment/version gap, not evidence that
the new migration or import flow works in cloud. The exact service revision,
image digest, and source SHA were not captured, so no parity or current-candidate
acceptance is claimed. No tenant content or credentials were copied into this
observation. Re-test after a reviewed candidate deployment and migration.

**Local build follow-up, 2026-09-28:** Both editions built from this checkout
with webpack. The operator edition served at `http://127.0.0.1:3946/`, with
the optional member-pack World Studio at `/worlds` using a separate loopback
file server on port 3945. Browser checks loaded all three 3D scenes; the tea
scene rendered at 1440x900 and 390x844, with a nonblank mobile canvas (347
sampled colors), frame diagnostics, and no page errors. The client edition
served at `http://127.0.0.1:3947/`; its home and Memory views rendered in
desktop/mobile checks. This is a visual preview only: no local Supabase URL,
publishable key, tenant slug, allowed email, or model allowlist was configured.
The client preview's record API returned 401, and provider calls were disabled.
It is not authenticated tenant parity, a live cloud deployment, or a production
customer-journey receipt.

**Read-only cloud check, 2026-09-29:** `agentos-mvp/europe-west1/agentos-internal-beta`
still serves revision `agentos-internal-beta-00034-v69` at 100% traffic, using
image digest `sha256:70d24863d095aa9753cf02629a30458f7fdd8ef81bfc5ed2ce35e2c0ed16da57`.
Its revision is Ready, but the revision labels do not identify the source SHA.
The documented signed-in test workspace URL contains project number
`1075094991117`; the active GCP account lacks permission to describe that
project. These are distinct targets, so the internal-beta digest cannot stand
in for the test workspace's deployment evidence. Authenticated cloud parity
remains unverified until the owning project and release revision are accessible.

**Signed-in browser observation, 2026-09-29:** An existing Chrome tab opened
`https://veloce-cloud-test-mquo4bf7aq-el.a.run.app/` as the client-edition
Mission Control without a login redirect. The visible page included tenant-scoped
usage, agent health, activity, and links to Memory, Pipeline, credentials, and
other workspace routes. The tab changed externally before Memory or responsive
actions could be inspected. This alias and session prove neither the owning
project/revision nor parity with the current local source. No tenant content or
credentials were copied into this observation.

**Local/cloud follow-up, 2026-09-29:** The current client-edition checkout was
started on `http://127.0.0.1:3947/` and opened in Chrome. With no local
`SUPABASE_ANON_KEY`, tenant slug, allowed user email, or model allowlist, `/`
redirected to `/login?next=%2F`; the login form rendered. This proves the
current local route is served, not that a tenant can authenticate locally.
In a separate existing signed-in Chrome session, the Cloud Run alias above
opened Mission Control and `/memory`. The cloud Memory route showed zero tenant
records and the Markdown import/export, note, and Recent/Search/Graph/Galaxy
controls, but not the reviewed community source-pack import mounted in this
checkout. No import or write was attempted. This remains a candidate-versus-
deployed-version gap until the owning revision and migration state are verified;
the two browser states are not comparable signed-in parity evidence.

**Read-only follow-up, 2026-09-29:** The signed-in Chrome tab at
`https://veloce-cloud-test-mquo4bf7aq-el.a.run.app/memory` again rendered the
client-edition Memory UI. It showed Markdown import/export, note creation,
Recent/Search/Graph/Galaxy, and graph refresh, but still no reviewed source-pack
import control. The page showed 24 tenant memories; their contents were not
copied into this record. A separate local Chrome tab at
`http://127.0.0.1:3947/login?next=%2F` displayed "Client authentication is not
configured yet," so it cannot serve as a signed-in same-release comparator.
Read-only `gcloud projects describe 1075094991117` was denied for both
configured accounts (`aryamandev777@gmail.com` and `aryamans.dev96@gmail.com`).
The Cloud Run revision, image digest, and source SHA remain unknown; do not
promote this observation into a parity pass.

**Current browser and local-process check, 2026-10-02:** The user's signed-in
Chrome window at `https://veloce-cloud-test-1075094991117.asia-south1.run.app/room`
rendered the client-edition AI Agent Mastermind. Its visible Hermes agent
returned a reply using the approved Groq model lane. This is a read-only
observation of one cloud route, not a same-revision comparison or a full
customer journey. The local service at `http://127.0.0.1:3565/setup` returned
HTTP 200, but its listening process had `product-experience/` as its working
directory. It is the public/setup app, **not** the root client workspace that
serves the cloud `/room` route. Comparing those two screens as UI parity would
be invalid. The root checkout's `.env.local` contains only a Groq key name;
it lacks the Supabase URL/publishable key, tenant slug, allowed email, and
model allowlist required by `scripts/run-client-runtime-local.mjs` for signed-in
local parity. Do not disable authentication or copy production secrets to
make a visual comparison pass. Obtain an approved staging env file and compare
the same workspace route, identity, build revision, and responsive viewports.

**Signed-in Memory recheck, 2026-10-03 20:50 UTC:** The existing Chrome window
at `https://veloce-cloud-test-1075094991117.asia-south1.run.app/room` was
already authenticated and showed the client-edition Mastermind with an earlier
Hermes reply; no new model request was sent. Navigating within that session to
`/memory` showed 24 tenant memories, 29 graph nodes, 57 edges, Markdown
import/export, note creation, graph refresh, and Recent/Search/Graph/Galaxy.
After the page finished loading, it still did **not** show the reviewed JSON
source-pack control mounted by the current checkout's
`src/components/ClientDataWorkspace.tsx` and
`src/components/ClientCommunitySourceImport.tsx`. No record was changed, and
no tenant content or credentials were retained in this note. This confirms a
visible cloud/current-source surface gap on the explicit `asia-south1.run.app`
URL. It does not establish which revision is deployed, whether its source-import
API or migration exists, or whether current local and cloud sessions can be
compared under the same identity. Source import and UI parity remain unaccepted.
The pinned Cloud Run console tab targeted
`projects/veloce-agenticos-2026/locations/asia-south1/services/veloce-cloud-test`
under `aryamans.dev96@gmail.com` and displayed "You need additional access"
with `run.services.get (Missing)`. That account cannot supply the revision or
image digest from the console. No IAM change was attempted; an authorized owner
must provide read-only deployment identity before candidate parity can be
certified.

**Local-launch safety follow-up, 2026-10-03:** `scripts/run-client-runtime-local.mjs`
now defaults `CLIENT_PROVIDER_CALLS_ENABLED` to `0`, so opening a local UI
cannot silently enable provider spending. `npm run dev:client-runtime --
--check-config` reports missing parity settings by name and exits before
starting a server. A provider test requires an explicit `1` setting and a
separately reviewed cost boundary. A private Supabase file exists on this
machine, but it does not establish an approved staging tenant slug, allowed
email, or cloud revision; it was not used for a signed-in parity claim. A
model allowlist is required only when an explicitly approved provider test
enables calls, not for an auth-only UI comparison.

**Stable local preview, 2026-10-03:** The dev watcher exhausted this machine's
file handles, so the guarded launcher now supports `--build-production` followed
by `--production` using a separate `.next-client-prod` output directory. With a
private, reduced env file (Supabase URL and anon key, tenant slug, allowed email;
no service role key), the build passed, `/login` returned 200, and `/memory`
redirected to `/login`. Provider calls remained disabled. No signed-in local
journey or cloud revision comparison has been completed; these checks do not
establish UI parity or production acceptance.

**Signed-in same-profile comparison, 2026-10-03:** The user signed in to the
local client preview at `http://127.0.0.1:3939/` in the Chrome work profile.
Its `/memory` page loaded 24 tenant memories and a 29-node/57-edge graph. An
existing signed-in tab in that profile at
`https://veloce-cloud-test-1075094991117.asia-south1.run.app/memory` showed
the same counts and the same first/last record titles. Only counts and control
names, not record bodies or credentials, are retained here. Desktop visual
inspection found the shared Memory layout and Markdown/note/search/graph
controls closely aligned. The local candidate additionally displayed
`Community sources` / `Review JSON source packs` and sidebar entries for
`Classroom Research` and `Social Research`; those controls were absent from
the cloud tab. The local candidate was source commit `83a986d`, with provider
calls disabled. Separate browser origins have separate sessions, and matching
data does not prove identical auth claims or tenant isolation. The cloud
revision/image digest/source SHA and source-pack migration state remain unknown.
No write or provider action was attempted. This is concrete deployment drift,
not an accepted `ui-parity` result; compare again on an immutable deployed
candidate at desktop and mobile sizes before closing that gate.

**Local session follow-up, 2026-10-04:** After the user's sign-in confirmation,
the in-app browser retained a Delivery page with `workspace_execution_read_failed`.
Nothing was listening on port 3939, and navigation failed with connection refused.
The existing production preview was restarted with the approved reduced env file
and provider calls disabled. In Chrome's Work profile, local Memory loaded without
a login prompt: 24 records, initially 29 nodes and 57 edges; after refreshing the
map it displayed 33 nodes and 57 edges. Delivery initially appeared empty; using
its Refresh history control loaded two successful existing packages, `v100 verify
deliver` and `Delivery · Monthly package`. Selecting the first displayed its
retained tenant artifact and signed-download control. The earlier history error
was not reproducible after the restart. No new note, import, delivery, download,
or provider job was submitted. The in-app browser separately redirected to login,
so its session must not be conflated with Chrome's authenticated session. Local
authentication, Memory reads, and existing Delivery history are verified; package
creation and the full customer journey remain unverified. The preview reused the
existing build, not a new release.

**Release-verifier snapshot, 2026-10-04:** `node
scripts/verify-production-readiness.mjs --allow-dirty` returned
`releaseReady: false` on source commit `6d6c952`. The release ledger bucket is
not configured. Twenty-four ledger-backed gates remain unevaluated, including
current deployment identity, the J01-J15 customer journey, applied migrations,
source import, UI parity, buyer simulation, AI engineering, operations, legal,
and rollback evidence. The local Delivery observation does not satisfy hosted
production release evidence.

**Local/cloud Delivery comparison, 2026-10-05:** In the existing signed-in
Chrome Work profile, `/deliver` first rendered an empty-history message while
the client-runtime request was still pending. Refreshing history on each page
loaded the same two successful entries: `v100 verify deliver` and
`Delivery · Monthly package`. Selecting the verification entry showed the
same retained `v100-verify-deliver.md` artifact detail and signed-download
control. The cloud page reported 0 of 10,000 credits used this month and
`$0.00`. No download, write, send, or provider request occurred. The
`ClientStudioWorkspace` initial and manual-refresh states now distinguish
loading from a genuinely empty history. A fresh optimized local build passed
typecheck, scoped ESLint, and production compilation; after restart on the
same signed-in origin, it automatically loaded the two existing entries. The
cloud deployment was not changed. This is a read-only Delivery check, not
evidence that all routes match, that both origins use identical auth claims,
or that either page has production-ready end-to-end coverage.

**Cloud Memory recheck, 2026-10-05:** The same Chrome Work profile opened the
Cloud Run `/memory` route. It showed 24 tenant memories, 33 graph nodes, and 57
edges, matching the refreshed local client counts. The local Memory screen has
a `Community sources` / `Review JSON source packs` section; this cloud screen
does not. The cloud page also showed historical notes and graph controls, but
no source-pack import control. No upload or write was attempted. This confirms
the source-import UI is absent from the observed cloud deployment; the deployed
revision, database migration state, and cause of the drift remain unknown.
