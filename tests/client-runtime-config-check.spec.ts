import { expect, test } from "@playwright/test";
import { spawnSync } from "node:child_process";
import { evaluateClientRuntimeConfig } from "../scripts/lib/client-runtime-config-check.mjs";

const digest = "a".repeat(64);
const expected = { service: "agentos-internal-beta", revision: "agentos-internal-beta-00035-test", digest, tenant: "internal-beta" };

function snapshot() {
  return {
    metadata: { name: expected.service, generation: 35 },
    status: {
      latestCreatedRevisionName: expected.revision,
      latestReadyRevisionName: expected.revision,
      observedGeneration: 35,
      traffic: [{ revisionName: expected.revision, percent: 100, latestRevision: true }],
    },
    spec: { template: { spec: { containers: [{
      image: `example.invalid/client-runtime@sha256:${digest}`,
      env: [
        { name: "CLIENT_SLUG", value: "internal-beta" },
        { name: "CLIENT_RETENTION_DAYS", value: "45" },
        { name: "CLIENT_NOTEBOOK_RETENTION_DAYS", value: "45" },
        { name: "CLIENT_ALLOWED_ROUTES", value: "/,/memory,/notebook" },
        { name: "CLIENT_ALLOWED_API_ROUTES", value: "/api/client-runtime/source-import,/api/client-runtime/build-identity" },
        { name: "CLIENT_ENABLED_CAPABILITIES", value: "tenant-data,artifacts" },
        { name: "SUPABASE_ANON_KEY", value: "DO_NOT_PRINT_PRIVATE_VALUE" },
      ],
    }] } } },
  };
}

test("candidate config preflight accepts one fully identified revision without leaking values", () => {
  const service = snapshot();
  const result = evaluateClientRuntimeConfig(service, expected);
  expect(result).toEqual({ ok: true, service: expected.service, revision: expected.revision, imageDigest: `sha256:${digest}`, failures: [] });
  expect(JSON.stringify(result)).not.toContain("DO_NOT_PRINT_PRIVATE_VALUE");
  const cli = spawnSync(process.execPath, [
    "scripts/verify-client-runtime-config.mjs", "--service", expected.service,
    "--expected-revision", expected.revision, "--expected-image-digest", `sha256:${digest}`,
    "--tenant", expected.tenant,
  ], { input: JSON.stringify(service), encoding: "utf8" });
  expect(cli.status).toBe(0);
  expect(cli.stdout).not.toContain("DO_NOT_PRINT_PRIVATE_VALUE");
});

test("candidate config preflight fails for the observed beta blockers and a pending template", () => {
  const service = snapshot();
  const env = service.spec.template.spec.containers[0].env;
  env.find((entry) => entry.name === "CLIENT_RETENTION_DAYS")!.value = "1";
  env.find((entry) => entry.name === "CLIENT_ALLOWED_API_ROUTES")!.value = "/api/client-runtime/records";
  service.status.latestCreatedRevisionName = "agentos-internal-beta-00036-pending";
  const result = evaluateClientRuntimeConfig(service, expected);
  expect(result.ok).toBe(false);
  expect(result.failures).toContain("template_not_ready_revision");
  expect(result.failures).toContain("retention_days_not_45");
  expect(result.failures).toContain("required_api_route_missing:/api/client-runtime/source-import");
  expect(result.failures).toContain("required_api_route_missing:/api/client-runtime/build-identity");
  const cli = spawnSync(process.execPath, [
    "scripts/verify-client-runtime-config.mjs", "--service", expected.service,
    "--expected-revision", expected.revision, "--expected-image-digest", `sha256:${digest}`,
    "--tenant", expected.tenant,
  ], { input: JSON.stringify(service), encoding: "utf8" });
  expect(cli.status).toBe(1);
  expect(cli.stdout).not.toContain("DO_NOT_PRINT_PRIVATE_VALUE");
});

test("candidate config preflight rejects ambiguous variables and split traffic", () => {
  const service = snapshot();
  service.spec.template.spec.containers[0].env.push({ name: "CLIENT_RETENTION_DAYS", value: "1" });
  service.status.traffic.push({ revisionName: "agentos-internal-beta-00034-old", percent: 0, latestRevision: false });
  const result = evaluateClientRuntimeConfig(service, expected);
  expect(result.failures).toContain("duplicate_runtime_variable");
  expect(result.failures).toContain("traffic_not_single_expected_revision");
  expect(result.failures).toContain("retention_days_not_45");
});
