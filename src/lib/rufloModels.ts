// Shared, client-safe model list for Ruflo swarm execution — no Node APIs
// here, so this can be imported from both the server (rufloExec.ts) and the
// client (RufloView.tsx) without pulling node:fs/child_process into the
// browser bundle.

export type ExecModel = "claude-haiku" | "claude-sonnet" | "claude-opus" | "kimi" | "grok" | "local";
export const EXEC_MODELS: ExecModel[] = ["claude-haiku", "claude-sonnet", "claude-opus", "kimi", "grok", "local"];
export const EXEC_MODEL_INFO: Record<ExecModel, { label: string; group: string }> = {
  "claude-haiku":  { label: "Claude Haiku — fast, cheap", group: "Cloud · Claude" },
  "claude-sonnet": { label: "Claude Sonnet — balanced", group: "Cloud · Claude" },
  "claude-opus":   { label: "Claude Opus — most capable", group: "Cloud · Claude" },
  kimi:            { label: "Kimi K2.7", group: "Cloud · Other" },
  grok:            { label: "Grok", group: "Cloud · Other" },
  local:           { label: "Local (Ollama) — free", group: "Local" },
};
