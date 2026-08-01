# Viktor: Future AI Employee Capability

**Status:** Future capability / external pilot candidate  
**Last reviewed:** 2026-07-31  
**Decision:** Pilot externally for one narrow internal workflow; do not make
Viktor a required Veloce runtime or the default execution plane for client data.

## Original post

- [Aryan Mahajan's LinkedIn post](https://www.linkedin.com/posts/aryanxmahajan_aiemployee-aiinfrastructure-share-7483941939264999424-ML2M/?utm_source=share&utm_medium=member_ios&rcm=ACoAADHr_pcBiERSSKG8SPzBeWf3H5Kr8Xyhll8)

The post describes an AI employee that lives where a team already works,
collects updates across tools, identifies stalled work, reconciles business
data, drafts follow-ups, and stops for human approval before consequential
actions.

## What Viktor is

Viktor presents itself as an AI coworker that lives in Slack and Microsoft
Teams. Its official documentation says it connects to business tools such as
HubSpot, Salesforce, PostHog, Google Analytics, Google Ads, Meta Ads, GitHub,
Linear, Notion, Google Calendar, and Slack. It supports scheduled tasks and
proactive automations.

Official references:

- [Viktor homepage](https://viktor.com/)
- [Getting started](https://viktor.com/docs/getting-started)
- [Integrations](https://viktor.com/integrations)
- [Security](https://viktor.com/security)
- [Slack Marketplace listing](https://slack.com/marketplace/A0A2VN5TR5K-viktor)

Viktor is an external SaaS execution product, not an open-source library that
we can simply install inside Veloce.

## Why it matters to Veloce

This validates a Veloce product direction: the main problem is not another chat
box; it is coordinating work across the places where work already happens.

```text
Collect signals → detect stalled work → prepare a proposal
       → human approval → execute an allowed action
       → write the result into durable memory and workflow state
```

This fits Veloce's existing principles:

- Veloce is the control surface for agents, memory, goals, workflows,
  integrations, and delivery review.
- Veloce already has Gmail read/draft/send paths and workflow/pipeline surfaces.
- The hosted runtime roadmap requires tenant scope, secret references, budgets,
  queues, approvals, audit, retention, and rollback evidence.
- Obsidian and Graphify remain the durable knowledge system.

## Use Viktor or build it ourselves?

### Pilot Viktor externally

Use Viktor to test whether a team will delegate a complete cross-tool job from
Slack or Teams. A good first pilot is:

> Every Monday, read approved project channels and records, identify missing
> updates and stalled items, produce a delivery report, and draft—but do not
> send—the follow-ups.

Do not begin with payments, ad-budget changes, production deployments, bulk
outreach, customer replies, or code merges.

### Build the Veloce capability later

If the pilot produces real value, build a focused Veloce version rather than
copying Viktor's claimed 3,200+ connectors. Start with the user's actual stack:
Drive/Gmail/Calendar, then Slack or Teams, then CRM and finance sources, and
WhatsApp only for a real customer-communication use case.

Veloce should own the workflow graph, evidence, approval history, tenant policy,
budget ledger, durable memory writeback, connector enablement, audit, export,
deletion, and recovery. A connector should own only its narrow provider action.

## Security and data boundary

Viktor advertises OAuth, encryption, SOC 2 Type 1, approval gates, per-tool
permissions, and no model training. Its Slack Marketplace listing says it is a
cloud-hosted, multi-tenant service with US data hosting by default. The listing
also says it retains connection credentials, workspace settings, files,
conversations, outputs, scheduled tasks, approval decisions, and service logs;
Slack message content and channel history are described as transiently
processed.

These are vendor claims. Before connecting client or confidential data, review
the current DPA, subprocessor list, SOC report, retention terms, incident
process, and deletion evidence.

Veloce's minimum policy for any workplace connector:

- OAuth or provider-managed secret storage; never paste credentials into chat.
- Per-user, per-workspace, and per-tenant connection ownership.
- Read-only scopes by default; add write scopes one capability at a time.
- No cross-client or cross-workspace memory retrieval.
- External messages and documents treated as data, never as instructions.
- Human approval before sending, deleting, publishing, spending, changing
  records, changing ads, merging code, or contacting customers.
- Proposals record sources, assumptions, intended side effects, cost, and an
  idempotency key before execution.
- Disconnect, export, deletion, and scheduled-job revocation are tested.

## Cost reality

Viktor currently advertises up to $100 in credits and paid plans starting at
$50/month. That product price is separate from provider, workspace, storage,
messaging, and model costs.

The integrations are not universally free:

- Slack has a free workspace plan, but free history, app-count, plan, and API
  limits apply.
- Teams has evaluation modes, but some Graph/Teams message-history and
  meeting-content APIs are metered or license-dependent.
- Drive's standard API usage is currently no additional cost, but quotas,
  storage limits, and a planned 2026 billing threshold apply.
- WhatsApp Business Platform charges per delivered message according to market
  and category. Some service and utility-reply messages are currently listed
  as free, but business-initiated messages are not universally free.
- Veloce still incurs hosting, queue, storage, model, email, OCR, search, and
  connector costs when it runs the workflow.

Product rule: **free to connect where the provider permits it; never promise
free to run.**

## Pilot acceptance criteria

Approve a pilot only if:

1. The workflow has a named owner and measurable baseline.
2. Synthetic or low-sensitivity data is used first.
3. Access is limited to two or three approved channels and tools.
4. Connected tools are read-only except for draft creation.
5. Every proposed action is reviewable before execution.
6. False positives, missed stalls, latency, spend, and hours saved are recorded.
7. Disconnect and deletion are tested at the end.

## Final decision

Keep Viktor in the future-integration register as an external pilot, a product
reference for Veloce's future Workplace Operations capability, and a possible
optional worker. Do not make it a mandatory dependency or connect broad
business data until pricing, scopes, retention, and approval behavior are
verified.
