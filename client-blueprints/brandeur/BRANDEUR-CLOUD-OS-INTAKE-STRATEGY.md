# Brandeur Cloud OS: Client Intake And Delivery Strategy

**Status:** Discovery blueprint. It is not a deployment approval, production configuration, or credential store.

**Product name:** Brandeur Delivery OS, powered by Veloce AgenticOS.

**Purpose:** Give Brandeur a dedicated cloud operating system for its strategy-led branding work. It should make the agency's method more consistent, visible, and reusable without replacing senior strategy or creative judgment.

## 1. Why This Fits Brandeur

Brandeur already delivers integrated strategy, identity, communication, website, and ongoing marketing work. Its B2B Brand Elevate Programme is a structured three-month engagement moving from clarity, through identity and website, to market readiness. Veloce should become the private delivery layer under that method: it captures evidence, routes work, records approvals, and creates reusable delivery artefacts.

Public reference only:

- [Brandeur services and positioning](https://brandeur.in/)
- [B2B Brand Elevate Programme](https://brandeur.in/b2b-branding-transformation/)

### Business outcome

Create a Brandeur-specific system that reduces context loss and approval delay while increasing consistency across strategy, design, website, communication, and client handoff.

### What This Is Not

- Not a generic AI chatbot or unrestricted agent playground.
- Not a replacement for Brandeur's consultants, designers, or client reviews.
- Not a hosted copy of the local Veloce shell, Mac files, personal accounts, or provider subscriptions.
- Not autonomous outreach, publishing, spending, or client-facing AI output without a human approval step.

## 2. Brandeur Edition Manifest

| Veloce lens | Brandeur workflow | Primary users | Required approval | Client-ready outcome |
| --- | --- | --- | --- | --- |
| Command | Active transformations, ownership, next decision, and risk | Founder, account lead, strategist | Account lead | Weekly project view and decision agenda |
| Context | Intake, discovery, research, legacy assets, and positioning evidence | Strategist, researcher | Strategy lead | Grounded brand brief and research pack |
| Orchestrate | Strategy-to-identity-to-website-to-marketing workflow | Account lead, team leads | Named stage owner | Visible plan and approval record |
| Create | Narrative, content direction, website, collateral, and case-study production | Designer, writer, web lead | Creative lead and client | Approved production brief and files |
| Govern | Scope, version, budget, data access, model routing, and audit events | Founder, Veloce operator | Founder or delegate | Controlled work with responsibility |
| Deliver | Brand kit, website handoff, content roadmap, reporting, and retainer playbook | Account lead, client approver | Client approver | Exportable delivery system |

## 3. First Release Scope

Build a focused Brandeur v0 around the existing B2B transformation programme. Do not activate every local Veloce module on day one.

### Enabled modules

1. **Transformation Command**
   - Portfolio of active B2B engagements.
   - Project health, stage, owner, blocked decision, next client review, and agreed timeline.
   - Internal notes separate from client-visible decisions.

2. **Brand Context Vault**
   - Secure intake for leadership questionnaires, research, workshop outputs, legacy assets, website audit, competitor evidence, and approved messaging.
   - Search by title, client, service, subject, or semantic meaning.
   - Every generated brief links to its approved sources.

3. **Brand Elevate Workflow**
   - Month 1: audit, category research, positioning, narrative, and tone of voice.
   - Month 2: identity, guidelines, digital kit, website structure, UI/UX, and content handoff.
   - Month 3: market messaging, LinkedIn/content roadmap, lead journey, and reporting template.
   - Stage gates: internal review -> client review -> approved -> delivered.

4. **Creative And Website Studio**
   - Conversion and website briefs from approved strategy.
   - Page structure, content hierarchy, visual direction, motion direction, and engineering handoff.
   - Reference study only with a permission declaration; output is an original brief, never a clone.

5. **Approval And Delivery Centre**
   - Versioned deliverables, decision log, review requests, due dates, and exportable handoff packs.
   - Initial client view is read-only with explicit approval controls. No raw agent terminals, credentials, vault browsing, or admin panels.

### Explicit v0 exclusions

- Local CLI, shell, filesystem, personal Mac applications, and live terminal controls.
- Personal Claude, Codex, Gemini, Kimi, Grok, or OpenRouter subscriptions.
- Autonomous email, social posting, paid-media changes, outreach, or publishing.
- Unreviewed third-party MCP servers, skills, browser automation, or arbitrary code execution.
- Cross-client search, shared document access, or shared provider credentials.

## 4. User Roles

| Role | Access | Cannot do |
| --- | --- | --- |
| Brandeur owner | Portfolio, budgets, approvals, user access, client configuration | View secret values or bypass audit logs |
| Account lead | Project plan, client communication, delivery status, review requests | Change model budgets or access another client project |
| Strategist | Context vault, research, strategy artefacts, workflow tasks | Publish externally or alter identity controls |
| Creative lead | Approved briefs, design/content workflow, review requests | Access unrelated private strategy notes by default |
| Web lead | Website brief, approved assets, development handoff | Access provider administration or unrestricted tools |
| Client approver | Their approved project workspace, delivery review, decisions | Browse internal notes, other clients, agents, or credentials |
| Veloce operator | Time-bound support and release operations | Read client content unless support access is approved and logged |

## 5. Cloud Architecture

Deploy Brandeur as an isolated single-tenant cloud edition, not a fork of the local application.

    Brandeur users and client approvers
                  |
           authenticated portal
                  |
       Cloud Run portal and API
          |              |
       data store    audit events
          |              |
    private worker  monitored logs
          |
    Secret Manager -> Brandeur-owned provider APIs

### Required boundaries

- A Brandeur-only cloud project or equally strong isolation boundary.
- Application authentication, role-based access, session expiry, and MFA policy decided during provisioning.
- Project checks on every data request.
- Private worker queues for long-running research or generation jobs.
- Signed file links with expiry for review and download.
- Structured audit events that avoid raw prompt, document, key, or provider response logging by default.
- Staging and production environments with separate secrets and domains.

## 6. Credentials And Cost Policy

Brandeur should use its own production provider accounts and keys wherever possible. Veloce configures them; Brandeur retains ownership and revocation control.

| Capability | Recommended credential model | v0 decision |
| --- | --- | --- |
| Text model routing | Brandeur-owned API project and model allowlist | Required for cloud AI features |
| Google/Gemini | Brandeur-owned API project or approved OAuth | Optional after use-case review |
| ElevenLabs | Brandeur-owned restricted API key | Optional, only for approved voice work |
| Analytics/Search Console | OAuth with scoped project access | Optional for website reporting |
| Email/social/publishing | OAuth and approval flow per platform | Excluded from v0 |

For every enabled provider, record in Secret Manager only:

- Secret reference and rotation date
- Client business owner
- Permitted models/endpoints
- Monthly cap and warning threshold
- Overage approval rule
- Data-processing terms and permitted data types

Never place secret values in this document, GitHub, screenshots, browser code, or chat history.

## 7. Intake Required Before Build

### Business and delivery

- Brandeur service catalogue, delivery method, templates, and review rules.
- One pilot B2B client engagement selected with written permission.
- Current onboarding form, proposal, scope document, and three representative approved deliverables.
- Definition of a ready-for-client-review and ready-to-deliver state.
- Baseline timings for discovery-to-brief, feedback turnaround, revision count, website handoff time, and reporting time.

### Brand and UI

- Brandeur logo, font licences, colour system, imagery rights, and voice guide.
- Approved client portal name and domain.
- Required desktop/mobile views and accessibility expectations.
- Which parts should carry Brandeur branding versus Veloce attribution.

### Technical and legal

- Cloud billing owner and GCP organisation/project decision.
- Approved GCP region, backup/retention policy, and data processing terms.
- Named identity provider and user provisioning process.
- Provider accounts, budget owner, and security approver.
- Support access policy, incident contact, and offboarding/export owner.

## 8. Delivery Phases

### Phase 0: Contract And Boundary

- Sign scope, confidentiality, data-handling, support access, and spend-overage rules.
- Select pilot engagement and success baseline.
- Freeze v0 capability allowlist and exclusions.

### Phase 1: Discovery And Product Design

- Map Brandeur's delivery workflow and decision points.
- Create the Client Edition Manifest.
- Adapt Veloce's six-lens UI to Brandeur branding and service language.
- Define the client-review experience and staff roles.

### Phase 2: Foundation

- Provision identity, data storage, secrets, queue, logging, staging, and production boundaries.
- Implement context vault, project model, role controls, and audit log.
- Run threat model and test isolation.

### Phase 3: B2B Transformation Workflows

- Configure the three-month Brand Elevate workflow.
- Implement strategy brief, creative/website handoff, approval, and delivery patterns.
- Configure only approved provider APIs, budget guardrails, and fallbacks.

### Phase 4: Pilot And Handoff

- Run one real project through the system with human review at every external step.
- Measure baseline improvements and collect team feedback.
- Fix workflow friction, train Brandeur operators, and prepare a 30-day optimisation plan.

## 9. Acceptance Criteria

Do not call Brandeur Cloud OS live until all are evidenced:

- Every user is authenticated and receives only permitted project data.
- Client approvers cannot read internal notes, other client data, or provider administration.
- No browser response, source map, log, image, or GitHub artifact reveals a credential, Mac path, local vault path, or personal subscription token.
- Provider calls use Brandeur-owned scoped credentials and enforce budget caps.
- Every external-ready item has a named reviewer and immutable approval event.
- Background jobs are queued, retry safely, and do not depend on an open browser.
- The first workflow can create, review, approve, export, and archive a complete B2B transformation deliverable set.
- Desktop, mobile, keyboard, reduced-motion, error, backup, export, deletion, and rollback tests pass.

## 10. Success Measures

Track these against the pilot baseline rather than promising invented gains:

- Time from onboarding to approved strategy brief
- Time from approved strategy to website/creative handoff
- Review and approval turnaround time
- Number and cause of revision rounds
- Percentage of deliverables with source-backed rationale
- Reuse of templates, messages, and prior learnings
- Team visibility into blocked decisions and delivery status
- Monthly model/provider spend per Brandeur project

## 11. Decisions Still Required

- Confirm Brandeur as a paid founding pilot and name the sponsor.
- Decide whether the first edition is internal-only or includes client approver accounts during the pilot.
- Select GCP billing project, region, domain, and identity provider.
- Select the initial model provider and monthly cloud/model budget.
- Approve data retention, support access, backup, and client offboarding terms.
- Choose the first real B2B project and obtain written permission.
