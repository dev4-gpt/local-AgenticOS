import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

test("queue authentication probe refuses mutation and verifies a Cloud Tasks adapter request", () => {
  const probe = readFileSync(resolve(process.cwd(), "scripts/probe-control-plane-task-auth.mjs"), "utf8");
  const bridge = readFileSync(resolve(process.cwd(), "product-experience/src/app/api/internal/control-plane/task-authz/route.ts"), "utf8");

  expect(probe).toContain('"/api/internal/control-plane/task-authz"');
  expect(probe).toContain('"control-plane-operator-secret"');
  expect(probe).toContain('"x-control-plane-secret": operatorSecret');
  expect(probe).toContain('response?.status !== 200');
  expect(probe).toContain('GCP_PROVISIONER_ALLOW_APPLY=1');
  expect(probe).toContain('adapterAudience !== new URL(adapterUrl).origin');
  expect(probe).toContain('row?.httpRequest?.userAgent === "Google-Cloud-Tasks"');
  expect(probe).toContain('status === 200');
  expect(bridge).toContain('cloudRunIdTokenFromVercel(request, target)');
  expect(bridge).toContain('parsed.pathname = "/adapter-queue-authz"');
  expect(bridge).toContain('(body as { status?: unknown }).status !== "queued"');
  expect(bridge).not.toContain('"/provision"');
});
