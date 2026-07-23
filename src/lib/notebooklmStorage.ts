import os from "node:os";
import path from "node:path";
import { config } from "@/lib/config";

// NotebookLM output belongs beside the rest of the AgenticOS knowledge. When no
// Obsidian vault is configured, keep the feature usable without guessing a vault.
export const NOTEBOOKS_DIR = config.vaultRoot
  ? path.join(config.vaultRoot, "Agentic OS", "Notebooks")
  : path.join(os.homedir(), ".agentic-os", "notebooks");

export const NOTEBOOK_ASSETS_DIR = path.join(NOTEBOOKS_DIR, "_assets");
