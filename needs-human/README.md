# needs-human

Everything in this folder requires a licensed human professional (an
attorney or a CPA firm) acting outside of any coding session. Nothing here
can be closed by more engineering, more research, or better AI tooling --
that was checked, not assumed (see each item's "already tried" note).

Everything else in the 100-day Veloce AgenticOS GA roadmap is complete
and evidenced in `docs/` -- see `docs/v3.3-current-release-audit.md` for
the full trail (live-Stripe cutover, two-tenant infrastructure drill,
RBAC, backup/restore, integration catalog, release-ledger attestation)
and `docs/soc2-readiness-self-assessment.md` for how every AICPA Trust
Services criterion maps to real, live-proven controls.

## 1. Lawyer review of the privacy policy

- **What**: independent legal review of `docs/privacy-policy.md` for
  enforceability, liability exposure, and jurisdiction-specific accuracy
  before it is published at any public URL.
- **Status**: drafted from the platform's actual data flows, then
  checked section-by-section for completeness against GDPR Art. 13/14
  and CCPA/CPRA's disclosure requirements (see that document's own "Note
  on how this draft was prepared"). Not yet reviewed by a lawyer.
- **Open placeholders inside the doc a human must fill before
  publishing**: the legal entity name and registered address/
  jurisdiction, the support/legal contact email, and confirmation of
  each vendor's actual signed data-transfer terms (see its
  "International data transfers" section).
- **Already tried, ruled out**: researched `github.com/topics/ai-legal`
  and similar open-source projects (`ai-legal-claude`, `lq-ai`) as a
  possible shortcut -- none offered a real static compliance checklist,
  only descriptions of skills that call an LLM at review time, which adds
  no rigor beyond what was already done directly.
- **Blocked on**: engaging a lawyer or a legal-review service.

## 2. CPA attestation engagement (SOC2)

- **What**: engaging a licensed CPA firm to perform the actual AICPA
  attestation engagement (Type I first, Type II after an observation
  period) against the Trust Services Criteria.
- **Status**: self-assessed in `docs/soc2-readiness-self-assessment.md`,
  mapping every criterion to a real, live-proven technical control or an
  explicitly named gap -- genuinely useful pre-audit preparation, but not,
  and never a substitute for, the attestation itself.
- **Already tried, ruled out**: no free or automated substitute exists
  for the actual attestation -- a SOC2 report can only be issued by a
  licensed CPA firm, by definition. What free research *did* produce:
  the open-source policy scaffolding (Probo, Comply, JupiterOne's
  templates, NIST SP 800-61) used as the drafting basis for
  `docs/information-security-policy.md` and
  `docs/incident-response-plan.md`.
- **Blocked on**: budget, and choosing a CPA firm (directly, or via a
  compliance-automation vendor such as Vanta/Drata/Secureframe that
  partners with one).

## 3. Formal SOC2 report

- **What**: the signed SOC2 Type I or Type II report the CPA firm issues
  at the end of item #2 -- this is that engagement's deliverable, not a
  separate task to schedule on its own.
- **Status**: cannot start until item #2 is underway.
- **Do not do until this exists**: describe the platform as "SOC2
  certified" or "SOC2 compliant" anywhere public. The accurate phrase,
  used throughout `docs/soc2-readiness-self-assessment.md`, is
  "SOC2-ready, self-assessed, third-party audit pending."
