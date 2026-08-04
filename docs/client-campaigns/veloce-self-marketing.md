# Veloce Self-Marketing Acceptance Campaign

This is the guided operator playbook for using `veloce-cloud-test` as Veloce's first internal customer. It creates campaign context, durable tenant workflows, tenant-owned briefs, and acceptance evidence. It does not publish content, contact prospects, or dispatch an external action automatically.

## Campaign Contract

- Audience: AI and product teams.
- Mode: guided drafts and test delivery.
- CTA: `https://product-experience-five.vercel.app/start`.
- Approved providers for this run: Anthropic, OpenRouter, and Gemini/Antigravity, subject to the client manifest and budget.
- Human approval remains required before external publication, outreach, or consequential delivery.
- The hosted provider prompt does not automatically retrieve all tenant memory. Paste the approved context summary into prompts until retrieval is implemented.

The machine-readable seed is [veloce-self-marketing.campaign.json](/Users/aryamandev/Documents/AgentOS/source/client-blueprints/veloce-self-marketing.campaign.json).

## Run The Seed

First validate the pack locally:

```bash
cd /Users/aryamandev/Documents/AgentOS/source
npm run verify:self-marketing
```

For apply mode, create a protected cookie file from the authenticated client session. It must contain only the two runtime cookies, must not be committed, and must have mode `600`:

```text
veloce_access_token=...; veloce_refresh_token=...
```

Run a dry-run first:

```bash
npm run client:self-marketing -- \
  --url https://veloce-cloud-test-mquo4bf7aq-el.a.run.app \
  --manifest client-blueprints/veloce-self-marketing.campaign.json \
  --out /private/tmp/veloce-self-marketing-evidence.json
```

To create the cookie file without placing the values in shell history, copy the two cookie values from the authenticated browser's Application/Storage cookie view and enter them only at these hidden prompts:

```bash
umask 077
read -r -s 'ACCESS?Paste access cookie value, then press Enter: '; printf '\n'
read -r -s 'REFRESH?Paste refresh cookie value, then press Enter: '; printf '\n'
printf 'veloce_access_token=%s; veloce_refresh_token=%s\n' "$ACCESS" "$REFRESH" > /private/tmp/veloce-runtime-cookie.txt
unset ACCESS REFRESH
chmod 600 /private/tmp/veloce-runtime-cookie.txt
```

Do not paste the cookie values into chat or commit the file.

Apply context and workflows after reviewing the counts:

```bash
npm run client:self-marketing -- \
  --url https://veloce-cloud-test-mquo4bf7aq-el.a.run.app \
  --cookie-file /private/tmp/veloce-runtime-cookie.txt \
  --manifest client-blueprints/veloce-self-marketing.campaign.json \
  --out /private/tmp/veloce-self-marketing-evidence.json \
  --apply
```

Brief requests are write-only from the current API. Add `--include-briefs` only after confirming this campaign has not already been seeded, or accept that it will create a new set of tenant requests:

```bash
npm run client:self-marketing -- \
  --url https://veloce-cloud-test-mquo4bf7aq-el.a.run.app \
  --cookie-file /private/tmp/veloce-runtime-cookie.txt \
  --manifest client-blueprints/veloce-self-marketing.campaign.json \
  --out /private/tmp/veloce-self-marketing-evidence.json \
  --apply --include-briefs
```

The runner reuses records and workflows with matching titles. It never uses the `dispatch` operation. Provider smoke is intentionally opt-in because it can spend budget:

```bash
npm run client:self-marketing -- \
  --url https://veloce-cloud-test-mquo4bf7aq-el.a.run.app \
  --cookie-file /private/tmp/veloce-runtime-cookie.txt \
  --out /private/tmp/veloce-self-marketing-evidence.json \
  --apply --provider-smoke
```

Antigravity is accepted when it returns a structured `reviewed_plan` with `tool` set to `propose_reviewed_plan` and `approvalRequired` set to `true`. It is not expected to return a plain-text smoke phrase.

After the campaign has already seeded tenant records, use the focused route/provider check to avoid creating more writes during the runtime's rate-limit window:

```bash
npm run verify:client-surface-map -- \
  --url https://veloce-cloud-test-mquo4bf7aq-el.a.run.app \
  --cookie-file /private/tmp/veloce-runtime-cookie.txt \
  --provider-smoke --provider-only
```

This checks the authenticated client route matrix and the three approved provider contracts without creating additional records, workflows, or briefs.

Generate the actual internal marketing drafts and save them as tenant notebook records:

```bash
npm run client:self-marketing-assets -- \
  --url https://veloce-cloud-test-mquo4bf7aq-el.a.run.app \
  --cookie-file /private/tmp/veloce-runtime-cookie.txt \
  --apply \
  --out /private/tmp/veloce-self-marketing-assets-evidence.json
```

This uses only the approved Anthropic and OpenRouter models, stays within the owner-cloud budget, and does not publish or contact anyone.

## Guided Portal Walkthrough

Open these surfaces in order and record the visible result in the evidence file:

1. `/capabilities`: mark each capability as proven, gated, or future.
2. `/credentials`: verify provider connection state without exposing credential values.
3. `/guide`: confirm the client operating instructions and approval boundary.
4. `/context`: paste the approved positioning and campaign summary into each provider prompt when needed.
5. `/memory`: confirm the ten campaign records, Markdown import/export, and tag-based knowledge map.
6. `/orchestrate`: confirm the main campaign workflow reaches `completed`.
7. `/paperclip`, `/room`, `/pipeline`, `/agent-kanban`, `/kanban`, `/loop`, `/ruflo`: confirm each durable workflow or record the intentional shell/gate status.
8. `/create`, `/opendesign`, `/web-studio`, `/flow-lab`, `/studio`, `/openmontage`, `/games`, `/thumbnails`: confirm the tenant-owned brief receipt. Media execution stays gated.
9. `/capabilities`, `/credentials`, `/integrations`, `/seo`, `/seo-guide`, `/guide`: review policy before delivery.
10. `/deliver`: perform only an approved test webhook delivery.
11. `/leads`: test the workflow record path. Live prospect discovery is gated without the required provider adapter.
12. `/radar`: record visibility status. Live scanning and publishing remain gated unless explicitly enabled.

## Provider Tests

Use the exact contract for each surface:

| Surface | Prompt | Classification |
| --- | --- | --- |
| `/claude` | `Reply exactly: Claude owner-cloud smoke passed.` | Plain-text pass or provider failure |
| `/antigravity` | `Create a bounded reviewed plan for launching Veloce to AI product teams.` | Structured reviewed plan with approval required |
| `/local` | `Reply exactly: OpenRouter owner-cloud smoke passed.` | Queued OpenRouter response |
| `/engine` | Same OpenRouter smoke | Queued OpenRouter response |
| `/openclaw`, `/hermes`, `/freeclaude`, `/fusion` | Open the surface | Clear provider/model gate unless allowlisted |
| `/codex` | Open the surface | Intentional OpenAI billing/key gate |
| `/kimi`, `/glm`, `/glm-code`, `/grok`, `/sakana` | Open the surface | Intentional provider-key gate |

Classify every result as `passed`, `intentionally gated`, `failed`, or `needs adapter work`. A gate is not a failure when the manifest intentionally excludes that provider.

## Campaign Asset Brief

Generate drafts with the approved context summary included. Every asset must state its audience, specific problem, Veloce mechanism, proof or limitation, CTA, and review status.

Required outputs:

- LinkedIn launch post.
- One-minute reel script and three short-form hooks.
- Product explainer outline.
- AI/product-team landing-page copy.
- Lead magnet titled “The Governed AI Operating Loop”.
- Five SEO article briefs.
- FAQ and objection-handling sheet.
- Eight-slide pitch deck outline: problem, fragmented toolchain, governed loop, tenant memory, provider boundary, workflow and approval evidence, delivery and lead capture, next step.

Recommended CTA:

> Want to see how a governed AI operating loop could work for your team? Start here: `product-experience-five.vercel.app/start`

Do not claim full local/cloud parity. Be explicit that Ollama execution, Obsidian filesystem access, full Graphify semantic extraction, local Paperclip services, automatic social publishing, live prospect discovery, fully automated SEO deployment, and Codex/OpenAI without separate API billing remain future or gated tracks.

## Public Lead Acceptance

Use one clearly labeled synthetic lead through each public form:

- `https://veloce-agenticos-site-mquo4bf7aq-ew.a.run.app/`
- `https://product-experience-five.vercel.app/start`

For each submission, verify a row in Supabase `signups`, distinguishable source/entry point, configured Gmail notification, and all submitted fields. Confirm that no runtime credential is in the public form or notification. Delete both synthetic rows afterward using the existing controlled cleanup process. Do not put service-role keys in this document or in the evidence file.

## Test Delivery And Evidence

Use `/deliver` for a test webhook only. Record destination approval, response status, delivery identifier, and whether the action can be reversed. Do not publish to LinkedIn, Meta, Threads, or any other social channel from the runtime during this acceptance campaign.

The evidence JSON should contain:

- Provider smoke classifications.
- Capability and credential status.
- Tenant record counts.
- Workflow IDs and terminal statuses.
- Brief/request surfaces and artifact names.
- Test delivery result.
- Public form row and Gmail confirmation.
- Intentional gates and reasons.
- Cloud Run revision and manifest version.

## Replication Package

For a new client, copy the campaign pack and combine it with:

- Approved client manifest.
- Provider and key checklist.
- Capability decisions.
- Budget and model allowlists.
- Tenant data and retention policy.
- Workflow templates and test prompts.
- Evidence checklist.
- External delivery approval record.
- Known gated capabilities.

Each client receives the same code and image but a separate tenant, secrets, queue, bucket, service account, manifest, budget, and acceptance record. The campaign runner is an operator aid; it does not remove the manual key, budget, approval, or external-publication boundaries.
