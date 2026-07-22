# Security Release Gate

Veloce AgenticOS has two distinct security surfaces:

- The public Veloce services site: static marketing and qualified-contact only.
- The private local operating system: agents, files, provider credentials, and execution controls.

The public site must never expose the private surface.

## Required Automated Checks

Run these before a public release:

```bash
npm run verify:security
npm audit --audit-level=high
npm run build
```

The GitHub workflow runs the same gate. A high or critical dependency vulnerability blocks release until it is reviewed and remediated or formally accepted with a documented exception.

`verify:security` checks the checked-in security scope, local-only target allowlist, disabled agentic pentest integrations, secret-ignore rules, and public-site boundary markers.

## PentAGI And HexStrike AI

PentAGI and HexStrike AI are **not** installed as Veloce AgenticOS MCP servers and are not exposed in the dashboard. Both can autonomously orchestrate offensive-security tooling, so they are unsuitable for unrestricted product use. PentAGI is a Docker-based autonomous penetration-testing platform, while HexStrike AI exposes a large MCP-connected security-tool inventory. [PentAGI](https://github.com/vxcontrol/pentagi) [HexStrike AI](https://github.com/0x4m4/hexstrike-ai)

They may only be used as a manual final-review option when all of the following are true:

1. The target is Veloce-owned, loopback, or a staging system covered by written authorization.
2. The scan runs in a separate disposable environment, not on the Mac running the private dashboard.
3. A human reviews scope, rate limits, credentials, and findings before execution.
4. No client, production, or third-party target is added to `security/pentest-scope.json`.
5. The resulting report is stored privately, never in the public repository.

The checked-in scope intentionally keeps both tools disabled. Enabling either requires an explicit security review and a one-time local scope file outside Git.
