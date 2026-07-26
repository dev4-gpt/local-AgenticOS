#!/usr/bin/env node
import { spawn } from "node:child_process";
import process from "node:process";

// The operator runtime is the local 3939 edition. It intentionally keeps the
// machine-local CLI, vault, and workspace surfaces available for the owner.
// Client deployments use run-client-runtime-local.mjs instead.
const env = { ...process.env };
const port = valueAfter("--port") || "3939";

delete env.VELOCE_CLIENT_EDITION;
delete env.AGENTIC_OS_DISABLE_LOCAL_CLI;
delete env.AGENTIC_OS_DISABLE_LOCAL_FILES;
env.AGENTIC_OS_REQUIRE_APPROVALS = env.AGENTIC_OS_REQUIRE_APPROVALS || "1";
env.AGENTIC_OS_LOCATION = env.AGENTIC_OS_LOCATION || "Local operator";
env.PORT = port;

console.log(`Starting Veloce operator runtime on http://127.0.0.1:${port}`);
console.log("Local CLI, vault, and workspace access are enabled for this owner-only runtime.");

const child = spawn(process.execPath, ["scripts/run-next-dev.mjs"], {
  cwd: process.cwd(),
  stdio: "inherit",
  env,
});

child.on("error", (error) => {
  console.error(`Unable to start the operator runtime: ${error.message}`);
  process.exit(1);
});

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});

function valueAfter(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : null;
}
