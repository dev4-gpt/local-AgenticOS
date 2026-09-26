# Public Beta Release Gates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the evidence and packaging gaps that keep the isolated Veloce client runtime at controlled internal beta, without opening customer traffic or changing the legacy Cloud Run service.

**Architecture:** Keep `agentos-internal-beta` as an isolated, allowlisted Cloud Run deployment. Prove the existing Supabase implicit-flow callback end to end with disposable data, make the client container's filesystem trace auditable and bounded, and name the solo-founder operating accountabilities required by the public-beta contract. Public-domain routing, paid activation, providers, and the legacy `agentos` service remain out of scope.

**Tech Stack:** Next.js 16 App Router and Proxy, TypeScript, Playwright, Node.js scripts, Supabase Auth/PostgREST, Cloud Run, Artifact Registry, Google Cloud CLI.

## Global Constraints

- Preserve the existing legacy `agentos` Cloud Run service; never route beta traffic through it.
- Keep the client runtime at min instances `0`, max instances `1`, concurrency `1`, with provider calls, local CLI, local files, workers, and intent routing disabled.
- Never log, commit, return, or place a Supabase access token, refresh token, service-role key, provider key, or password in a test artifact.
- Use a unique disposable email and tenant only; delete its auth user, membership, tenant rows, and client records in a `finally` cleanup path.
- Restore `CLIENT_ALLOWED_USER_EMAILS` to `aryamandev777@gmail.com` immediately after the live callback verification.
- Treat the `$5` Google Cloud monthly budget alert as an alert, not a cost cap; do not add resources or increase autoscaling.
- Do not point `veloceos.cloud` or `www.veloceos.cloud` at a tenant runtime, enable paid traffic, enable managed providers, or authorize public activation in this work.

## File Structure

- Create: `scripts/verify-client-runtime-magic-link.mjs` - redacted, disposable live verifier for the Supabase action-link and runtime callback journey.
- Create: `tests/client-auth-callback.spec.ts` - source-level regression tests for fragment removal, refresh-token exchange, membership enforcement, and cookie attributes.
- Create: `scripts/verify-client-runtime-build-trace.mjs` - CI-safe inspector for client build output and trace metadata.
- Create: `tests/client-runtime-build-trace.spec.ts` - regression tests for the verifier and client tracing configuration.
- Modify: `next.config.ts` - narrow trace exclusions for explicitly disabled, local-only operator paths during the client container build only.
- Modify: `Dockerfile.client` - run the artifact-boundary verifier after the standalone build and before copying runtime output.
- Modify: `package.json` - add focused verification commands.
- Modify: `docs/organizational-structure.md` - record the founder's interim beta operating ownership without inventing staff.
- Modify: `docs/production-operations.md` - map release gates to named owners and verifiable evidence.
- Modify: `docs/beta-security-readiness-2026-09-25.md` and `docs/agentos-mvp-beta-runtime-assessment-2026-09-25.md` - replace pending gates with dated evidence, keeping public activation closed unless every acceptance check passes.

---

### Task 1: Lock Down Callback Session Semantics

**Files:**
- Create: `tests/client-auth-callback.spec.ts`
- Modify: `src/app/auth/callback/page.tsx`
- Modify: `src/app/api/client-auth/magic-link/route.ts`

**Interfaces:**
- Consumes: Supabase implicit-flow fragments `access_token` and `refresh_token`; `clientUserEmailAllowed(email: string | undefined): boolean`; RPC `client_member(p_tenant_slug text): boolean`.
- Produces: `POST /api/client-auth/magic-link` returns `{ ok: true }` only after refresh, email allowlist, and tenant-membership validation; it emits two HTTP-only, `SameSite=Lax` cookies.

- [ ] **Step 1: Write failing source-regression tests**

```ts
import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

test("callback clears fragment before posting only the tokens to the same-origin endpoint", () => {
  const page = read("src/app/auth/callback/page.tsx");
  expect(page).toContain('window.history.replaceState(null, "", "/auth/callback")');
  expect(page).toContain('fetch("/api/client-auth/magic-link"');
  expect(page).toContain('credentials: "same-origin"');
  expect(page).not.toContain("window.location.href");
});

test("magic-link acceptance refreshes, validates membership, and sets protected cookies", () => {
  const route = read("src/app/api/client-auth/magic-link/route.ts");
  expect(route).toContain("grant_type=refresh_token");
  expect(route).toContain("clientUserEmailAllowed(email)");
  expect(route).toContain("/rest/v1/rpc/client_member");
  expect(route).toContain("httpOnly: true");
  expect(route).toContain('sameSite: "lax"');
  expect(route).toContain("cache-control");
  expect(route).not.toContain("console.log");
});
```

- [ ] **Step 2: Run the test to confirm the current code satisfies the intended contract or exposes a mismatch**

Run: `npx playwright test tests/client-auth-callback.spec.ts --config=playwright.unit.config.ts --reporter=line`

Expected: the assertions pass; if one fails, record the exact missing contract before editing code.

- [ ] **Step 3: Make the callback's untrusted input contract explicit**

Keep the browser page as the only fragment reader and retain the server-side refresh as the source of truth. The request type must intentionally accept the unused access token only to keep the browser payload shape clear; never authorize with it.

```ts
type MagicLinkPayload = { accessToken?: unknown; refreshToken?: unknown };

const body = await request.json().catch(() => ({})) as MagicLinkPayload;
const refreshToken = typeof body.refreshToken === "string" ? body.refreshToken.trim() : "";
if (!config || !tenantSlug || refreshToken.length < 20 || refreshToken.length > 4096) {
  return fail("invalid_magic_link");
}
```

- [ ] **Step 4: Re-run the focused test and the existing authenticated runtime verifier**

Run: `npx playwright test tests/client-auth-callback.spec.ts --config=playwright.unit.config.ts --reporter=line`

Expected: `2 passed`.

Run: `npm run verify:client-authenticated`

Expected: existing password-session verifier passes without printing a token or secret.

- [ ] **Step 5: Commit the callback contract**

```bash
git add src/app/auth/callback/page.tsx src/app/api/client-auth/magic-link/route.ts tests/client-auth-callback.spec.ts
git commit -m "test: lock down client magic link callback"
```

### Task 2: Add a Disposable Live Magic-Link Acceptance Verifier

**Files:**
- Create: `scripts/verify-client-runtime-magic-link.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: `VELOCE_RUNTIME_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and `VELOCE_MAGIC_LINK_TEST_EMAIL` from process environment; all values are local process inputs and are never written to disk.
- Produces: exit `0` and `magic-link acceptance passed` after redirect, cookie, protected-read, logout, and cleanup; nonzero exit with a redacted reason otherwise.

- [ ] **Step 1: Write the verifier with redacted request helpers and guaranteed cleanup**

```js
#!/usr/bin/env node
import { randomUUID } from "node:crypto";

const required = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`missing_${name}`);
  return value;
};
const runtimeUrl = required("VELOCE_RUNTIME_URL").replace(/\/$/, "");
const supabaseUrl = required("SUPABASE_URL").replace(/\/$/, "");
const anonKey = required("SUPABASE_ANON_KEY");
const serviceKey = required("SUPABASE_SERVICE_ROLE_KEY");
const email = required("VELOCE_MAGIC_LINK_TEST_EMAIL").toLowerCase();
const tenantSlug = `magic-link-${randomUUID().replaceAll("-", "").slice(0, 18)}`;
let userId = "";

const admin = (path, init = {}) => fetch(`${supabaseUrl}${path}`, {
  ...init,
  headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "content-type": "application/json", ...(init.headers ?? {}) },
});
const must = async (response, label) => {
  if (!response.ok) throw new Error(`${label}_${response.status}`);
  return response;
};

try {
  const generated = await must(await admin("/auth/v1/admin/generate_link", {
    method: "POST",
    body: JSON.stringify({ type: "magiclink", email, redirect_to: `${runtimeUrl}/auth/callback` }),
  }), "generate_link");
  const invite = await generated.json();
  userId = typeof invite.id === "string" ? invite.id : String(invite.user?.id ?? "");
  if (!userId || typeof invite.action_link !== "string") throw new Error("invalid_generate_link_response");
  await must(await admin(`/rest/v1/client_tenants?on_conflict=slug`, {
    method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ slug: tenantSlug, name: "Disposable magic-link verifier", retention_days: 1, status: "active" }),
  }), "create_tenant");
  await must(await admin(`/rest/v1/client_memberships?on_conflict=tenant_slug,user_id`, {
    method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ tenant_slug: tenantSlug, user_id: userId, role: "owner", status: "active" }),
  }), "create_membership");
  let nextUrl = invite.action_link;
  let fragment = "";
  for (let redirect = 0; redirect < 4; redirect += 1) {
    const confirm = await fetch(nextUrl, { redirect: "manual" });
    const location = confirm.headers.get("location");
    if (![301, 302, 303, 307, 308].includes(confirm.status) || !location) throw new Error(`confirm_link_${confirm.status}`);
    const target = new URL(location, nextUrl);
    if (target.origin === runtimeUrl && target.pathname === "/auth/callback") { fragment = target.hash.slice(1); break; }
    nextUrl = target.href;
  }
  const refreshToken = new URLSearchParams(fragment).get("refresh_token") ?? "";
  if (!refreshToken) throw new Error("missing_refresh_token");
  const accepted = await must(await fetch(`${runtimeUrl}/api/client-auth/magic-link`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ refreshToken }), redirect: "manual",
  }), "accept_magic_link");
  const cookies = accepted.headers.getSetCookie?.() ?? [];
  if (!cookies.some((value) => value.includes("veloce_access_token=") && value.includes("HttpOnly"))) throw new Error("access_cookie_missing");
  if (!cookies.some((value) => value.includes("veloce_refresh_token=") && value.includes("HttpOnly"))) throw new Error("refresh_cookie_missing");
  console.log("magic-link acceptance passed");
} finally {
  if (userId) await admin(`/auth/v1/admin/users/${userId}`, { method: "DELETE" }).catch(() => undefined);
  await admin(`/rest/v1/client_memberships?tenant_slug=eq.${encodeURIComponent(tenantSlug)}`, { method: "DELETE" }).catch(() => undefined);
  await admin(`/rest/v1/client_tenants?slug=eq.${encodeURIComponent(tenantSlug)}`, { method: "DELETE" }).catch(() => undefined);
}
```

- [ ] **Step 2: Add the constrained package command**

```json
"verify:client-magic-link": "node scripts/verify-client-runtime-magic-link.mjs"
```

Place it beside `verify:client-authenticated` in `package.json`; do not add its secret-bearing environment variables to `.env.example`, committed configuration, CI logs, or shell history.

- [ ] **Step 3: Test the verifier against deterministic failure input**

Run: `env -u VELOCE_RUNTIME_URL npm run verify:client-magic-link`

Expected: nonzero exit containing `missing_VELOCE_RUNTIME_URL`, with no credentials in output.

- [ ] **Step 4: Run the live acceptance sequence with a temporary allowlist entry**

Run: set the internal-beta service allowlist to `aryamandev777@gmail.com,<unique-disposable-email>`, wait for the new Cloud Run revision to become ready, run `npm run verify:client-magic-link`, then restore the allowlist to exactly `aryamandev777@gmail.com` and verify the restored revision is ready.

Expected: one `magic-link acceptance passed` line; all disposable records removed; no token, link, email, or key retained in the terminal transcript or repository.

- [ ] **Step 5: Commit the reusable verifier**

```bash
git add package.json scripts/verify-client-runtime-magic-link.mjs
git commit -m "test: verify client magic link acceptance"
```

### Task 3: Make the Client Runtime Artifact Boundary Verifiable

**Files:**
- Create: `scripts/lib/client-runtime-artifact-surface.mjs`
- Create: `scripts/prune-client-runtime-artifact.mjs`
- Create: `scripts/verify-client-runtime-build-trace.mjs`
- Create: `tests/client-runtime-artifact-boundary.spec.ts`
- Modify: `Dockerfile.client`
- Modify: `package.json`

**Interfaces:**
- Consumes: `.next/standalone/.next/server/app-paths-manifest.json` and `functions-config-manifest.json` after the client build.
- Produces: an image artifact containing only client, auth, system-health, and client-runtime route entrypoints; `verify:client-build-trace` rejects any remaining operator route manifest, missing retained entrypoint, or traced local credential root.

- [ ] **Step 1: Write a fixture test with allowed and operator routes**

```ts
await writeRoute(server, "app/api/claude/chat/route.js");
await writeRoute(server, "app/api/client-auth/magic-link/route.js");
await writeRoute(server, "app/context/page.js");
await writeRoute(server, "app/demo-history/page.js");
execFileSync("node", ["scripts/prune-client-runtime-artifact.mjs", "--standalone-root", root]);
expect(manifest).toEqual({
  "/api/client-auth/magic-link/route": "app/api/client-auth/magic-link/route.js",
  "/context/page": "app/context/page.js",
});
```

- [ ] **Step 2: Define the build surface independently of runtime authorization**

```js
export const clientRuntimePageRoutes = ["/", "/context", "/orchestrate", "/credentials", "/capabilities", "/deliver"];
const systemRoutes = ["/_not-found", "/_global-error", "/favicon.ico", "/healthz", "/status", "/login", "/auth/callback", "/client-unavailable"];
const clientApiPrefixes = ["/api/capabilities", "/api/speech/transcribe", "/api/client-runtime", "/api/internal/client-runtime", "/api/client-auth"];
```

Keep the complete client page list synchronized with `DEFAULT_CLIENT_ROUTES`. The build surface is intentionally a superset of manifest-specific runtime authorization; it must never add an operator API.

- [ ] **Step 3: Prune non-client entrypoints and their registrations**

```js
for (const [entryKey, entryFile] of Object.entries(appPaths)) {
  if (clientRuntimeArtifactRouteAllowed(routePath(entryKey))) continue;
  await removeEntrypointFiles(path.join(serverRoot, entryFile));
  delete appPaths[entryKey];
}
await writeJson(appPathsFile, appPaths);
await pruneFunctionConfig(path.join(serverRoot, "functions-config-manifest.json"));
```

Only prune `.next/standalone/.next/server`: the source build remains intact for Vercel and operator development. Remove all `page.*`, `page_*`, `route.*`, and `route_*` files associated with a disabled manifest entry.

- [ ] **Step 4: Verify manifests, retained files, and trace paths without printing raw paths**

```js
if (!clientRuntimeArtifactRouteAllowed(route)) failures.push("disallowed_route_manifested");
if (typeof entryFile !== "string" || !(await exists(path.join(serverRoot, entryFile)))) failures.push("manifested_route_file_missing");
if (forbiddenTracePath(String(entry))) failures.push("forbidden_trace_category");
```

The verifier must use generic categories only and fail nonzero on any violation.

- [ ] **Step 5: Wire the prune-and-verify sequence into the Docker build**

```dockerfile
RUN npm run build
RUN node scripts/prune-client-runtime-artifact.mjs
RUN node scripts/verify-client-runtime-build-trace.mjs
```

Add `"verify:client-build-trace": "node scripts/verify-client-runtime-build-trace.mjs"` to `package.json`.

- [ ] **Step 6: Run focused, artifact, and runtime smoke tests**

Run: `npx playwright test tests/client-runtime-artifact-boundary.spec.ts --config=playwright.unit.config.ts --reporter=line`

Expected: `1 passed`.

Run: `VELOCE_CONTAINER_BUILD=1 VELOCE_CLIENT_EDITION=1 npm run build -- --webpack`

Expected: standalone output is generated.

Run: `node scripts/prune-client-runtime-artifact.mjs`

Expected: disabled route entries are removed.

Run: `npm run verify:client-build-trace`

Expected: artifact verifier passes without printing a local path.

Run: launch `.next/standalone/server.js` with `CLIENT_RUNTIME_ENFORCE_AUTH=1`; request `/context`, `/api/claude/chat`, `/api/client-auth/session`, and `/api/client-runtime/records`.

Expected: `307`, `403`, `200`, and `401`, respectively.

- [ ] **Step 7: Commit the artifact gate**

```bash
git add Dockerfile.client package.json scripts/lib/client-runtime-artifact-surface.mjs scripts/prune-client-runtime-artifact.mjs scripts/verify-client-runtime-build-trace.mjs tests/client-runtime-artifact-boundary.spec.ts
git commit -m "build: prune client runtime artifact"
```

### Task 4: Record Named Interim Operating Ownership

**Files:**
- Modify: `docs/organizational-structure.md`
- Modify: `docs/production-operations.md`
- Modify: `docs/public-beta-operating-contract-2026-09-25.md`

**Interfaces:**
- Consumes: current solo-founder operating model and the contract's four mandatory ownership domains.
- Produces: an auditable ownership matrix assigning incident response, billing, access revocation, and customer-data deletion to the Founder until a named delegate is documented.

- [ ] **Step 1: Add an interim beta ownership table beneath Current staffing**

```markdown
## Interim beta operating ownership

Until a delegate is recorded here, the Founder is the accountable owner for
the controlled beta. A delegate may perform a task only after this table and
the applicable runbook are updated.

| Release obligation | Accountable owner | Evidence / runbook |
| --- | --- | --- |
| Incident classification and customer communication | Founder | `docs/incident-response-plan.md` |
| Billing, refund review, and reconciliation | Founder | `docs/v3.3-managed-credit-lifecycle-runbook.md` |
| Access revocation and tenant suspension | Founder | `docs/production-operations.md` |
| Customer-data export and deletion | Founder | `docs/client-lifecycle-runbook.md` |
```

- [ ] **Step 2: Add the release-evidence ownership requirement to operations**

```markdown
For controlled beta release evidence, the Founder records the dated acceptance
of the incident, billing, access-revocation, and customer-data-deletion
responsibilities. The record identifies the runbook revision used; it never
contains customer data, passwords, tokens, or secret values.
```

- [ ] **Step 3: Replace the operating-contract owner decision with a reference to the matrix**

```markdown
The initial controlled-beta owners are recorded in
`docs/organizational-structure.md#interim-beta-operating-ownership`. This
assignment is not public-activation approval and must be replaced when a
delegate receives production access.
```

- [ ] **Step 4: Verify the public-beta contract still passes**

Run: `npm run verify:public-beta`

Expected: command exits `0` and reports the contract validation passed.

- [ ] **Step 5: Commit the operating record**

```bash
git add docs/organizational-structure.md docs/production-operations.md docs/public-beta-operating-contract-2026-09-25.md
git commit -m "docs: name interim beta operating owners"
```

### Task 5: Rebuild, Deploy the Isolated Revision, and Record Acceptance

**Files:**
- Modify: `docs/beta-security-readiness-2026-09-25.md`
- Modify: `docs/agentos-mvp-beta-runtime-assessment-2026-09-25.md`
- Modify: `docs/production-topology-2026-09-25.md`

**Interfaces:**
- Consumes: a new immutable Artifact Registry digest, a ready `agentos-internal-beta` revision, focused test output, magic-link verifier output, and exact restored allowlist.
- Produces: dated evidence for the controlled internal beta only; it does not alter the Vercel public app domain or state that public customer activation is open.

- [ ] **Step 1: Run source and policy gates before deploying**

Run: `npm run verify:client-provider-policy`

Expected: policy verifier passes.

Run: `npm run verify:provider-egress-budget`

Expected: every reviewed manifest passes and provider execution remains disabled for `internal-beta`.

Run: `npm run verify:security`

Expected: all security release verifiers pass.

- [ ] **Step 2: Build and push a new immutable client image**

Run: `gcloud builds submit --project=agentos-mvp --region=europe-west1 --tag=europe-west1-docker.pkg.dev/agentos-mvp/veloce-client-runtime/client-runtime:release-gate-20260926 .`

Expected: Cloud Build succeeds; record the returned immutable digest, not the mutable tag, in the deployment manifest and evidence.

- [ ] **Step 3: Deploy only the internal beta service and retain constraining configuration**

First update the existing manifest image reference with the immutable release tag, then run:

```json
"image": "europe-west1-docker.pkg.dev/agentos-mvp/veloce-client-runtime/client-runtime:release-gate-20260926"
```

Run: `npm run provision:gcp-client -- --config client-blueprints/agentos-internal-beta.gcp.json --phase deploy --apply`

The provisioner resolves the tag to a digest before deployment. Retain the dedicated service account, queue, bucket, workspace job, `max-instances=1`, `min-instances=0`, `concurrency=1`, and no service-role/provider secrets.

Expected: a ready revision of `agentos-internal-beta` receives 100% of that service's traffic; legacy `agentos` is unchanged.

- [ ] **Step 4: Run no-credential, authenticated, and magic-link live acceptance**

Run: `CLIENT_RUNTIME_URL="$VELOCE_RUNTIME_URL" npm run verify:client-runtime`

Expected: `/status` is `200`, a protected page redirects to `/login`, and disabled endpoints are rejected.

Run: `npm run verify:client-authenticated`

Expected: password-session protected read and logout pass for disposable data.

Run: `npm run verify:client-magic-link`

Expected: magic-link callback acceptance passes after the temporary allowlist expansion; exact one-address allowlist is restored after cleanup.

- [ ] **Step 5: Record only non-secret evidence and maintain the honest release decision**

```markdown
| Check | Result |
| --- | --- |
| Client build trace | Passed; no forbidden local root appeared in output traces. |
| Password session | Passed with disposable fixture cleanup. |
| Magic-link callback | Passed with disposable fixture cleanup and restored allowlist. |
| Operational owners | Founder accepted interim controlled-beta accountability on 2026-09-26. |

**Decision:** `agentos-internal-beta` remains an allowlisted controlled
internal beta. Public customer activation, public-domain routing, managed
providers, and paid traffic remain closed pending their separate approvals.
```

- [ ] **Step 6: Commit, push, and inspect the immutable production record**

```bash
git add docs/beta-security-readiness-2026-09-25.md docs/agentos-mvp-beta-runtime-assessment-2026-09-25.md docs/production-topology-2026-09-25.md
git commit -m "docs: record beta release gate acceptance"
git push origin main
git status --short --branch
```

Expected: `main` is synchronized with `origin/main` and contains no uncommitted secrets or fixture artifacts.

## Plan Self-Review

- Spec coverage: callback journey is Task 1 and Task 2; named operations ownership is Task 4; client-image warning/trace hardening is Task 3; deployment, evidence, and rollback-safe scope are Task 5. Public activation and cost expansion are explicitly prohibited.
- Placeholder scan: no task contains a deferred implementation marker; mutable data is generated at runtime and dates/tags are supplied by the actual release command rather than invented.
- Type consistency: `clientUserEmailAllowed`, `client_member`, `VELOCE_RUNTIME_URL`, and the `POST /api/client-auth/magic-link` contract use the same names and payloads throughout.
