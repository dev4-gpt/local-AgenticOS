#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import process from "node:process";

const args = process.argv.slice(2);
const strict = args.includes("--strict");
const manifestPath = valueAfter("--manifest") || "infrastructure/openreply/openreply-pilot.manifest.example.json";
const envPath = valueAfter("--env") || "infrastructure/openreply/openreply.env.example";
const liveUrl = valueAfter("--url");
const failures = [];
const warnings = [];

const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const envTemplate = await readFile(envPath, "utf8");
const integrationNote = await readFile("docs/future-integrations/openreply.md", "utf8");
const campaign = JSON.parse(await readFile("client-blueprints/veloce-self-marketing.campaign.json", "utf8"));

expect(manifest.schemaVersion === 1, "manifest schemaVersion must be 1");
expect(manifest.integration === "openreply", "manifest integration must be openreply");
expect(manifest.state === "disabled", "tracked pilot manifest must remain disabled");
expect(manifest.source?.repository === "https://github.com/diwenne/openreply", "manifest must use the official upstream repository");
expect(manifest.deployment?.web?.healthPath === "/api/health", "health path must be /api/health");
expect(manifest.deployment?.web?.oauthCallbackPath === "/api/instagram/callback", "OAuth callback path must be /api/instagram/callback");
expect(manifest.deployment?.web?.webhookPath === "/api/webhook", "webhook path must be /api/webhook");
expect(manifest.deployment?.worker?.buildCommand === "npm run db:generate", "worker build command must generate the database client");
expect(manifest.deployment?.worker?.startCommand === "npm run worker", "worker start command must be npm run worker");
expect(manifest.deployment?.data?.separateProject === true, "OpenReply data services must use a separate project");
expect(sameSet(manifest.webhookFields, ["comments", "messages"]), "webhook fields must be comments and messages");
expect(sameSet(manifest.sharedSecretNames, ["DATABASE_URL", "REDIS_URL", "ENCRYPTION_KEY"]), "shared web/worker secret names are incomplete");
expect(manifest.safety?.humanApprovalRequired === true, "human approval must be required");
expect(manifest.safety?.automaticPublishingEnabled === false, "automatic publishing must remain disabled");
expect(manifest.safety?.directVeloceRuntimeConnection === false, "direct Veloce runtime connection must remain disabled");
expect(manifest.safety?.copySensitiveDataToVeloce === false, "sensitive OpenReply data must not be copied to Veloce");

for (const name of [
  "NEXTAUTH_URL", "NEXTAUTH_SECRET", "CRON_SECRET", "ENCRYPTION_KEY", "DATABASE_URL", "REDIS_URL",
  "RESEND_API_KEY", "EMAIL_FROM", "META_GRAPH_API_VERSION", "INSTAGRAM_APP_ID", "INSTAGRAM_APP_SECRET",
  "FACEBOOK_APP_SECRET", "WEBHOOK_VERIFY_TOKEN",
]) expect(new RegExp(`^${name}=`, "m").test(envTemplate), `environment inventory is missing ${name}`);

expect(integrationNote.includes("/api/instagram/callback"), "integration note is missing the current OAuth callback");
expect(!integrationNote.includes("/api/auth/callback/instagram"), "integration note contains the obsolete OAuth callback");
expect(integrationNote.includes("`comments` and `messages`"), "integration note must require comments and messages webhooks");

const connector = campaign.deliveryConnectors?.find((item) => item.id === "openreply-instagram");
expect(connector?.state === "disabled", "self-marketing OpenReply connector must remain disabled");
expect(connector?.approvalRequired === true, "self-marketing OpenReply connector must require approval");

const serializedTrackedConfig = JSON.stringify({ manifest, envTemplate });
expect(!/(?:sk|rk|ghp|xai)-[A-Za-z0-9_-]{16,}/.test(serializedTrackedConfig), "tracked OpenReply configuration contains a token-like value");
expect(!/postgres(?:ql)?:\/\/[^\s:@]+:[^\s@]+@/i.test(envTemplate), "tracked OpenReply configuration contains database credentials");
expect(!/redis(?:s)?:\/\/[^\s:@]+:[^\s@]+@/i.test(envTemplate), "tracked OpenReply configuration contains Redis credentials");

if (strict) {
  expect(/^[0-9a-f]{40}$/i.test(manifest.source?.reviewedCommit || ""), "strict mode requires a reviewed 40-character upstream commit");
  expect(isHttpsUrl(manifest.deployment?.deployedUrl), "strict mode requires an HTTPS deployedUrl in the manifest");
  for (const [key, passed] of Object.entries(manifest.acceptance || {})) expect(passed === true, `strict mode acceptance gate is not passed: ${key}`);
  expect(Boolean(liveUrl), "strict mode requires --url for a read-only live health check");
}

let health = null;
if (liveUrl) {
  expect(isHttpsUrl(liveUrl), "--url must be an HTTPS origin without a path");
  if (isHttpsUrl(liveUrl)) {
    const expectedManifestUrl = manifest.deployment?.deployedUrl?.replace(/\/$/, "") || null;
    if (expectedManifestUrl && expectedManifestUrl !== liveUrl.replace(/\/$/, "")) failures.push("--url does not match manifest deployment.deployedUrl");
    try {
      const response = await fetch(`${liveUrl.replace(/\/$/, "")}/api/health`, { signal: AbortSignal.timeout(15000), redirect: "error" });
      const body = await response.json();
      health = { status: response.status, workerHealthy: body?.worker?.healthy === true };
      expect(response.status === 200, `live health returned HTTP ${response.status}`);
      expect(body?.worker?.healthy === true, "live health does not report worker.healthy=true");
    } catch (error) {
      failures.push(`live health check failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
} else {
  warnings.push("Live health not checked; pass --url after the isolated pilot is deployed");
}

console.log(JSON.stringify({ ok: failures.length === 0, strict, manifestPath, health, failures, warnings }, null, 2));
if (failures.length) process.exit(1);

function expect(condition, message) {
  if (!condition) failures.push(message);
}

function sameSet(actual, expected) {
  return Array.isArray(actual) && actual.length === expected.length && expected.every((item) => actual.includes(item));
}

function isHttpsUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.pathname === "/" && !url.username && !url.password && !url.search && !url.hash;
  } catch {
    return false;
  }
}

function valueAfter(flag) {
  const index = args.indexOf(flag);
  return index >= 0 && args[index + 1] ? args[index + 1].trim() : null;
}
