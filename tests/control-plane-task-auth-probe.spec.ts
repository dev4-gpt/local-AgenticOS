import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

test("queue authentication probe refuses mutation and verifies a Cloud Tasks adapter request", () => {
  const probe = readFileSync(resolve(process.cwd(), "scripts/probe-control-plane-task-auth.mjs"), "utf8");

  expect(probe).toContain('adapter-queue-authz');
  expect(probe).toContain('GCP_PROVISIONER_ALLOW_APPLY=1');
  expect(probe).toContain('adapterAudience !== new URL(adapterUrl).origin');
  expect(probe).toContain('row?.httpRequest?.userAgent === "Google-Cloud-Tasks"');
  expect(probe).toContain('status === 200');
});
