# ECC integration and rollout

## Foundation — 2026-09-11

Pinned upstream: [affaan-m/ECC at c9148d0](https://github.com/affaan-m/ECC/tree/c9148d0bb239ed01a95724a5928b98cdf9c30658), MIT. `infrastructure/ecc-upstream.lock.json` records SHA-256, nature, disposition and implementation path for all 3,700 source files. `src/data/ecc-components.json` accounts for 872 components: 291 skills, 68 agents, 107 commands/shims, 122 rules, 277 supporting runtimes, 3 hook configurations, 2 workflows and 2 MCP configurations. The remaining 2,828 files are classified supporting references. Preserved source is not evidence of executable compatibility.

The native Codex plugin `ecc@veloce-ecc`, version `2.2.1-veloce.2`, is installed in the active Codex home. It exposes 291 namespaced skills, 68 on-demand role entrypoints and `ecc:veloce-ecc`. Existing skill names are not overwritten. Role definitions grant no tools, models, permissions or background execution.

The packaging overlay preserves original modified files in `.veloce-upstream-originals/`, copies the MIT license, and writes an ownership/checksum receipt. It removes startup references **and empties default-discovered MCP/hook configuration files**. Removing manifest references alone was insufficient: Codex's plugin specification supplements them with default discovery. Hooks, observers, automatic instinct injection and bundled MCP startup remain disabled. Supporting Node/Python runtimes and provider integrations are preserved references; their dependencies have not been installed or declared operational.

`veloce-ecc` uses explicit checkpoints: scoped reviewed recall, relevant guidance, execution within existing permissions, verification, then a sanitized project lesson proposal. Confidence is not approval. Project lessons do not become global lessons automatically. This developer workflow is not a tenant authorization system.

### Reproduction and removal

Download the exact upstream revision and extract it into a directory without running its installer. Then, from the Veloce repository:

```sh
node scripts/inventory-ecc.mjs /path/to/pinned-upstream
node scripts/verify-ecc.mjs
node scripts/install-ecc-codex.mjs --action install --source /path/to/pinned-upstream --codex-home /path/to/isolated-home
node scripts/probe-ecc-codex.mjs /path/to/isolated-home /path/to/project-a /path/to/project-b
node scripts/install-ecc-codex.mjs --action uninstall --codex-home /path/to/isolated-home
```

Omit `--codex-home` to use the active global home. Installation uses native CLI registration, not the deprecated configuration-copying installer. Reinstallation checks ownership and checksums; a conflicting registration or changed package fails closed. Uninstall removes the owned registration, native cache and receipt-owned source files. It preserves unrelated config, skills, memories and Finder metadata. It refuses a modified package; inspect those changes rather than deleting them blindly.

Use `ecc:veloce-ecc` in a fresh Codex session. Select individual guidance such as `ecc:ecc-search-first` or the role `ecc:ecc-agent-code-reviewer` when relevant. Do not load every skill into context. Existing browser/GitHub integrations remain the execution tools.

### Evidence and limits

[Machine-readable foundation evidence](evidence/ecc-foundation-2026-09-11.json) records:

- CLI 0.143.0 discovery: 360 entrypoints, including 68 role wrappers, in each of two isolated projects and each of two projects using the global installation. Discovery uses `skills/list`, creates no model turn and makes no inference calls.
- Install, repeat install, uninstall and reinstall; unrelated configuration, skill and memory canaries preserved. Global verification found 0 changes across 10,374 existing skill/memory files.
- Native plugin validation passed. Focused tests: 176 passed. Policy gates passed, including ECC coverage/provenance checks.

Discovery proves registration and parsing, not behavioral compliance by every upstream prompt. The 21 previously identified name collisions are contained by the ECC namespace. The native hook path documented upstream for CLI 0.146 is not enabled on 0.143.0. No automatic learning observer or tenant-global memory sharing is introduced.

## Subsequent stage gates

Separate PRs implement adapters/evaluations, tenant learning and lifecycle, product sections/workflows, then deployment acceptance. Product components remain awaiting adaptation/configuration until a registered adapter, exact evidence and tenant policy admit execution. Catalog visibility grants no permission. Unsupported and paid integrations remain gated under the no-new-cost policy.

ECC evidence does not change the GA release ledger. The existing refund-notification defect and outstanding GA acceptance gates remain open; see `ga-live-stripe-verification-2026-09-11.md`.
