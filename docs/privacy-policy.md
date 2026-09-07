# Privacy policy

**Draft prepared for legal review before publication.** This reflects the
actual data flows in the Veloce AgenticOS platform as implemented, not
generic boilerplate -- but it has not been reviewed by a lawyer, and
should be before it is published as the live policy at any public URL.

*Completeness pass (2026-09-07):* this draft was checked section-by-section
against the disclosure elements GDPR Art. 13/14 and CCPA/CPRA require a
privacy notice to cover (legal basis for processing, international
transfer disclosure, supervisory-authority complaint rights, sale/share
opt-out status, children's privacy, automated decision-making), and the
gaps found are now filled in below with what is actually true of this
platform. This closes *completeness* gaps against a known checklist -- it
is not, and cannot be, a substitute for a licensed attorney's review of
enforceability, liability language, and jurisdiction-specific accuracy.
That requirement does not go away no matter how thorough the checklist;
see the note on tooling researched for this pass at the bottom of this
document.

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

## Legal basis for processing (GDPR)

For users in the UK/EEA, we process personal data under these legal bases:

- **Contract necessity**: account/contact information, billing information,
  and tenant workspace data are processed because they are required to
  provide the service you signed up for.
- **Legitimate interests**: operational logs (authentication events, API
  request metadata, audit-trail entries) are processed for platform
  security, abuse prevention, and support -- a legitimate interest that
  does not override your own rights, since this data is scoped to your
  own tenant only.
- **Legal obligation**: billing and transaction records are retained as
  required by applicable tax and accounting law.

We do not rely on consent as a legal basis for any of the above -- none of
it is optional to using the service. Where a future feature does rely on
consent (for example, an optional marketing email), that consent will be
requested separately and can be withdrawn at any time.

## International data transfers

Our infrastructure vendors (Stripe, Supabase, Google Cloud Platform,
Vercel, Resend, OpenRouter) may process data in the United States or other
countries outside your own. Each of these vendors provides its own
data-transfer safeguards (such as EU Standard Contractual Clauses) as part
of their respective terms of service. [This section should be confirmed
against the actual signed data-processing terms with each vendor before
publication -- it currently reflects each vendor's publicly documented
practice, not a signed agreement reviewed by counsel.]

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

**If you are in the UK/EEA**, you also have the right to lodge a
complaint with your local data protection supervisory authority if you
believe we have not handled your data lawfully.

**If you are a California resident**, under the CCPA/CPRA you have the
right to know what personal information we collect, to delete it, to
correct it, and to non-discrimination for exercising these rights. We do
not sell or share (as those terms are defined by the CCPA/CPRA) your
personal information, so there is no opt-out link to provide. You may
submit a rights request yourself or through an authorized agent using the
support channel in your workspace; we may need to verify your identity
before acting on the request.

## Children's privacy

Veloce AgenticOS is a business-to-business platform intended for use by
adults acting on behalf of a company. It is not directed at, and we do
not knowingly collect personal data from, children under 16.

## Automated decision-making

The platform executes AI-generated actions within your own workspace at
your direction and under your configured approval settings -- it does not
use your personal data to make any automated decision that produces
legal effects concerning you or similarly significantly affects you
(such as a decision about employment, credit, or benefits eligibility).

## Data processing agreements

If your organization requires a signed Data Processing Agreement to use
this service (common for GDPR-covered business customers), contact us
using the support channel in your workspace.

## Security

See our security practices summary (`docs/soc2-readiness-self-assessment.md`)
for the technical and organizational controls protecting your data,
including access controls, encryption, tenant isolation, and incident
response procedures (`docs/incident-response-plan.md`).

## Changes to this policy

We will update this document as the platform evolves and notify active
tenants of material changes before they take effect.

## Contact

[Insert: legal entity name, registered jurisdiction/address, and
support/legal contact email before publishing. At the current
solo-founder stage (see `docs/organizational-structure.md`) this should
name whatever legal entity (sole proprietorship or otherwise) actually
holds the customer contracts, not a placeholder.]

## Note on how this draft was prepared

This document reflects the platform's actual data flows as implemented
(see `docs/soc2-readiness-self-assessment.md` for the underlying
evidence). The 2026-09-07 completeness pass was checked against GDPR
Art. 13/14 and CCPA/CPRA's own published disclosure requirements directly,
not generated from a third-party template. Several actively-maintained
open-source "ai-legal" tools were researched for this pass
(`github.com/topics/ai-legal`, `LegalQuants/lq-ai`, and similar) -- none
were used, because on inspection each either had no static, citable
compliance checklist to draw from (only descriptions of skills that
dynamically prompt an LLM at review time, which adds no rigor beyond
doing the same analysis directly) or was a marketing funnel for a paid
community rather than a genuine reference resource. No tool found,
free or paid, changes the underlying fact: only a licensed attorney's
review satisfies "reviewed by a lawyer" for this document.
