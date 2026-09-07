# Scout — approval-gated lead-research candidate

## Decision

**Staged and disabled.** Scout is an early-access CLI for social-profile
scraping, contact enrichment, SMTP email verification, lead scoring, and CSV
export. Its upstream README also documents LinkedIn session-cookie use and
proxy/user-agent rotation. Those are not acceptable as a Veloce hosted-runtime
capability or as an automatic OpenReply input.

Primary source: [kiryano/Scout](https://github.com/kiryano/Scout). The
upstream project is MIT licensed, but that license does not establish a lawful
basis to collect, store, enrich, or contact a person.

## Hard boundaries

- No Scout runtime, package installation, or scraper deployment in Veloce.
- No browser cookie, social token, user-agent rotation, or CAPTCHA-bypass
  configuration in Veloce source, infrastructure, or secrets.
- No proxy configuration or proxy-rotation service in Veloce infrastructure.
- No raw profile/bio content, handles, emails, phone numbers, websites, CSVs,
  or verified-contact records may be imported into Veloce or OpenReply.
- No automatic outreach, DM, comment reply, CRM creation, or campaign
  activation based on Scout output.
- No direct Veloce or OpenReply runtime connection.

## Allowed future handoff

Only after an operator records a campaign's lawful basis, audience, consent or
other valid contact basis, retention period, and deletion path may a human
create a small aggregate campaign brief. That brief can describe an approved
segment and non-sensitive messaging hypothesis; it must not include a lead or
their contact details.

```text
operator-reviewed public research
  -> human-approved aggregate campaign brief
  -> separate OpenReply campaign review
  -> explicit human delivery approval
```

OpenReply remains responsible for its own Meta permissions and messaging
controls. Scout may never supply raw lead data to OpenReply.

## Activation evidence

Before revisiting this decision, pin and review an exact upstream commit;
complete terms, privacy, lawful-basis, retention, deletion, and security
reviews; prove a human-review workflow; and prove that disabling the pilot
removes its access without affecting Veloce. Until then, retain
`state: disabled` in the tracked manifest and validate it with
`npm run verify:scout-lead-research`.
