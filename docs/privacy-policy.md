# Privacy policy

**Draft prepared for legal review before publication.** This reflects the
actual data flows in the Veloce AgenticOS platform as implemented, not
generic boilerplate -- but it has not been reviewed by a lawyer, and
should be before it is published as the live policy at any public URL.

## What we collect

- **Account and contact information**: name, email address, and company
  name, collected when you request access through the public onboarding
  flow.
- **Billing information**: payment card details are collected and stored
  directly by Stripe, our payment processor -- we never receive, transmit,
  or store your raw card number. We retain the resulting Stripe customer
  ID, subscription ID, and transaction metadata (amounts, timestamps,
  event types) needed to operate your account.
- **Tenant workspace data**: whatever you or your team create inside your
  provisioned workspace -- documents, research records, generated
  artifacts, credentials you choose to connect (see "Your own provider
  credentials" below).
- **Operational logs**: authentication events, API request metadata, and
  audit-trail entries (who did what, when) for your own tenant, used for
  security monitoring and support.

## What we do not do

- We do not sell your data to third parties.
- We do not use your tenant workspace content to train any model.
- We do not share one tenant's data with another tenant. This is a
  technical guarantee, not just a policy promise -- enforced by database
  row-level security and independently verified through live testing
  (two genuinely separate tenants, each unable to read or act on the
  other's data even with a valid authenticated session).

## Your own provider credentials ("BYOK")

If you choose to connect your own API credentials for a third-party AI
provider (OpenAI, Anthropic, etc.), that value is submitted directly into
a write-only secret storage inbox that your own tenant's application
cannot read back. It is used solely to make the API calls you request,
under your explicit approval settings. You can revoke or fully delete a
connected credential at any time from your workspace; deletion destroys
the underlying secret material, not just a status flag.

## Managed AI credits

If you use Veloce-managed AI execution (paid via credits rather than your
own credentials), your usage is metered against your purchased balance,
and settlement amounts are periodically reconciled against the
provider's own authoritative billing records to catch any discrepancy.

## Third parties we use to operate the service

| Provider | Purpose |
|---|---|
| Stripe | Payment processing and subscription billing |
| Supabase | Database and authentication |
| Google Cloud Platform | Application infrastructure and tenant runtime hosting |
| Vercel | Public-facing application hosting |
| Resend | Transactional email (setup links, support acknowledgements, billing alerts) |
| OpenRouter | Underlying model provider for Veloce-managed AI execution (only if you use that feature) |

Each of these processes data only as necessary to provide their specific
function, under their own respective privacy and security terms.

## Data retention and deletion

Each tenant workspace has a configured retention period. When your
account is offboarded (by your request or account closure), your
workspace data is exported to you first if requested, then your
infrastructure, database records, and any stored credentials are
deleted. This has been independently verified after the fact, not just
claimed: for every tenant deletion performed during this platform's
development, the underlying cloud resources, database rows, and
credentials were confirmed actually gone afterward, not merely marked
inactive.

## Your rights

Depending on your jurisdiction, you may have the right to access,
correct, export, or delete your personal data, and to object to certain
processing. Contact us using the support channel in your workspace to
exercise any of these rights.

## Security

See our security practices summary (`docs/soc2-readiness-self-assessment.md`)
for the technical and organizational controls protecting your data,
including access controls, encryption, tenant isolation, and incident
response procedures (`docs/incident-response-plan.md`).

## Changes to this policy

We will update this document as the platform evolves and notify active
tenants of material changes before they take effect.

## Contact

[Insert your support/legal contact email before publishing.]
