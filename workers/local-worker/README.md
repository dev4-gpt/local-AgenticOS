# Veloce Local Worker (development bridge)

The Local Worker binds only to `127.0.0.1` and accepts a one-time pairing code
shown in the local terminal. It deliberately supports a closed set of actions:
searching customer-approved source scopes, listing locally installed Ollama
models, and running a selected local Ollama model. It never accepts arbitrary
shell commands or cloud credentials.

This is the runnable source foundation for Hybrid Edition. It is **not yet a
signed customer installer**; code signing, notarization, platform packaging,
and production device identity are release work outside this Node bridge.

## Run locally

From the repository root:

```bash
npm run local-worker -- init
npm run local-worker -- grant --id notes --kind vault --path "/absolute/path/to/Obsidian/Vault"
npm run local-worker -- grant --id projects --kind repository --path "/absolute/path/to/projects"
npm run local-worker -- start
```

Open `https://app.veloceos.cloud/hybrid`, choose **Check local worker**, then
enter the one-time code printed by `start`. The browser retains the local
session only in memory and it expires after 30 minutes.

For a local Veloce development server, replace the allowed origin explicitly:

```bash
npm run local-worker -- start --origin http://127.0.0.1:3000
```

## Security model

- The server never binds beyond loopback.
- CORS accepts exactly one configured Veloce app origin, never `*`.
- Pairing code is terminal-only, random, and never returned by the status API.
- Local session tokens are in-memory and expire after 30 minutes.
- Browser requests use typed jobs; there is no arbitrary command or shell API.
- Source paths are configured locally; the cloud UI sees a scope label, not an
  absolute path. Results remain local until the user explicitly shares one.
