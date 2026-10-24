#!/usr/bin/env node
import process from "node:process";
import { evaluateClientStorageConfig } from "./lib/client-storage-config-check.mjs";

const args = process.argv.slice(2);
const valueAfter = (flag) => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : null;
};
const bucket = valueAfter("--bucket");
const namespace = valueAfter("--namespace");
const origin = valueAfter("--expected-origin");
const parsedOrigin = (() => { try { return new URL(origin); } catch { return null; } })();
if (!/^[a-z0-9][a-z0-9._-]{2,221}$/.test(bucket ?? "")
    || !/^[a-z][a-z0-9-]{2,40}$/.test(namespace ?? "")
    || !parsedOrigin || parsedOrigin.protocol !== "https:"
    || parsedOrigin.origin !== origin || parsedOrigin.username || parsedOrigin.password) {
  console.error("Pass --bucket, --namespace, and a bare HTTPS --expected-origin.");
  process.exit(2);
}

let input = "";
for await (const chunk of process.stdin) {
  input += chunk;
  if (input.length > 2_000_000) {
    console.error("Bucket snapshot exceeds the input limit.");
    process.exit(2);
  }
}
let snapshot;
try { snapshot = JSON.parse(input); }
catch {
  console.error("Bucket snapshot is not valid JSON.");
  process.exit(2);
}
const result = evaluateClientStorageConfig(snapshot, { bucket, namespace, origin, retentionDays: 28, recoveryDays: 7 });
console.log(JSON.stringify(result, null, 2));
if (!result.ok) process.exitCode = 1;
