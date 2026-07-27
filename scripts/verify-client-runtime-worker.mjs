#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import process from "node:process";

const root = new URL("..", import.meta.url).pathname;
const failures = [];

function expect(condition, message) {
  if (!condition) failures.push(message);
}

const workerRoute = await readFile(join(root, "src/app/api/internal/client-runtime/jobs/route.ts"), "utf8");
const deliveryRoute = await readFile(join(root, "src/app/api/internal/client-runtime/delivery/route.ts"), "utf8");
const jobRoute = await readFile(join(root, "src/app/api/client-runtime/jobs/route.ts"), "utf8");
const controlsSql = await readFile(join(root, "product-experience/supabase-client-runtime-controls.sql"), "utf8");
const hostedSql = await readFile(join(root, "product-experience/supabase-client-runtime-hosted-capabilities.sql"), "utf8");

expect(workerRoute.includes("validClientTaskIdentity"), "worker route must verify Cloud Tasks identity");
expect(workerRoute.includes("claim_client_runtime_job"), "worker route must claim jobs through Supabase");
expect(workerRoute.includes("retry_client_runtime_job"), "worker route must use bounded retry state");
expect(workerRoute.includes("complete_client_runtime_job"), "worker route must complete jobs through Supabase");
expect(jobRoute.includes("enqueueClientRuntimeTask"), "client job route must enqueue a durable task");
expect(jobRoute.includes("cancelClientRuntimeJob"), "client job route must cancel orphaned queue rows");
expect(workerRoute.includes("processMediaJob") && workerRoute.includes("processSeoJob"), "worker must have hosted media and SEO branches");
expect(workerRoute.includes("create_client_runtime_artifact_worker"), "media worker must create tenant artifact records through RPC");
expect(workerRoute.includes("checkpoint_client_runtime_job_worker"), "async media worker must checkpoint provider job state through RPC");
expect(deliveryRoute.includes("claim_client_delivery_action_worker") && deliveryRoute.includes("runClientDeliveryAdapter"), "delivery worker must claim and execute only approved actions");
for (const marker of ["SUPABASE_SERVICE_ROLE_KEY", "ANTHROPIC_API_KEY=", "OPENAI_API_KEY="]) {
  expect(!workerRoute.includes(marker) && !jobRoute.includes(marker), `worker boundary must not contain ${marker}`);
}
for (const marker of ["retry_client_runtime_job", "cancel_client_runtime_job", "reserve_client_runtime_budget_worker"]) {
  expect(controlsSql.includes(marker), `controls migration must contain ${marker}`);
}
for (const marker of ["create_client_runtime_artifact_worker", "checkpoint_client_runtime_job_worker", "create_client_delivery_action", "claim_client_delivery_action_worker", "complete_client_delivery_action_worker", "p_error_code", "client_runtime_delivery_actions"]) {
  expect(hostedSql.includes(marker), `hosted capability migration must contain ${marker}`);
}
expect(workerRoute.includes("confirm_client_runtime_artifact_worker"), "worker artifact path must confirm storage metadata through the worker RPC");

const base = (process.env.CLIENT_RUNTIME_URL || "").replace(/\/$/, "");
if (base) {
  const unauthJob = await fetch(`${base}/api/client-runtime/jobs`, { method: "POST", body: "{}", headers: { "content-type": "application/json" }, redirect: "manual" }).catch(() => null);
  expect(unauthJob && [401, 403].includes(unauthJob.status), `unauthenticated jobs endpoint must reject access (got ${unauthJob?.status ?? "no response"})`);
  const workerProbe = await fetch(`${base}/api/internal/client-runtime/jobs`, { method: "POST", body: "{}", headers: { "content-type": "application/json" }, redirect: "manual" }).catch(() => null);
  expect(workerProbe && [401, 403, 404].includes(workerProbe.status), `worker endpoint must reject an unsigned request (got ${workerProbe?.status ?? "no response"})`);
}

if (failures.length) {
  console.error("Client worker verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Client worker verification passed${base ? ` for ${base}` : " (static boundary checks)"}.`);
