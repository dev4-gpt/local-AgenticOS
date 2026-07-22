---
name: veloce-security-release-review
description: Prepare and review an authorized Veloce security release assessment using PentAGI and HexStrike AI as manual, isolated operator references. Use before a public release or after a material security change.
---

# Veloce Security Release Review

Use this skill to prepare evidence, scope, and remediation for Veloce-owned local or staging systems. It is not permission to run autonomous tools, add MCP servers, or test arbitrary targets.

## Sources

- PentAGI: `https://github.com/vxcontrol/pentagi`
- HexStrike AI: `https://github.com/0x4m4/hexstrike-ai`
- Veloce scope policy: `security/pentest-scope.json`
- Veloce release gate: `SECURITY-RELEASE-GATE.md`

## Required Scope Check

Before any assessment, confirm all of the following:

1. The target is loopback, Veloce-owned staging, or covered by written owner authorization.
2. The target, maintenance window, rate limit, data-handling rule, and human reviewer are recorded.
3. The assessment is run in a separate disposable environment, never through the public site or client dashboard.
4. Provider keys, client data, vault exports, and production credentials are excluded from findings and prompts.

If any check is missing, stop and prepare only a scope checklist.

## Review Workflow

1. Run Veloce's automated release gate and dependency audit.
2. Review public/private separation: no dashboard routes, local paths, agent controls, or keys in the public artifact.
3. Create a human-approved test plan that names the exact Veloce-owned target and allowed test categories.
4. Use PentAGI or HexStrike AI only as a manually supervised, isolated assessment option.
5. Record findings as: affected surface, evidence, severity, remediation owner, target date, and retest result.
6. Re-run the automated gate and browser smoke tests after remediation.

## Boundaries

- Keep both referenced tools disabled in the product runtime.
- Do not expose their MCP servers to customers, public deployments, or general-purpose agent chat.
- Do not add external targets to the checked-in scope.
- Do not generate exploit chains, credential attacks, or autonomous scanning instructions.
- Do not mark a release secure when high or critical dependency findings remain unresolved.

## Output Template

Return a concise review with:

- scope and authorization status;
- automated gate results;
- manual assessment status or reason it was not run;
- findings and remediation owners;
- retest status;
- release decision: `blocked`, `conditional`, or `approved`.
