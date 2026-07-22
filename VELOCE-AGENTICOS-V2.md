# Veloce AgenticOS v2

## Product Boundary

Veloce AgenticOS is a managed operating-system service. The local dashboard is the private execution layer; the public website is a separate conversion layer. The public build must never expose local files, provider credentials, agent controls, raw vault content, shell routes, or execution APIs.

## What v2 Adds

- A scroll-led public service story with six chapters: Signal, Memory, Workflows, Human Approval, Measured Delivery, and Engage.
- Flow Lab, a local-only reference-analysis workspace that produces original website and video build briefs from permitted sources.
- A Veloce vault area for approved Flow Lab briefs.
- A controlled UI policy: generated outputs configure approved components and briefs, never arbitrary executable UI.

## Current System Of Record

Obsidian plus Graphify remain the durable knowledge system. Hermes, Paperclip, and Ruflo remain the operational tooling. Do not add a second memory or orchestration runtime unless a measured client workflow proves a gap that the existing stack cannot cover.

## Approved Capability Policy

- Review-first: Ponytail may be used only project-scoped and without global hooks until its exact install plan is reviewed.
- Curated skills only: import a small reviewed registry for frontend design, conversion writing, security, browser testing, GCP deployment, and evaluation. Never bulk-load unreviewed skill collections.
- Evaluation: add Giskard scenarios for grounding, prompt injection, source attribution, no-secret leakage, and approval gates before a client-facing agent workflow is released.
- Google agents-cli is a deployment/evaluation helper for the separately hosted public app, not a replacement runtime for the local dashboard.
- CL4R1T4S and leaked/extracted system prompts are prohibited from runtime prompts, skills, and client workflows.

## Explicit Deferrals

Cognee, VoltAgent, DeerFlow, DeepAgents, ChatDev, InsForge, Plano, Weft, Zerolang, OpenMythos, and other full memory/orchestration runtimes are not part of v2. They duplicate existing layers or add an immature/operationally expensive platform boundary.

## Verification Note

The standalone public site must pass its production build, artifact privacy scan,
desktop/mobile browser smoke test, and production dependency audit before GCP
deployment. The private dashboard must separately pass its live API and sidebar
smoke tests before a release is pushed. If the local Next server does not bind to
`127.0.0.1:3737`, treat that as a release blocker rather than deploying or
claiming end-to-end readiness.

## Flow Lab Source Policy

Use Flow Lab only for owned, authorized, or public-reference analysis. Public references may inform high-level pacing, narrative, interaction rhythm, and conversion principles. Never copy their branding, assets, copy, source code, distinctive layout, client data, or proprietary content. Every external action still requires human approval.
