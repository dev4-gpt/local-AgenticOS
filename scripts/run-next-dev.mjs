import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const currentMajor = Number(process.versions.node.split(".")[0]);
const homebrewNode24 = "/opt/homebrew/opt/node@24/bin/node";
const runtime = currentMajor >= 22 && currentMajor < 26
  ? process.execPath
  : existsSync(homebrewNode24)
    ? homebrewNode24
    : null;

if (!runtime) {
  console.error(
    `Veloce AgenticOS requires Node 22 or 24. Current runtime: ${process.version}. ` +
    "Install node@24 or activate a supported Node version, then run npm run dev again.",
  );
  process.exit(1);
}

if (runtime !== process.execPath) {
  console.log(`Using Node 24 for Veloce AgenticOS (current shell is ${process.version}).`);
}

const nextBin = path.join(process.cwd(), "node_modules", "next", "dist", "bin", "next");
const child = spawn(
  runtime,
  [nextBin, "dev", "--disable-source-maps", "-H", "127.0.0.1"],
  {
    stdio: "inherit",
    env: { ...process.env, PORT: process.env.PORT || "3737" },
  },
);

child.on("error", (error) => {
  console.error(`Unable to start Veloce AgenticOS: ${error.message}`);
  process.exit(1);
});

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
