# Veloce AgenticOS Operator Acceptance Walkthrough

Use this checklist before recording, publishing, or deploying Veloce AgenticOS. It is designed to teach the product while testing it.

## Result Labels

- `PASS`: The action completed and produced the expected result.
- `LOCAL PASS`: The action worked using a local model, local file, or local service.
- `GATED`: The page loaded correctly but needs an intentionally optional key, login, or service.
- `FAIL`: A configured feature produced an application error, hung indefinitely, or returned no usable result.

Do not classify a clearly labelled provider gate as a failure.

## Before You Begin

1. Open `http://127.0.0.1:3737`.
2. Keep Terminal available, but never paste API keys into screenshots or test notes.
3. Use a disposable project name such as `Veloce Operator Test`.
4. Avoid paid media generation during the first pass. Confirm its provider gate and preview states first.
5. Record the result and any exact error beside each item.

## Phase 1: Mission Control And Navigation

### Mission Control

1. Open `/`.
2. Confirm the immersive scene renders, or that a deliberate static fallback appears.
3. Scroll through all six operating lenses: Command, Context, Orchestrate, Create, Govern, Deliver.
4. Open one destination from each lens and return to Mission Control.
5. Open the command palette and navigate to `Memory`.

Expected: no blank page, browser crash, overlapping navigation, or dead route.

### Mobile Navigation

1. Resize the browser to a narrow phone-sized window.
2. Confirm the bottom navigation is usable.
3. Open Mission Control, Memory, Pipeline, Flow Lab, Integrations, and Agent Kanban.

Expected: no horizontal overflow and no hidden primary controls.

## Phase 2: Context And Memory

### Memory

1. Open `/memory`.
2. Confirm the configured vault is `/Users/aryamandev/Documents/llm-wiki`.
3. Create a note titled `Veloce Operator Test` with a harmless sentence.
4. Search for the note.
5. Open the Graphify view and confirm it either loads the graph or clearly explains its current setup state.

Expected: the note persists after refresh and is searchable.

### Goals

1. Open `/goals`.
2. Add `Complete Veloce operator acceptance run`.
3. Mark it complete, refresh, and confirm the state persists.

### Journal

1. Open `/journal`.
2. Add `Operator acceptance run started successfully.`
3. Refresh and confirm the entry remains in today's note.

### Notebook

1. Open `/notebook`.
2. Confirm the page loads without an application error.
3. If Google NotebookLM is authenticated, open a notebook and run a short query.
4. Otherwise record `GATED: Google login required`.

## Phase 3: Agents

Use this inexpensive prompt for chat-based agents:

> Reply with `VELOCE TEST OK`, then give one sentence describing your role in this operating system. Do not use tools or browse the web.

Test these pages in order:

1. `/claude`
2. `/codex`
3. `/openclaw`
4. `/hermes`
5. `/antigravity`
6. `/kimi`
7. `/freeclaude`
8. `/local`
9. `/engine`

Expected: configured agents return a visible response, streaming completes, controls recover from their busy state, and refreshing does not crash the page.

Record optional or intentionally skipped providers as gated:

- `/glm`
- `/glm-code`
- `/grok`

### Multi-model Surfaces

For `/fusion`, `/sakana`, and `/room`, use:

> Should a five-person agency automate client publishing without human approval? Give a short recommendation and one risk.

Expected: available participants respond, the synthesis/verdict appears, and unavailable providers are identified rather than causing a blank result.

## Phase 4: Orchestration

### Pipeline

1. Open `/pipeline`.
2. Submit: `Create a one-page internal checklist for reviewing a client landing page.`
3. Confirm classification and planning complete.
4. Inspect the proposed work before approving anything.
5. Approve the harmless test and confirm a result or saved artifact appears.

### Agent Kanban

1. Open `/agent-kanban`.
2. Create: `Build a static HTML page that displays Veloce Operator Test.`
3. Confirm cards move through planning, building, and review.
4. Open the preview and verify the requested text appears.

### Paperclip

1. Open `/paperclip`.
2. Confirm the local service connects.
3. Open the configured company/workspace/project.
4. Create a disposable test issue and verify it appears after refresh.

If no company/project has been configured, record `GATED: Paperclip workspace setup`, not `PASS`.

### Loop

1. Open `/loop`.
2. Define a small task with a measurable gate: `Write three bullet points; pass only when there are exactly three.`
3. Confirm the builder runs, verification occurs, and the loop terminates when the gate passes.

### Ruflo And Kanban

1. Open `/ruflo` and confirm its scoped workflow brief and approval boundary are visible.
2. Run only a harmless local workflow if the runtime reports ready.
3. Open `/kanban` and confirm the Hermes board connects or reports its authentication gate clearly.

## Phase 5: Creation

### Flow Lab

1. Open `/flow-lab`.
2. Use project name `Veloce Operator Test`.
3. Use `https://example.com/reference` as the reference label.
4. Select `Immersive operational` and `Frame sequence`.
5. Set the frame count to `72`.
6. Confirm ownership/permission and create the original brief.

Expected: an owned frame-sequence contract appears and no source assets are copied.

### Web Studio

1. Open `/web-studio`.
2. Create a small internal agency website brief using the Flow Lab output.
3. Confirm the generated structure contains audience, offer, storyline, conversion path, motion direction, and implementation handoff.
4. Save it and confirm the project files exist after refresh.

### Open Design

1. Open `/opendesign`.
2. Confirm the embedded/local service opens.
3. Open the saved Veloce test project.
4. Confirm persistence by leaving the page and returning.

### Media Studios

Open `/video`, `/studio`, `/openmontage`, `/music`, `/games`, and `/thumbnails`.

For each page:

1. Confirm it loads and accurately reports provider readiness.
2. Create only a script, plan, prompt, or local preview during the first pass.
3. Do not trigger paid generation unless you explicitly want to spend provider credits.

Record missing HeyGen, Suno, OpenAI image, or other optional keys as `GATED`.

For ElevenLabs voice, use this short paid test only when ready:

> Veloce AgenticOS operator test complete.

Expected: a playable audio result and no exposed key.

## Phase 6: Governance And Delivery

### Integrations

1. Open `/integrations`.
2. Expand each integration.
3. Confirm configured services report ready and optional services explain exactly what is missing.
4. Never paste credentials while screen recording.

### Capabilities

1. Open `/capabilities`.
2. Confirm skills and connectors show their scope and client-readiness boundary.
3. Verify `Veloce Web Studio`, `Hermes MCP Catalog`, and `Scroll Asset Sequencing` are present.

### SEO, Leads, And Radar

1. Open `/seo` and create a draft-only content plan.
2. Open `/leads` and inspect the ICP and approval workflow without launching outreach.
3. Open `/radar` and confirm it either returns a configured research result or shows the exact provider gate.

No external publishing, enrichment, or outreach should occur without explicit approval.

## Final Acceptance

Before marking the OS ready for a public recording, confirm:

- Every sidebar route opens without a blank page or client crash.
- Core memory writes persist after refresh.
- At least one subscribed/cloud agent and one local agent return a real response.
- Pipeline or Agent Kanban completes one harmless build.
- Flow Lab and Web Studio produce and save one original brief.
- Human approval is required before external publishing or outreach.
- Optional paid modules are clearly labelled `GATED` when credentials are absent.
- No API key, OAuth token, local private path, personal message, or client data appears in the recording.
- The recording uses disposable sample data.

## Recording Story

Once the checklist passes, record this concise product journey:

1. Mission Control: show the six operating lenses.
2. Command: ask one agent a real business question.
3. Context: retrieve the answer from persistent memory.
4. Orchestrate: turn an idea into an approved Pipeline or Kanban task.
5. Create: generate a Flow Lab brief and hand it to Web Studio.
6. Govern: show provider boundaries and human approval.
7. Deliver: show the completed artifact and status summary.

This demonstrates an operating system, not a collection of disconnected AI tabs.
