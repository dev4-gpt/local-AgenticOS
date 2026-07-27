# Runtime Capability Matrix

Updated 2026-07-26 after verifying the local processes and the first Cloud Run client-safe image.

For the complete 13-layer business readiness assessment, shareability decision,
and tab-by-tab operator dependency inventory, see
[`docs/client-runtime-13-layer-readiness.md`](client-runtime-13-layer-readiness.md).

## Runtime boundary

| Runtime | Purpose | What it may use |
|---|---|---|
| `http://127.0.0.1:3939/` | Private operator edition | Personal CLI sessions, local vault/files, Ollama, local helper services, and operator credentials |
| `http://127.0.0.1:8082/` | Free Claude Code helper | A loopback `fcc-server` proxy used only by the local Free Claude Code route; it is not a product URL |
| Cloud Run `veloce-cloud-test` | Client-safe validation edition | Supabase Auth, approved provider APIs, client-scoped storage/secrets, and human approval policy |

The local `8082` helper is currently healthy. The Cloud Run runtime must never depend on it because a Cloud Run container cannot reach a service listening on the operator laptop.

## Dependency classes

### Client-safe now

- Mission Control home.
- Context intake, workflow requests, production briefs, and delivery review. These are Supabase-backed intake surfaces and do not need a model key to submit a request.
- Credentials status and the client vault inbox, once the GCP inbox secret and IAM grant are configured.
- Capabilities registry, when it contains only built-in capabilities with no operator destination.

### Client-safe after provider API configuration and approval

These can be exposed only through server-side provider APIs, a per-client allowlist, a model allowlist, budgets, and approval gates. Keys remain in the client secret namespace and are never returned to the browser.

| Surface | Provider requirement currently represented in the UI |
|---|---|
| Claude | `ANTHROPIC_API_KEY` |
| Codex | `OPENAI_API_KEY` |
| OpenClaw, Hermes, Free Claude Code, Fusion, Sakana | `OPENROUTER_API_KEY` or a reviewed replacement adapter |
| Antigravity | `GEMINI_API_KEY` |
| Kimi Code | `MOONSHOT_API_KEY` |
| GLM 5.2 and GLM Code | `GLM_API_KEY` |
| Grok Build | `XAI_API_KEY` |
| Web Studio | `OPENAI_API_KEY` or another approved model adapter |
| Flow Lab | `FIRECRAWL_API_KEY`, only for an authorized source workflow |
| Video, Music, Thumbnails | The specific media provider API, with output storage and budget controls. ElevenLabs speech, Suno music polling, and HeyGen video polling now have server-side queue adapters; image and broader production workflows remain gated. |

Adding one of these keys does not automatically enable the route. The implementation must stop using local CLI/filesystem calls, use the client provider API, write to tenant-scoped storage, and be added to that client manifest.

## Hosted replacement now available, full parity still gated

- Local and Local Engine routes now use the hosted, queued API model workspace
  in the client edition. They do not expose Ollama, local files, or local
  agent execution; provider access still requires a client-approved API key,
  model allowlist, budget, and manifest capability.
- Open Design, Web Studio, Flow Lab, Agent Studio, OpenMontage, Game Studio,
  Thumbnail Studio, Integrations, Leads, Radar, and Build Guide now have a
  tenant-safe brief/request workspace. Provider generation, publishing, and
  account-connected actions remain separate approved adapters.

## Operator-only until adapted

These currently rely on local infrastructure or personal operator state and therefore show a private dependency boundary in the client edition:

- Paperclip: local service at `localhost:3100` and local company/workspace data.
- The private 3939 Local Engine and local model execution: Ollama and local
  filesystem/agent execution remain operator-only; the client edition uses the
  hosted API replacement described above.
- The private 3939 Free Claude Code chat: local `fcc-server` on `8082` and
  the local Claude CLI remain operator-only. The client edition uses the
  separately approved OpenRouter free-model adapter instead.
- Private Open Design and related local production services: local service at
  `127.0.0.1:7456` or local output paths. The client brief workspace does not
  expose those dependencies.
- Pipeline, Agent Kanban, Loop, and Ruflo: local files, local model/CLI execution, or operator vault state.
- SEO, Integrations, and Build Guide: current implementations expose operator configuration, local data, or source material that has not yet been reduced to a client-safe contract.

To move one of these into a client edition, build a separate adapter using Supabase/Cloud Storage/Cloud Tasks and provider APIs. Do not make the browser call a localhost service and do not copy the operator vault into the image.

## First cloud test configuration

The current `veloce-cloud-test` manifest intentionally enables `tenant-data`,
`orchestration`, `delivery`, and `quality`, and allowlists only `SUPABASE_URL`
and `SUPABASE_ANON_KEY`. This is the correct narrow starting point for testing
identity, tenant records, workflow state, intake, secret handling, route
boundaries, and approval behavior. It is not yet the full hosted version of
the local operator OS.

The next safe expansion is one adapter at a time: add its API contract, tenant-scoped persistence, approval behavior, provider secret reference, acceptance tests, and only then add the capability and route to a client manifest.

## Content and copyright boundary

The Build Guide and any bundled third-party instructions should be reviewed before distributing them to clients. The client image should contain Veloce-authored guidance, links to upstream documentation, and client-owned material only. Do not ship private notes, copied vendor documentation, personal credentials, local paths, or source content that is not licensed for redistribution.
