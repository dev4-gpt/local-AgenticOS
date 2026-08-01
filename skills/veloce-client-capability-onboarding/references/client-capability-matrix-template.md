# Client Capability Matrix

## Client

| Field | Value |
| --- | --- |
| Client name |  |
| Tenant slug |  |
| Owner email |  |
| Approval owner |  |
| Prepared date |  |
| Runtime service |  |
| Client manifest |  |

## First Release Scope

| Workflow | Intended user | Data handled | Provider/API | Budget | Approval rule | Status |
| --- | --- | --- | --- | --- | --- | --- |
|  |  |  |  |  |  | pending external input |

## Capability Matrix

Use one status only: `proven`, `adapter required`, `operator-only`, `pending external input`, or `blocked`.

| Surface or workflow | Client outcome | Cloud replacement | Credential or dependency | Status | Evidence / next action |
| --- | --- | --- | --- | --- | --- |
| Client login and tenant data |  | Supabase Auth and tenant-scoped records | Approved member |  |  |
| Context and intake |  | Tenant records and artifacts | Supabase / Cloud Storage |  |  |
| Workflow and approvals |  | Queued worker and audit trail | Queue, worker token, approval owner |  |  |
| Claude |  | Anthropic API adapter | `ANTHROPIC_API_KEY`, model, pricing |  |  |
| Codex |  | OpenAI API code-plan adapter | `OPENAI_API_KEY`, model, pricing |  |  |
| OpenClaw / Hermes / Free Claude / Fusion |  | Reviewed OpenRouter adapter | `OPENROUTER_API_KEY`, model, pricing |  |  |
| Sakana Fugu |  | Sakana OpenAI-compatible adapter | `SAKANA_API_KEY`, model, pricing |  |  |
| Gemini / Antigravity |  | Gemini API adapter | `GEMINI_API_KEY`, model, pricing |  |  |
| Kimi |  | Moonshot API adapter | `MOONSHOT_API_KEY`, model, pricing |  |  |
| GLM / GLM Code |  | Z.ai API adapter | `GLM_API_KEY`, model, pricing |  |  |
| Grok |  | xAI API adapter | `XAI_API_KEY`, model, pricing |  |  |
| Local / Local Engine |  | Hosted model adapter only; no Mac Ollama | Reviewed provider API |  |  |
| Memory and local vault |  | Tenant records/object storage | Cloud data design |  |  |
| Media / speech / video / music |  | Provider-specific queued adapters | Provider API, storage, budget |  |  |
| Research / SEO |  | Read-only approved fetch adapter | Provider API, domain allowlist |  |  |
| External delivery |  | Approval-only delivery worker | Allowed destination, approval owner |  |  |

## Credential Inventory

Record references and status only. Never put a secret value in this file.

| Provider | Ownership model | Secret Manager reference | Approved model(s) | Connected | Billing / cap confirmed |
| --- | --- | --- | --- | --- | --- |
|  | client-owned / managed / OAuth |  |  | no | no |

## Evidence Log

| Date | Capability | Test path | Result | Budget/audit outcome | Rollback decision |
| --- | --- | --- | --- | --- | --- |
|  |  | authenticated UI -> worker -> provider -> result |  |  |  |

## Explicit Exclusions And Open Items

| Item | Status | Owner | Condition to continue |
| --- | --- | --- | --- |
|  |  |  |  |
