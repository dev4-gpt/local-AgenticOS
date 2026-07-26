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
expect(statusResponse.status === 200, "client status endpoint must be reachable");
expect(status?.mode?.clientEdition === true, "client status must identify client edition");
expect(status?.mode?.localCliDisabled === true, "client status must disable local CLI");
expect(status?.mode?.localFilesDisabled === true, "client status must disable local files");
expect(status?.credentials?.every((item) => typeof item.connected === "boolean" && !("value" in item)), "status must expose booleans, never credential values");

const capabilityResponse = await request("/api/capabilities");
const capabilityData = await capabilityResponse.json().catch(() => null);
expect(capabilityResponse.status === 200, "client capability endpoint must be reachable");
expect(capabilityData?.capabilities?.every((item) => item.audience === "built-in" && !item.destination), "client capabilities must be client-ready and destination-free");

if (failures.length > 0) {
  console.error(`Client runtime verification failed for ${base}`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Client runtime verification passed for ${base}`);
