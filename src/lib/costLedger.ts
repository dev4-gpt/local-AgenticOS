// Private, user-maintained monthly cost ledger.
//
// Provider keys and OAuth logins never reveal a reliable plan price, so fixed
// subscriptions live separately from token/API usage. The ledger is stored
// outside the repo alongside the rest of the user's Agentic OS state.

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const STATE_DIR = path.join(os.homedir(), ".agentic-os");
const LEDGER_FILE = path.join(STATE_DIR, "cost-ledger.json");

export type CostKind = "subscription" | "api-budget";
export interface CostEntry {
  id: string;
  label: string;
  kind: CostKind;
  amount: number;
  currency: "INR" | "USD";
  enabled: boolean;
}

export interface CostLedger {
  entries: CostEntry[];
  updatedAt: number | null;
}

// These are deliberately zero-value suggestions. Prices and billing regions
// vary by plan; a user must enter their actual monthly commitment.
const DEFAULT_ENTRIES: CostEntry[] = [
  { id: "claude", label: "Claude Code", kind: "subscription", amount: 0, currency: "INR", enabled: true },
  { id: "codex", label: "Codex", kind: "subscription", amount: 0, currency: "INR", enabled: true },
  { id: "google-ai", label: "Google AI Pro / Antigravity", kind: "subscription", amount: 0, currency: "INR", enabled: true },
  { id: "elevenlabs", label: "ElevenLabs", kind: "subscription", amount: 0, currency: "INR", enabled: true },
  { id: "openrouter", label: "OpenRouter monthly budget", kind: "api-budget", amount: 0, currency: "USD", enabled: true },
  { id: "kimi", label: "Kimi monthly budget", kind: "api-budget", amount: 0, currency: "USD", enabled: true },
];

function normaliseEntry(value: unknown, index: number): CostEntry | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const label = typeof row.label === "string" ? row.label.trim().slice(0, 80) : "";
  const kind = row.kind === "api-budget" ? "api-budget" : "subscription";
  const currency = row.currency === "USD" ? "USD" : "INR";
  const amount = typeof row.amount === "number" && Number.isFinite(row.amount)
    ? Math.max(0, Math.min(row.amount, 10_000_000))
    : 0;
  if (!label) return null;
  return {
    id: typeof row.id === "string" && /^[a-z0-9-]{1,60}$/i.test(row.id) ? row.id : `custom-${index}`,
    label,
    kind,
    currency,
    amount,
    enabled: row.enabled !== false,
  };
}

function defaults(): CostLedger {
  return { entries: DEFAULT_ENTRIES.map((entry) => ({ ...entry })), updatedAt: null };
}

export async function readCostLedger(): Promise<CostLedger> {
  if (!existsSync(LEDGER_FILE)) return defaults();
  try {
    const parsed = JSON.parse(await readFile(LEDGER_FILE, "utf8")) as { entries?: unknown; updatedAt?: unknown };
    const entries = Array.isArray(parsed.entries)
      ? parsed.entries.map(normaliseEntry).filter((entry): entry is CostEntry => Boolean(entry)).slice(0, 30)
      : [];
    return { entries: entries.length ? entries : defaults().entries, updatedAt: typeof parsed.updatedAt === "number" ? parsed.updatedAt : null };
  } catch {
    return defaults();
  }
}

export async function saveCostLedger(input: unknown): Promise<CostLedger> {
  const rows = Array.isArray(input) ? input : [];
  const entries = rows.map(normaliseEntry).filter((entry): entry is CostEntry => Boolean(entry)).slice(0, 30);
  if (!entries.length) throw new Error("Keep at least one cost entry.");

  const ledger: CostLedger = { entries, updatedAt: Date.now() };
  await mkdir(STATE_DIR, { recursive: true });
  const tmp = `${LEDGER_FILE}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(ledger, null, 2) + "\n", { encoding: "utf8", mode: 0o600 });
  await rename(tmp, LEDGER_FILE);
  return ledger;
}
