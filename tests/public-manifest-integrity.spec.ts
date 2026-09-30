import { createHash } from "node:crypto";
import { expect, test } from "@playwright/test";
import { loadReviewModule } from "./helpers/load-review-module";

const requestId = "00000000-0000-4000-8000-000000000001";
const accountId = "00000000-0000-4000-8000-000000000002";
const secret = "test-only-operator-secret";
const savedEnv = { ...process.env };
const savedFetch = globalThis.fetch;
test.afterEach(() => { process.env = { ...savedEnv }; globalThis.fetch = savedFetch; });

test("prepare, callback, and deploy remain bound to one reviewed manifest", async () => {
  process.env.CONTROL_PLANE_OPERATOR_SECRET = secret;
  const manifest = { approved: true, clientSlug: "tenant-a", provisioning: { phase: "prepare" } };
  const finalManifest = { ...manifest, commercialScope: { reviewed: true } };
  const hash = createHash("sha256").update(JSON.stringify(finalManifest)).digest("hex");
  const account: Record<string, unknown> = { id: accountId, request_id: requestId, status: "manifest_review", commercial_scope_status: "approved", commercial_scope_inputs: {} };
  const runs: Record<string, unknown>[] = [];
  let dispatches = 0;
  let identityCalls = 0;
  let refuseAccountUpdate = false;
  const publicLaunch = {
    supabaseServiceSelect: async (table: string, filters: Record<string, string>) => {
      if (table === "client_onboarding_accounts") return { ok: true, rows: [account] };
      if (table !== "client_provisioning_runs") throw new Error(`Unexpected table ${table}`);
      if (filters.id) return { ok: true, rows: runs.filter((run) => `eq.${run.id}` === filters.id) };
      if (filters.idempotency_key) return { ok: true, rows: runs.filter((run) => `eq.${run.idempotency_key}` === filters.idempotency_key) };
      if (filters.status) return { ok: true, rows: runs.filter((run) => run.onboarding_id === accountId && run.status === "succeeded" && run.current_step === "prepared") };
      return { ok: true, rows: [...runs].reverse() };
    },
    supabaseServiceInsert: async (table: string, record: Record<string, unknown>) => {
      expect(table).toBe("client_provisioning_runs");
      const row = { ...record, id: `00000000-0000-4000-8000-${String(runs.length + 10).padStart(12, "0")}` };
      runs.push(row);
      return { ok: true, rows: [row] };
    },
    supabaseServiceUpdate: async (table: string, filters: Record<string, string>, record: Record<string, unknown>) => {
      if (table === "client_onboarding_accounts" && refuseAccountUpdate) return { ok: true, rows: [] };
      const target = table === "client_onboarding_accounts" ? account : runs.find((run) => `eq.${run.id}` === filters.id);
      if (!target || (filters.status && !filters.status.includes(String(target.status)))) return { ok: true, rows: [] };
      Object.assign(target, record);
      return { ok: true, rows: [target] };
    },
  };
  const mocks = {
    "next/server": { NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) } },
    "@/lib/publicLaunch": publicLaunch,
    "@/lib/commercialScope": { applyCommercialScopeToManifest: (value: Record<string, unknown>) => ({ ...value, commercialScope: { reviewed: true } }) },
    "@/lib/cloudRunOidc": { controlPlaneOidcConfigured: () => true, cloudRunIdTokenFromVercel: async () => { identityCalls++; return { ok: true, token: "test-only-oidc-token" }; } },
  };
  globalThis.fetch = async () => { dispatches++; return Response.json({ ok: true }, { status: 202 }); };
  const approval = loadReviewModule("product-experience/src/app/api/onboarding/approve/route.ts", mocks);
  const callback = loadReviewModule("product-experience/src/app/api/onboarding/provision-result/route.ts", mocks);
  const deploy = loadReviewModule("product-experience/src/app/api/onboarding/deploy/route.ts", mocks);
  const post = (route: { POST: (request: Request) => Promise<Response> }, body: Record<string, unknown>) => route.POST(new Request("https://app.invalid/api/onboarding", { method: "POST", headers: { "content-type": "application/json", "x-control-plane-secret": secret }, body: JSON.stringify(body) }));

  account.commercial_scope_status = "rejected";
  expect((await post(approval, { action: "preview", requestId, manifest })).status).toBe(409);
  expect(runs).toHaveLength(0);
  account.commercial_scope_status = "approved";
  const review = await post(approval, { action: "preview", requestId, manifest });
  expect(review.status).toBe(200);
  expect(await review.json()).toMatchObject({ manifest: finalManifest, manifestHash: hash });
  expect(runs).toHaveLength(0);
  expect(dispatches).toBe(0);
  expect(identityCalls).toBe(0);
  expect((await post(approval, { action: "approve", requestId, manifest })).status).toBe(400);
  const wrongHash = await post(approval, { action: "approve", requestId, manifest, manifestHash: "0".repeat(64) });
  expect(wrongHash.status).toBe(409);
  expect(runs).toHaveLength(0);
  process.env.CONTROL_PLANE_PROVISIONER_URL = "https://provisioner.invalid";
  process.env.CONTROL_PLANE_WORKER_TOKEN = "test-only-worker-token";
  const prepared = await post(approval, { action: "approve", requestId, manifest, manifestHash: hash });
  expect(prepared.status).toBe(200);
  expect(dispatches).toBe(1);
  expect(runs[0].evidence_bundle).toMatchObject({ approved_manifest_sha256: hash });

  const callbackResponse = await post(callback, { runId: runs[0].id, status: "succeeded", resourceManifest: { phase: "prepare" }, evidenceBundle: { approved_manifest_sha256: "forged", workerStep: "done" } });
  expect(callbackResponse.status).toBe(200);
  expect(runs[0].evidence_bundle).toMatchObject({ approved_manifest_sha256: hash, workerStep: "done" });

  account.approved_manifest = { ...finalManifest, clientSlug: "different-tenant" };
  expect((await post(approval, { action: "approve", requestId, manifest, manifestHash: hash })).status).toBe(409);
  expect((await post(deploy, { requestId })).status).toBe(409);
  expect(dispatches).toBe(1);
  account.approved_manifest = finalManifest;
  runs[0].evidence_bundle = { approved_manifest_sha256: "forged" };
  expect((await post(deploy, { requestId })).status).toBe(409);
  expect(dispatches).toBe(1);
  runs[0].evidence_bundle = { approved_manifest_sha256: hash };

  const deployed = await post(deploy, { requestId });
  expect(deployed.status).toBe(200);
  expect(dispatches).toBe(2);
  expect(runs[1].evidence_bundle).toMatchObject({ prepared_run_id: runs[0].id, base_manifest_sha256: hash });

  account.status = "manifest_review";
  refuseAccountUpdate = true;
  const corrected = { ...manifest, clientName: "Corrected tenant" };
  const correctedReview = await post(approval, { action: "preview", requestId, manifest: corrected });
  const correctedHash = (await correctedReview.json()).manifestHash;
  const failedPrepare = await post(approval, { action: "approve", requestId, manifest: corrected, manifestHash: correctedHash });
  expect(failedPrepare.status).toBe(502);
  expect(runs[2]).toMatchObject({ status: "failed", error_code: "approved_manifest_persist_failed" });
  expect(dispatches).toBe(2);
  refuseAccountUpdate = false;
  expect((await post(approval, { action: "approve", requestId, manifest: corrected, manifestHash: correctedHash })).status).toBe(409);
  expect(dispatches).toBe(2);
});
