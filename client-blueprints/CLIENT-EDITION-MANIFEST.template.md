# Client Edition Manifest

## Client

- Client name:
- Deployment owner:
- Business owner:
- Go-live target:
- Public/client domain:
- Veloce approval owner:
- Approval status: Pending

## Boundaries

- Deployment project:
- Database/storage namespace:
- Secret namespace:
- Worker namespace:
- Log/audit destination:
- Retention period:
- Runtime access mode: Invite-only

## GCP Runtime

- GCP project:
- Region:
- Cloud Run service:
- Runtime service account:
- Storage bucket:
- Secret Manager prefix:
- Artifact Registry image:
- Invoker emails:
- Client-safe runtime acknowledged: No

## Branding

- Name:
- Logo assets:
- Primary contact:
- Approved public copy:
- Explicit exclusions:

## Enabled Capabilities

| Capability | Status | Storage | Provider | Approval required | Notes |
| --- | --- | --- | --- | --- | --- |
| Command | Excluded by default | n/a | n/a | n/a | No raw local CLI access |
| Context/memory | Proposed | Tenant DB/object storage | n/a | No | No local vault paths |
| Orchestrate | Proposed | Tenant DB | Worker queue | Yes for external actions | Bounded retries |
| Create | Proposed | Object storage | Provider API | Yes before publishing | No personal subscription login |
| Govern | Required | Audit log | n/a | n/a | Budgets and scopes visible |
| Deliver | Proposed | Tenant DB | Provider/API connector | Yes for outreach/spend | Human approval gate |

## Intake Requirements

- Primary workflow to make repeatable:
- Current tools:
- Required integrations:
- Data sources to connect:
- Desired first outcome:
- Monthly budget cap:
- Overage approval rule:
- External action approval rule:
- Preferred client subdomain:

Do not collect raw provider keys, account passwords, private client documents,
or production secrets in public intake.

## Credential Model

Choose one model per provider.

| Provider | Model | Secret reference | Model allowlist | Monthly cap | Warning threshold | Business owner |
| --- | --- | --- | --- | ---: | ---: | --- |
| LLM provider | Client-owned key / managed allowance / OAuth |  |  |  |  |  |
| Email/CRM | Client-owned key / managed allowance / OAuth |  |  |  |  |  |
| Storage/content | Client-owned key / managed allowance / OAuth |  |  |  |  |  |

Never place secret values in this document.

## Approval Gates

| Action | Approver | Evidence | Timeout/escalation |
| --- | --- | --- | --- |
| External publish |  |  |  |
| Outreach send |  |  |  |
| Paid provider overage |  |  |  |
| Data deletion/export |  |  |  |

## Acceptance Evidence

| Gate | Evidence link/path | Status |
| --- | --- | --- |
| Authentication/logout/session expiry |  | Pending |
| Tenant isolation |  | Pending |
| Secret scan/browser bundle scan |  | Pending |
| Provider budget enforcement |  | Pending |
| Worker retry/idempotency |  | Pending |
| Approval workflow |  | Pending |
| Export/backup/deletion |  | Pending |
| Accessibility/error states |  | Pending |
| Rollback |  | Pending |

## First Internal Test Reference

Use this as evidence that the pipeline works, not as a template for sharing one
runtime across clients.

```text
Client slug: veloce-cloud-test
Project: veloce-agenticos-2026
Region: asia-south1
Service: veloce-cloud-test
Image: asia-south1-docker.pkg.dev/veloce-agenticos-2026/veloce/client-runtime:v9
Login URL: https://veloce-cloud-test-mquo4bf7aq-el.a.run.app/login?next=%2F
Service URL: https://veloce-cloud-test-1075094991117.asia-south1.run.app
Secret namespace: veloce-veloce-cloud-test-*
Storage bucket: gs://veloce-agenticos-2026-veloce-cloud-test
Allowed user: aryamandev777@gmail.com
```

Every real client needs a separate manifest, runtime service account, Cloud
Run service, storage bucket, allowed user membership, Secret Manager namespace,
budget policy, and capability allowlist.

## Offboarding

- Export scope:
- Deletion scope:
- Secret revocation owner:
- Retention exceptions:
- Final confirmation owner:
