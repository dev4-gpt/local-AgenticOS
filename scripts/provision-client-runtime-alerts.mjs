#!/usr/bin/env node
import { existsSync, writeFileSync, unlinkSync } from "node:fs";
import { spawnSync } from "node:child_process";
import process from "node:process";

const args = process.argv.slice(2);
const project = required("--project");
const slug = sanitize(required("--slug"));
const service = sanitize(required("--service"));
const apply = args.includes("--apply");
const notificationChannel = valueAfter("--notification-channel");
const metricName = `veloce_${slug}_runtime_429`;
const policyName = `Veloce ${slug} runtime throttles`;
const filter = `resource.type="cloud_run_revision" AND resource.labels.service_name="${service}" AND jsonPayload.event="runtime.rate_limited"`;
const metricFilter = `metric.type="logging.googleapis.com/user/${metricName}" AND resource.type="cloud_run_revision" AND resource.labels.service_name="${service}"`;

const commands = [
  ["gcloud", ["logging", "metrics", "create", metricName, "--project", project, "--description", `Rate-limit events for ${slug}`, "--log-filter", filter]],
];
console.log(`Veloce runtime alerts: ${slug}`);
console.log(`Metric: ${metricName}`);
console.log(`Policy: ${policyName}`);
console.log(`Mode: ${apply ? "APPLY" : "DRY RUN"}`);
for (const [command, commandArgs] of commands) run(command, commandArgs, false);

const policy = {
  displayName: policyName,
  enabled: true,
  combiner: "OR",
  conditions: [{
    displayName: "Runtime throttles exceed ten events in five minutes",
    conditionThreshold: {
      filter: metricFilter,
      comparison: "COMPARISON_GT",
      thresholdValue: 10,
      duration: "300s",
      aggregations: [{ alignmentPeriod: "60s", perSeriesAligner: "ALIGN_RATE", crossSeriesReducer: "REDUCE_SUM" }],
    },
  }],
  documentation: { content: `Investigate runtime throttling for ${slug}. This alert contains no prompts, keys, or client content.` },
  ...(notificationChannel ? { notificationChannels: [notificationChannel] } : {}),
};
const policyFile = `/tmp/${metricName}-policy.json`;
writeFileSync(policyFile, JSON.stringify(policy, null, 2), { mode: 0o600 });
try {
  run("gcloud", ["monitoring", "policies", "create", "--project", project, `--policy-from-file=${policyFile}`], true);
} finally {
  if (existsSync(policyFile)) unlinkSync(policyFile);
}

function run(command, commandArgs, policyCommand) {
  const rendered = [command, ...commandArgs].join(" ");
  console.log(rendered);
  if (!apply) return;
  if (policyCommand) {
    const existing = spawnSync("gcloud", ["monitoring", "policies", "list", "--project", project, `--filter=displayName="${policyName}"`, "--format=value(name)"], { encoding: "utf8" });
    if (existing.status === 0 && existing.stdout.trim()) {
      console.log("Alert policy already exists; leaving it unchanged.");
      return;
    }
  } else {
    const existing = spawnSync("gcloud", ["logging", "metrics", "describe", metricName, "--project", project], { stdio: "ignore" });
    if (existing.status === 0) {
      console.log("Log-based metric already exists; leaving it unchanged.");
      return;
    }
  }
  const result = spawnSync(command, commandArgs, { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function valueAfter(flag) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : null;
}

function required(flag) {
  const value = valueAfter(flag);
  if (!value) fail(`${flag} is required`);
  return value;
}

function sanitize(value) {
  const clean = value.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  if (!/^[a-z][a-z0-9-]{2,62}$/.test(clean)) fail(`Invalid identifier: ${value}`);
  return clean;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
