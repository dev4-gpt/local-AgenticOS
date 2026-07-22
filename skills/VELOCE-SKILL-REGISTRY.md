# Veloce AgenticOS Skill Registry

Only the following capabilities may be added after source review, license review, and a project-scoped smoke test. A skill is an internal instruction pack, not a permission to give a client unrestricted tool access.

| Capability | Intended use | Boundary |
|---|---|---|
| Frontend design | Original public-service experiences and responsive UI review | Project scope only; preserve accessibility and reduced motion. |
| Conversion writing | Qualified service messaging, case-study framing, and CTA review | Human approves all public copy. |
| Security review | Secrets, auth boundaries, route safety, and dependency review | Read-only audit before any changes. |
| Security release review | Scope, findings, remediation, and retest evidence | Operator-only; PentAGI and HexStrike remain isolated and manually supervised. |
| Browser testing | Desktop/mobile visual and interaction regression checks | Test only Veloce-owned or authorized environments. |
| GCP deployment | Public-site build, Cloud Run staging, headers, and health check | Never deploy the local dashboard. |
| Agent evaluation | Grounding, injection resistance, source attribution, approval gates | Fixtures contain no private client information. |
| Edition experience | Original scroll-led stories, Three.js dot networks, UI motion, and fallbacks | Keep canvas non-essential; preserve keyboard and reduced-motion paths. |
| Immersive scroll site | Provider-neutral architecture and templates for original service stories | Use only for an approved immersive brief; never copy external references or expose client data. |
| Asset sequencing | Owned SVG, video, and frame-sequence asset planning plus a reusable React canvas implementation | Never ingest unlicensed frames or make large frame sets the default. |

## Reviewed Tool Choices

| Tool / source | Status | Use in Veloce |
|---|---|---|
| Motion / Framer Motion | Active dependency | UI state, layout, reveal, gestures, and route-level transitions. |
| Three.js | Active dependency | Original procedural depth scenes and dot-to-dot networks. |
| GreenSock GSAP skills | Approved reference, not globally installed | Use only when a project needs a long, scrubbed timeline that Motion cannot express clearly. |
| 21st.dev | Review-only component reference | Inspect individual components; reproduce the pattern in Veloce code rather than importing a visual grab bag. |
| 21st Magic MCP | Not installed | Requires an API key and developer-IDE configuration. It is not a default client capability or a runtime dependency. |
| UI/UX Pro Max | Not installed; optional project-scoped research | Its guidance is represented by the Veloce profile pack. Install only after a reviewed project need, never as a global hook. |
| Aceternity, Magic UI, Kokonut | Review-only component references | Inspect one component at a time; use the smallest reviewed implementation that supports the brief. |
| Veloce Design Intelligence | Active built-in profile pack | Web Studio and Flow Lab carry selected composition, motion, accessibility, and conversion constraints into saved briefs. |
| Owned Site Recovery templates | Active operator-only workflow | Produces a modernization, authorized rebuild, or component-extraction plan from client-provided source material. No live-site scraping or unrestricted cloning. |
| AI Website Cloner Template / GoClone | Not integrated | Their reverse-engineering and download-oriented workflows are unsuitable for the client product boundary. Use only their high-level migration checklists as optional operator research. |
| Remotion | Deferred to video production | Use only for exported owned motion assets, never as a runtime dependency for the public site. |
| SVGator | Optional design-tool export path | Accept only original SVG exports with a static fallback. |

## Veloce-Owned Skill Packs

- `veloce-edition-experience`: chapter pacing, scene selection, original asset rules, accessibility, and performance checks.
- `veloce-asset-sequencing`: selection criteria for procedural scenes, SVGs, owned videos, and frame sequences, with a reusable selective-preload React canvas component.
- `veloce-design-intelligence`: three reviewable design profiles for conversion editorial, immersive operational storytelling, and high-trust product clarity.
- `veloce-immersive-scroll-site`: one shared lazy-loaded scene, semantic operating artifacts, original procedural geometry, and no-WebGL/reduced-motion verification. Available to any provider through Web Studio and Flow Lab handoffs; Claude Code also has a compatible global shortcut.
- `veloce-security-release-review`: operator-only release review pack that records authorization, automated checks, findings, remediation, and retest evidence. It references PentAGI and HexStrike AI without exposing either tool as a product connector.
- `document-skills`, `mcp-builder`, `webapp-testing`, `frontend-design`, and `skill-creator`: internal capability families to be enabled only after their source and behavior are reviewed.

## Explicitly Prohibited

- Global hook installers without a reviewed dry-run.
- Bulk skill catalogs or automatic skill activation.
- Leaked, extracted, or adversarial system-prompt collections.
- Skills that request provider keys in repository files.
- Skills that can run external publishing or outreach without an approval step.
