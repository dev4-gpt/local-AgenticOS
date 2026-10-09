#!/usr/bin/env node
import process from "node:process";
import { evaluateClientRuntimeConfig } from "./lib/client-runtime-config-check.mjs";

const args = process.argv.slice(2);
const valueAfter = (flag) => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : null;
};
const service = valueAfter("--service");
const revision = valueAfter("--expected-revision");
const digestValue = valueAfter("--expected-image-digest")?.replace(/^sha256:/i, "").toLowerCase();
const tenant = valueAfter("--tenant");
if (!/^[a-z][a-z0-9-]{2,60}$/.test(service ?? "") || !/^[a-z][a-z0-9-]{2,126}$/.test(revision ?? "")
    || !/^[0-9a-f]{64}$/.test(digestValue ?? "") || !/^[a-z][a-z0-9-]{2,40}$/.test(tenant ?? "")) {
  console.error("Pass --service, --expected-revision, --expected-image-digest, and --tenant with canonical values.");
  process.exit(2);
}

let input = "";
for await (const chunk of process.stdin) {
  input += chunk;
  if (input.length > 2_000_000) {
    console.error("Cloud Run service snapshot exceeds the input limit.");
    process.exit(2);
  }
}
let snapshot;
try { snapshot = JSON.parse(input); }
catch {
  console.error("Cloud Run service snapshot is not valid JSON.");
  process.exit(2);
}
const result = evaluateClientRuntimeConfig(snapshot, { service, revision, digest: digestValue, tenant });
console.log(JSON.stringify(result, null, 2));
if (!result.ok) process.exitCode = 1;
