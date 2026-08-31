import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

test("approved onboarding uses one durable task and the adapter owns terminal callbacks", () => {
  const publicWorker = readFileSync(resolve(process.cwd(), "workers/public-provisioner/worker.mjs"), "utf8");
  const adapterWorker = readFileSync(resolve(process.cwd(), "workers/gcp-provisioner/worker.mjs"), "utf8");
  const approvalRoute = readFileSync(resolve(process.cwd(), "product-experience/src/app/api/onboarding/approve/route.ts"), "utf8");

  expect(publicWorker).toContain("cloudtasks.googleapis.com/v2/${queuePath}/tasks");
  expect(publicWorker).toContain('createHash("sha256").update(String(input.runId))');
  expect(publicWorker).toContain('dispatchDeadline: "960s"');
  expect(publicWorker).toContain("oidcToken: { serviceAccountEmail: taskServiceAccount, audience: adapterAudience }");
  expect(publicWorker).toContain("gcp_provisioner_audience_must_match_target_url");
  expect(publicWorker).toContain('new URL("/queue-authz", adapterUrl)');
  expect(publicWorker).toContain('request.url === "/adapter-queue-authz"');
  expect(publicWorker).toContain('return { taskId, alreadyQueued: true }');
  expect(publicWorker).toContain('return json(response, 202, { ok: true, runId: input.runId, status: "queued"');
  expect(publicWorker).toContain('status: "queue_unavailable"');
  expect(publicWorker).not.toContain("CONTROL_PLANE_OPERATOR_SECRET");
  expect(publicWorker).not.toContain("async function callback(");

  expect(adapterWorker).toContain("CONTROL_PLANE_CALLBACK_URL");
  expect(adapterWorker).toContain("CONTROL_PLANE_OPERATOR_SECRET");
  expect(adapterWorker).toContain('if (!callbackConfigured()) return json(response, 503');
  expect(adapterWorker).toContain('const callbackDelivered = await callback(input, { status: "succeeded", ...result });');
  expect(adapterWorker).toContain('const callbackDelivered = await callback(input, { status: "failed", errorCode: message');
  expect(adapterWorker).toContain('error: "control_plane_callback_failed"');
  expect(adapterWorker).toContain('request.url === "/queue-authz"');
  expect(adapterWorker).toContain("gcp_adapter_queue_authz_denied");
  expect(approvalRoute).toContain("dispatched = response?.status === 202");
  expect(approvalRoute).toContain('status: dispatched ? "queued" : "provisioning"');
});
