#!/usr/bin/env node
import process from "node:process";

const base = (process.env.CLIENT_RUNTIME_URL || "http://127.0.0.1:3940").replace(/\/$/, "");
const failures = [];

async function request(path) {
  return fetch(`${base}${path}`, { redirect: "manual", cache: "no-store" });
}

function expect(condition, message) {
  if (!condition) failures.push(message);
}

const root = await request("/");
expect(root.status === 307 && root.headers.get("location")?.startsWith("/login"), "root must redirect unauthenticated users to login");

const credentialsPage = await request("/credentials");
expect(credentialsPage.status === 307 && credentialsPage.headers.get("location")?.startsWith("/login"), "credentials page must require login");

const login = await request("/login");
expect(login.status === 200, "login page must be reachable");

const privatePage = await request("/claude");
expect(privatePage.status === 307 && privatePage.headers.get("location")?.startsWith("/login"), "full UI routes must require client login");

const privateApi = await request("/api/claude/status");
expect(privateApi.status === 403, "operator API must return 403 in client mode");

const statusResponse = await request("/api/client-runtime/credentials");
const status = await statusResponse.json().catch(() => null);
expect(statusResponse.status === 401, "client status endpoint must require login");
expect(status?.error === "not_authenticated", "unauthenticated status must return a generic auth error");

const capabilityResponse = await request("/api/capabilities");
const capabilityData = await capabilityResponse.json().catch(() => null);
expect(capabilityResponse.status === 401, "client capability endpoint must require login");
expect(capabilityData?.error === "not_authenticated", "unauthenticated capabilities must return a generic auth error");

for (const path of ["/api/client-runtime/hosted-jobs", "/api/client-runtime/delivery"]) {
  const response = await request(path);
  expect(response.status === 401, `${path} must require login`);
}

if (failures.length > 0) {
  console.error(`Client runtime verification failed for ${base}`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Client runtime verification passed for ${base}`);
