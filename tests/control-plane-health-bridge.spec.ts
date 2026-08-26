import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

test("the control-plane health bridge is operator-only and non-mutating", () => {
  const publicWorker = readFileSync(resolve(process.cwd(), "workers/public-provisioner/worker.mjs"), "utf8");
  const route = readFileSync(resolve(process.cwd(), "product-experience/src/app/api/internal/control-plane/provisioner-health/route.ts"), "utf8");

  expect(publicWorker).toContain('request.method === "POST" && request.url === "/adapter-healthz"');
  expect(publicWorker).toContain('if (!authorized(request)) return json(response, 401');
  expect(publicWorker).toContain('new URL("/healthz", adapterUrl)');
  expect(publicWorker).toContain('audience = `${url.origin}/`');
  expect(publicWorker).toContain('x-serverless-authorization');
  expect(route).toContain('"x-control-plane-secret"');
  expect(route).toContain('cloudRunIdTokenFromVercel(request, target)');
  expect(route).toContain('parsed.pathname = "/adapter-healthz"');
  expect(route).toContain('function operatorSafeAdapterError');
  expect(route).toContain('gcp_adapter_health_failed_');
  expect(route).not.toContain("supabaseServiceInsert");
  expect(route).not.toContain("/provision");
});
