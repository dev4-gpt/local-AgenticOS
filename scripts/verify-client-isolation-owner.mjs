#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { closeSync, constants, fstatSync, fsyncSync, ftruncateSync, openSync, readFileSync, writeFileSync, writeSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { hiddenTerminalInput, runIsolationOwnerCheck, runIsolationReadProbe, validateIsolationOwnerPlan } from "./lib/client-isolation-owner.mjs";
import { workingTreeFingerprintSha256 } from "./lib/working-tree-fingerprint.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
let receiptFd;
try {
  const argument = flag => { const i = args.indexOf(flag); if (i < 0 || !args[i + 1] || args[i + 1].startsWith("--")) throw new Error("owner_arguments_invalid"); return args[i + 1]; };
  const planPath = argument("--plan-file"), expectedProjectRef = argument("--expected-project-ref");
  const planBytes = readFileSync(planPath), plan = validateIsolationOwnerPlan(JSON.parse(planBytes), expectedProjectRef);
  if (!args.includes("--run")) {
    console.log(JSON.stringify({ mode: "plan-only", projectRef: plan.projectRef, destination: plan.url,
      maximumPasswordSignIns: 2, maximumIdentityAndReadRequests: 138, maximumCurrentSessionSignouts: 2,
      maximumTotalRequests: 142, networkRequestsMade: 0, hostedApprovalRequired: true,
      note: "Run only after target-specific approval; enter credentials privately in a real terminal, never chat." }, null, 2));
  } else {
    if (!args.includes("--confirm-staging-auth-reads-and-local-signout")) throw new Error("staging_auth_read_signout_confirmation_required");
    if (!process.stdin.isTTY || !process.stderr.isTTY) throw new Error("private_terminal_required");
    if (process.versions.node.split(".")[0] !== "24") throw new Error("owner_node24_required");
    const git = values => execFileSync("git", values, { cwd: root, encoding: "utf8" }).trim();
    const commit = git(["rev-parse", "HEAD"]);
    if (git(["status", "--porcelain"])) throw new Error("clean_owner_candidate_required");
    const fingerprint = workingTreeFingerprintSha256(root);
    const sourceFiles = ["scripts/verify-client-isolation-owner.mjs", "scripts/lib/client-isolation-owner.mjs",
      "scripts/verify-client-runtime-isolation.mjs", "scripts/lib/tenant-isolation-probe.mjs"];
    const hash = bytes => createHash("sha256").update(bytes).digest("hex");
    const sourceHashes = Object.fromEntries(sourceFiles.map(file => [file, hash(readFileSync(resolve(root, file)))]));
    receiptFd = openSync(argument("--out"), constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
    if (fstatSync(receiptFd).mode & 0o077) throw new Error("private_receipt_required");
    writeFileSync(receiptFd, JSON.stringify({ schemaVersion: 1, result: "incomplete", sourceCommit: commit, releaseReady: false }));
    const cancellation = new AbortController();
    const cancel = () => cancellation.abort();
    process.on("SIGINT", cancel); process.on("SIGTERM", cancel);
    process.stderr.write(`Destination: ${plan.url}\nMaximum: 142 requests; two password sign-ins, read probes, current-session sign-out only.\n`);
    let result;
    try {
      result = await runIsolationOwnerCheck(plan, { expectedProjectRef, confirmed: true, signal: cancellation.signal,
        promptSecret: label => hiddenTerminalInput(label, process.stdin, process.stderr, 120000, cancellation.signal),
        runProbe: bundle => runIsolationReadProbe(bundle, { root, signal: cancellation.signal }) });
    } finally { process.off("SIGINT", cancel); process.off("SIGTERM", cancel); }
    const unchanged = git(["rev-parse", "HEAD"]) === commit && !git(["status", "--porcelain"])
      && workingTreeFingerprintSha256(root) === fingerprint
      && sourceFiles.every(file => hash(readFileSync(resolve(root, file))) === sourceHashes[file]);
    const receipt = { ...result, passed: result.passed && unchanged, sourceCommit: commit, candidateFingerprintSha256: fingerprint,
      sourceHashes, planSha256: hash(planBytes), targetProjectRef: plan.projectRef, candidateUnchanged: unchanged,
      checkedAt: new Date().toISOString(), nodeVersion: process.version };
    // Reuse the exclusively opened descriptor; no pathname replacement can redirect this write.
    const receiptBytes = Buffer.from(JSON.stringify(receipt, null, 2));
    ftruncateSync(receiptFd, 0);
    let offset = 0;
    while (offset < receiptBytes.length) {
      const written = writeSync(receiptFd, receiptBytes, offset, receiptBytes.length - offset, offset);
      if (written <= 0) throw new Error("private_receipt_write_failed");
      offset += written;
    }
    fsyncSync(receiptFd);
    console.log(receipt.passed ? "Owner read-only isolation check passed; broader release gates remain open." : "Owner isolation check failed or inconclusive; inspect the minimized receipt privately.");
    if (!receipt.passed) process.exitCode = 1;
  }
} catch {
  console.error("Owner isolation check stopped. Recheck the plan, explicit approval flag, private terminal, Node 24 and exclusive output path. No credentials or raw errors are printed.");
  process.exitCode = 1;
} finally { if (receiptFd !== undefined) closeSync(receiptFd); }
