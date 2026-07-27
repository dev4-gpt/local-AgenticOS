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
const metrics = [
  { suffix: "runtime_429", event: "runtime.rate_limited", description: "Rate-limit events", title: "runtime throttles" },
  { suffix: "runtime_budget_denied", event: "runtime.budget_exceeded", description: "Budget denial events", title: "budget denials" },
  { suffix: "runtime_provider_failed", event: "runtime.provider_failed", description: "Provider failure events", title: "provider failures" },
  { suffix: "runtime_delivery_failed", event: "runtime.delivery_failed", description: "Delivery failure events", title: "delivery failures" },
];

console.log(`Veloce runtime alerts: ${slug}`);
console.log(`Mode: ${apply ? "APPLY" : "DRY RUN"}`);
for (const metric of metrics) {
  const metricName = `veloce_${slug}_${metric.suffix}`;
  const policyName = `Veloce ${slug} ${metric.title}`;
  const filter = `resource.type="cloud_run_revision" AND resource.labels.service_name="${service}" AND jsonPayload.event="${metric.event}"`;
  const metricFilter = `metric.type="logging.googleapis.com/user/${metricName}" AND resource.type="cloud_run_revision" AND resource.labels.service_name="${service}"`;
  console.log(`Metric: ${metricName}`);
  console.log(`Policy: ${policyName}`);
  run("gcloud", ["logging", "metrics", "create", metricName, "--project", project, "--description", metric.description, "--log-filter", filter], false, undefined, metricName);
  const policy = {
    displayName: policyName,
    enabled: true,
    combiner: "OR",
    conditions: [{
      displayName: `${metric.title} exceed ten events in five minutes`,
      conditionThreshold: {
        filter: metricFilter,
        comparison: "COMPARISON_GT",
        thresholdValue: 10,
        duration: "300s",
        aggregations: [{ alignmentPeriod: "60s", perSeriesAligner: "ALIGN_RATE", crossSeriesReducer: "REDUCE_SUM" }],
      },
    }],
    documentation: {
      content: `Investigate ${metric.title} for ${slug}. This alert contains no prompts, keys, or client content.`,
      mimeType: "text/markdown",
    },
    ...(notificationChannel ? { notificationChannels: [notificationChannel] } : {}),
  };
  const policyFile = `/tmp/${metricName}-policy.json`;
  writeFileSync(policyFile, JSON.stringify(policy, null, 2), { mode: 0o600 });
  try {
    run("gcloud", ["monitoring", "policies", "create", "--project", project, `--policy-from-file=${policyFile}`], true, policyName, metricName);
  } finally {
    if (existsSync(policyFile)) unlinkSync(policyFile);
  }
}

function run(command, commandArgs, policyCommand, policyName, metricName) {
  const rendered = [command, ...commandArgs].join(" ");
  console.log(rendered);
  if (!apply) return;
  if (policyCommand) {
    const existing = spawnSync("gcloud", ["monitoring", "policies", "list", "--project", project, `--filter=displayName="${policyName}"`, "--format=value(name)"], { encoding: "utf8" });
    if (existing.status === 0 && existing.stdout.trim()) {
      const policyResource = existing.stdout.split(/\r?\n/).map((value) => value.trim()).find(Boolean);
      if (notificationChannel && policyResource) {
        const updated = spawnSync("gcloud", ["monitoring", "policies", "update", policyResource, "--project", project, `--add-notification-channels=${notificationChannel}`], { stdio: "inherit" });
        if (updated.status !== 0) process.exit(updated.status ?? 1);
        console.log("Alert policy already existed; notification channel attached.");
      } else {
        console.log("Alert policy already exists; leaving it unchanged.");
      }
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
