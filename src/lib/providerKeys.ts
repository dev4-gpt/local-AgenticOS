import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { hermesHome } from "@/lib/config";

function unquote(value: string): string {
  return value.trim().replace(/^["']|["']$/g, "").trim();
}

function envFileKey(file: string, name: string): string | null {
  try {
    if (!existsSync(file)) return null;
    const line = readFileSync(file, "utf8")
      .split("\n")
      .find((l) => l.trim().startsWith(`${name}=`));
    if (!line) return null;
    const value = unquote(line.slice(line.indexOf("=") + 1));
    return value || null;
  } catch {
    return null;
  }
}

function activeProfile(): string {
  try {
    const value = readFileSync(path.join(hermesHome(), "active_profile"), "utf8").trim();
    if (value) return value;
  } catch {
    /* fall through */
  }
  return process.env.HERMES_PROFILE || "main";
}

function tokenFromEntry(entry: unknown): string | null {
  if (!entry) return null;
  if (typeof entry === "string") return entry.trim() || null;
  if (typeof entry !== "object") return null;
  const record = entry as Record<string, unknown>;
  for (const key of ["access_token", "api_key", "token", "runtime_api_key"]) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function authJsonKey(file: string, provider: string): string | null {
  try {
    if (!existsSync(file)) return null;
    const data = JSON.parse(readFileSync(file, "utf8"));
    const candidates = [
      data?.credential_pool?.[provider],
      data?.providers?.[provider],
      data?.[provider],
    ];
    for (const candidate of candidates) {
      if (Array.isArray(candidate)) {
        for (const entry of candidate) {
          const token = tokenFromEntry(entry);
          if (token) return token;
        }
      } else {
        const token = tokenFromEntry(candidate);
        if (token) return token;
      }
    }
  } catch {
    /* ignore malformed or missing auth files */
  }
  return null;
}

export function providerEnvKey(name: string): string | null {
  const fromEnv = process.env[name]?.trim();
  if (fromEnv) return fromEnv;
  if (process.env.VELOCE_CLIENT_EDITION === "1") return null;
  const profile = activeProfile();
  const files = [
    path.join(hermesHome(), "profiles", profile, ".env"),
    path.join(hermesHome(), "profiles", "fusion", ".env"),
    path.join(hermesHome(), ".env"),
  ];
  for (const file of files) {
    const value = envFileKey(file, name);
    if (value) return value;
  }
  return null;
}

export function openRouterKey(): string | null {
  const fromEnvFile = providerEnvKey("OPENROUTER_API_KEY");
  if (fromEnvFile) return fromEnvFile;
  if (process.env.VELOCE_CLIENT_EDITION === "1") return null;
  const profile = activeProfile();
  const authFiles = [
    path.join(hermesHome(), "profiles", profile, "auth.json"),
    path.join(hermesHome(), "auth.json"),
  ];
  for (const file of authFiles) {
    const value = authJsonKey(file, "openrouter");
    if (value) return value;
  }
  return null;
}
