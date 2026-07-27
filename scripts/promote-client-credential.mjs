#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import process from "node:process";

const args = process.argv.slice(2);
const project = valueAfter("--project");
const clientSlug = valueAfter("--client-slug");
const providerKey = valueAfter("--provider")?.trim().toUpperCase();
const inboxSecret = valueAfter("--inbox-secret");
const targetSecret = valueAfter("--target-secret");
const version = valueAfter("--version") || "latest";
const apply = args.includes("--apply");
const disablePrevious = args.includes("--disable-previous");
const disableSourceVersion = args.includes("--disable-source-version");

if (!project || !clientSlug || !providerKey || !inboxSecret || !targetSecret) {
  fail("Usage: npm run promote:client-credential -- --project PROJECT --client-slug SLUG --provider PROVIDER_KEY --inbox-secret SECRET --target-secret SECRET [--version latest|N] [--apply] [--disable-previous] [--disable-source-version]");
}
if (!/^[a-z][a-z0-9-]{2,40}$/.test(clientSlug)) fail("Invalid client slug");
if (!/^[A-Z][A-Z0-9_]{2,120}$/.test(providerKey)) fail("Invalid provider key");
if (!/^[a-z][a-z0-9_-]{1,120}$/.test(inboxSecret) || !/^\d+$|^latest$/.test(version)) fail("Invalid source secret or version");
if (!inboxSecret.startsWith(`veloce-${clientSlug}-`)) fail("Source inbox secret must be inside the client namespace");
if (!targetSecret.startsWith(`veloce-${clientSlug}-`)) fail("Target secret must be inside the client namespace");
if (targetSecret === inboxSecret || targetSecret.includes("credential-inbox")) fail("Target secret must be a provider secret, not the credential inbox");
if ((disablePrevious || disableSourceVersion) && !apply) fail("Secret version disabling requires --apply so the new target version is written first");

const source = run("gcloud", ["secrets", "versions", "access", version, "--secret", inboxSecret, "--project", project]);
const sourceVersion = disableSourceVersion && apply ? (version === "latest" ? latestEnabledVersion() : version) : null;
let envelope;
try {
  envelope = JSON.parse(source);
} catch {
  fail("Source inbox version is not valid JSON; no target secret was changed");
}

const submittedClient = envelope?.client?.slug;
const submittedProvider = envelope?.provider?.key;
const value = envelope?.value;
if (submittedClient !== clientSlug) fail("Source credential belongs to a different client namespace");
if (submittedProvider !== providerKey) fail("Source credential provider does not match --provider");
if (typeof value !== "string" || value.length < 6 || value.length > 12000) fail("Source credential value is invalid");

console.log(`${apply ? "Promoting" : "Validated"} ${providerKey} for ${clientSlug}`);
console.log(`Source: ${inboxSecret}:${version}`);
console.log(`Target: ${targetSecret}:latest`);
console.log("Raw credential value is never printed.");
if (apply) {
  const previousVersions = disablePrevious ? enabledTargetVersions() : [];
  const result = spawnSync("gcloud", ["secrets", "versions", "add", targetSecret, "--project", project, "--data-file=-"], {
    input: value,
    stdio: ["pipe", "inherit", "inherit"],
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
  for (const previousVersion of previousVersions) {
    const disabled = spawnSync("gcloud", ["secrets", "versions", "disable", previousVersion, "--secret", targetSecret, "--project", project], { stdio: "inherit" });
    if (disabled.status !== 0) process.exit(disabled.status ?? 1);
  }
  if (disableSourceVersion) {
    const disabled = spawnSync("gcloud", ["secrets", "versions", "disable", sourceVersion, "--secret", inboxSecret, "--project", project], { stdio: "inherit" });
    if (disabled.status !== 0) process.exit(disabled.status ?? 1);
    console.log(`Source inbox version disabled: ${inboxSecret}:${sourceVersion}`);
  }
  console.log("Promotion complete. The next approved Cloud Run revision can consume the new target version as latest.");
} else {
  console.log("Dry run only. Add --apply to write the target secret version.");
}

function enabledTargetVersions() {
  const result = spawnSync("gcloud", ["secrets", "versions", "list", targetSecret, "--project", project, "--filter=state=ENABLED", "--format=value(name.basename())"], { encoding: "utf8" });
  if (result.status !== 0) fail("Could not enumerate existing target secret versions");
  return result.stdout.split(/\r?\n/).map((item) => item.trim()).filter((item) => /^\d+$/.test(item));
}

function latestEnabledVersion() {
  const result = spawnSync("gcloud", ["secrets", "versions", "list", inboxSecret, "--project", project, "--filter=state=ENABLED", "--sort-by=~createTime", "--limit=1", "--format=value(name.basename())"], { encoding: "utf8" });
  if (result.status !== 0 || !/^\d+$/.test(result.stdout.trim())) fail("Could not resolve the source inbox version");
  return result.stdout.trim();
}

function valueAfter(flag) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : null;
}

function run(command, commandArgs) {
  const result = spawnSync(command, commandArgs, { encoding: "utf8" });
  if (result.status !== 0) fail("Could not read the source secret version");
  return result.stdout;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
