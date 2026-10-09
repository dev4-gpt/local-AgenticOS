import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { clientImageBuildArgs } from "../scripts/lib/client-image-build.mjs";
import { clientApiRouteAllowed } from "../src/lib/clientRuntimePolicy";
import { loadReviewModule } from "./helpers/load-review-module";

const savedEnv = { ...process.env };
test.afterEach(() => { process.env = { ...savedEnv }; });

test("build identity is tenant-authenticated, uncached, and rejects malformed stamps", async () => {
  let authorized = false;
  const route = loadReviewModule("src/app/api/client-runtime/build-identity/route.ts", {
    "next/server": { NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) } },
    "@/lib/clientAuth": { currentClientUser: async () => ({ id: "member" }), currentClientMember: async () => authorized },
  });
  process.env.VELOCE_BUILD_SOURCE_COMMIT = "private-token-not-a-sha";
  process.env.K_REVISION = "revision?secret=unsafe";
  const denied = await route.GET();
  expect(denied.status).toBe(401);
  expect(await denied.json()).toEqual({ ok: false, error: "not_authenticated" });
  expect(denied.headers.get("cache-control")).toBe("private, no-store");

  authorized = true;
  const unknown = await route.GET();
  expect(await unknown.json()).toEqual({
    ok: true, sourceCommit: null, cloudRunRevision: null,
    provenance: "reported_by_runtime_not_independent_attestation",
  });
  process.env.VELOCE_BUILD_SOURCE_COMMIT = "A".repeat(40);
  process.env.K_REVISION = "agentos-internal-beta-00042-abcd";
  const stamped = await route.GET();
  expect(stamped.headers.get("cache-control")).toBe("private, no-store");
  expect(await stamped.json()).toMatchObject({ sourceCommit: "a".repeat(40), cloudRunRevision: "agentos-internal-beta-00042-abcd" });
  expect(clientApiRouteAllowed("/api/client-runtime/build-identity")).toBe(true);
});

test("client image build stamps only a clean exact Git commit", () => {
  expect(() => clientImageBuildArgs("image:tag", "a".repeat(40), false)).toThrow(/uncommitted files/);
  expect(() => clientImageBuildArgs("image:tag,OTHER=bad", "a".repeat(40), true)).toThrow(/CLIENT_IMAGE/);
  expect(() => clientImageBuildArgs("image:tag", "unknown", true)).toThrow(/40-character/);

  const temp = mkdtempSync(path.join(os.tmpdir(), "client-build-identity-"));
  try {
    mkdirSync(path.join(temp, "scripts", "lib"), { recursive: true });
    mkdirSync(path.join(temp, "bin"));
    copyFileSync("scripts/build-client-image.mjs", path.join(temp, "scripts", "build-client-image.mjs"));
    copyFileSync("scripts/lib/client-image-build.mjs", path.join(temp, "scripts", "lib", "client-image-build.mjs"));
    writeFileSync(path.join(temp, "package.json"), "{\"type\":\"module\"}\n");
    writeFileSync(path.join(temp, "tracked.txt"), "clean\n");
    const gcloud = path.join(temp, "bin", "gcloud");
    writeFileSync(gcloud, "#!/bin/sh\nprintf '%s\\n' \"$@\"\n", { mode: 0o700 });
    const git = (...args: string[]) => spawnSync("git", args, { cwd: temp, encoding: "utf8" });
    expect(git("init", "-q").status).toBe(0);
    expect(git("add", ".").status).toBe(0);
    expect(git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-qm", "fixture").status).toBe(0);
    const commit = git("rev-parse", "HEAD").stdout.trim();
    const env = { ...process.env, CLIENT_IMAGE: "asia-south1-docker.pkg.dev/test/repo/client:v1", PATH: `${path.join(temp, "bin")}:${process.env.PATH ?? ""}` };
    const run = () => spawnSync(process.execPath, [path.join(temp, "scripts", "build-client-image.mjs")], { cwd: temp, env, encoding: "utf8" });
    const clean = run();
    expect(clean.status).toBe(0);
    expect(clean.stdout).toContain(`--substitutions=_IMAGE=${env.CLIENT_IMAGE},_SOURCE_COMMIT=${commit}`);
    writeFileSync(path.join(temp, "tracked.txt"), "changed\n");
    const dirty = run();
    expect(dirty.status).toBe(1);
    expect(dirty.stderr).toContain("uncommitted files");
    expect(dirty.stdout).toBe("");
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }

  const cloudBuild = readFileSync("cloudbuild.client.yaml", "utf8");
  const dockerfile = readFileSync("Dockerfile.client", "utf8");
  expect(cloudBuild).toContain("VELOCE_SOURCE_COMMIT=${_SOURCE_COMMIT}");
  expect(cloudBuild).toContain("_SOURCE_COMMIT: unverified");
  expect(dockerfile).toContain("ARG VELOCE_SOURCE_COMMIT=unverified");
  expect(dockerfile.indexOf("Client image build requires a full source commit")).toBeLessThan(dockerfile.indexOf("RUN npm ci"));
  const commitCheck = dockerfile.match(/^RUN node -e '([^']+)'$/m)?.[1];
  expect(commitCheck).toBeTruthy();
  const checkCommit = (commit: string) => spawnSync(process.execPath, ["-e", commitCheck!], {
    env: { ...process.env, VELOCE_SOURCE_COMMIT: commit }, encoding: "utf8",
  });
  for (const invalid of ["unverified", "a".repeat(12), "not-a-source-commit"]) {
    expect(checkCommit(invalid).status).toBe(1);
  }
  expect(checkCommit("a".repeat(40)).status).toBe(0);
  expect(dockerfile).toContain("ENV VELOCE_BUILD_SOURCE_COMMIT=${VELOCE_SOURCE_COMMIT}");
  expect(dockerfile).toContain("LABEL org.opencontainers.image.revision=${VELOCE_SOURCE_COMMIT}");
  for (const runbook of ["docs/public-beta-runbook.md", "docs/v3.3-managed-credit-lifecycle-runbook.md"]) {
    expect(readFileSync(runbook, "utf8")).toContain("_SOURCE_COMMIT=$SOURCE_COMMIT");
  }
});
