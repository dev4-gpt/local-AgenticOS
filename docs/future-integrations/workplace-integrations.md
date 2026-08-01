# Future Capability: Workplace Integrations

**Status:** Future capability / staged roadmap  
**Last reviewed:** 2026-07-31

## Product idea

Veloce should eventually let users connect the tools where their work already
lives so agents can assemble context and complete approved jobs without asking
them to copy-paste everything into another dashboard.

This is not “give the agent access to every app.” It is a controlled work graph:

```text
Provider events and documents
          ↓
Normalized signals and source links
          ↓
Veloce work graph and memory retrieval
          ↓
Proposal with evidence and cost
          ↓
Human approval
          ↓
Allowlisted action in the originating tool
          ↓
Audit + durable writeback
```

## Candidate connectors

| Connector | First useful job | Initial mode | Cost posture | Priority |
| --- | --- | --- | --- | --- |
| Google Drive | Find briefs, contracts, source files, and deliverables | Read-only | Standard API use currently no additional charge; storage/account limits remain | 1 |
| Gmail | Detect unanswered threads and draft follow-ups | Read + draft | API quotas and email-provider limits | 1 |
| Google Calendar | Prepare meeting briefs and identify overdue decisions | Read-only | Standard API use currently no additional charge; quota limits apply | 1 |
| Slack | Collect channel updates and detect stalled work | Read-only channels | Workspace plan and API rate limits | 2 |
| Microsoft Teams | Collect team/channel updates and draft actions | Read-only first | Some Graph/Teams APIs are metered or license-dependent | 2 |
| Notion/Linear/Asana | Reconcile tasks, owners, and due dates | Read-only, then task updates | Provider plan/API limits | 3 |
| CRM | Detect pipeline stalls and missing next steps | Read-only, then draft updates | Provider plan/API limits | 3 |
| Stripe/finance | Reconcile invoices and anomalies | Read-only first | Financial data and provider/API limits | 4 |
| WhatsApp Business | Customer support and approved follow-ups | Inbound/read-only first | Per-message pricing for many outbound categories | 5 |

## Recommended first slice

Start with Google Drive, Gmail, and Calendar. They are close to existing Veloce
workflows and can provide useful context without immediately creating a public
messaging or financial-action surface.

Example:

> Prepare tomorrow's client delivery brief from relevant Drive files,
> unanswered Gmail threads, calendar events, and the Veloce pipeline. Flag
> missing approvals. Draft—but do not send—follow-up messages.

Then add Slack or Teams based on the user's actual workplace. Do not begin with
WhatsApp: it creates customer-message consent, template, delivery, and
per-message billing complexity.

## Staged implementation

### Stage 0: Connection registry

Every connection needs OAuth start/callback, token revocation,
account/workspace/tenant identity, granted scopes, last-used time, data
residency, provider terms, read/write capability flags, cost metadata, and
disconnect/export/deletion actions.

No agent receives a raw unrestricted token.

### Stage 1: Read-only signals

Normalize provider data into a small internal shape:

```ts
type WorkSignal = {
  tenantId: string;
  connectionId: string;
  provider: string;
  sourceId: string;
  sourceUrl?: string;
  kind: "message" | "document" | "task" | "event" | "invoice";
  title: string;
  summary: string;
  owners: string[];
  dueAt?: string;
  sensitivity: "normal" | "confidential" | "restricted";
  observedAt: string;
};
```

Store source references and compact summaries rather than copying every
provider record into Veloce by default.

### Stage 2: Proposal generation

Agents may combine signals to produce stalled-work reports, missing-input
lists, meeting briefs, pipeline reconciliation, invoice anomaly reports,
draft follow-ups, and weekly operating summaries.

Every proposal must show source records, confidence, assumptions, expected cost,
and intended side effect.

### Stage 3: Human approval

Approval is required before sending or scheduling messages, changing CRM/task
records, changing advertisements or budgets, accessing restricted financial
documents, sending WhatsApp templates, deleting/publishing anything, or
triggering external delivery.

### Stage 4: Narrow write actions

Implement one provider action at a time with idempotency, retries, audit events,
and a compensating action where possible. A generic “agent can use the whole
provider” permission is not acceptable.

## Cost policy

“Free integration” can mean different things:

1. Free API calls.
2. Free provider account.
3. Free storage.
4. Free automation/messages.
5. Free Veloce hosting, models, queues, and storage.

These are not interchangeable.

Current planning references:

- [Slack pricing](https://api.slack.com/pricing) and [Slack rate
  limits](https://api.slack.com/apis/rate-limits)
- [Microsoft Teams API payment and licensing
  requirements](https://learn.microsoft.com/en-us/graph/teams-licenses)
- [Google Drive API usage limits](https://developers.google.com/workspace/drive/api/guides/limits)
- [WhatsApp Business Platform pricing](https://whatsappbusiness.com/products/platform-pricing/)

Veloce should expose a connector label such as `free-api`, `provider-plan`,
`metered`, or `unknown`, and require budget/approval policy for anything not
clearly free.

## Security model

- Tenant-scoped connections and data namespaces.
- Least-privilege OAuth scopes.
- Separate read and write capabilities.
- Untrusted external content marked as data and isolated from instructions.
- PII and financial-data classification before model submission.
- Source URL and provider record ID retained for attribution.
- No secrets in prompts, logs, browser payloads, or model context.
- Disconnect revokes tokens and stops scheduled jobs.
- Export and deletion cover signals, summaries, proposals, artifacts, audit
  records, and cached copies according to policy.

## Product decision

Make Workplace Integrations a future Veloce capability. Build the read-only
registry and signal layer first; keep writes approval-gated; pass through or
budget any provider, model, messaging, storage, or hosting cost. The initial
release should produce a useful proposal and draft, not send or mutate.
