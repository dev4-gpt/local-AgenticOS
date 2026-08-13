#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import process from "node:process";

function validateClientRuntimePublicBaseUrl(value) {
  const raw = String(value ?? "").trim().replace(/\/$/, "");
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("VELOCE_LOCAL_PUBLIC_URL must be a valid HTTPS URL");
  }
  if (url.protocol !== "https:") throw new Error("VELOCE_LOCAL_PUBLIC_URL must use HTTPS");
  if (["localhost", "127.0.0.1", "::1"].includes(url.hostname) || url.hostname.endsWith(".localhost")) {
    throw new Error("VELOCE_LOCAL_PUBLIC_URL must be a public tunnel origin, not localhost");
  }
  return raw;
}

if (process.argv[1] && resolve(process.argv[1]).endsWith("scripts/verify-client-runtime-local-tunnel.mjs")) {
  const publicUrl = validateClientRuntimePublicBaseUrl(process.env.VELOCE_LOCAL_PUBLIC_URL);
  const cookieFile = process.env.VELOCE_LOCAL_COOKIE_FILE || "/private/tmp/veloce-runtime-cookie.txt";
  console.log(`Running full local parity through the manually managed HTTPS tunnel: ${publicUrl}`);
  console.log("The tunnel is never started, persisted, or installed by Veloce.");
  const result = spawnSync(process.execPath, [
    "scripts/verify-client-runtime-surface-map.mjs",
    "--url", publicUrl,
    "--cookie-file", cookieFile,
  ], { stdio: "inherit", env: process.env });
  if (result.error) throw result.error;
  process.exit(result.status ?? 1);
}
