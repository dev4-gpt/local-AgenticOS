# Agent efficiency controls

Veloce adopts the useful constraints from Ponytail and Headroom without making
either an unreviewed production dependency.

- **Ponytail:** choose the smallest correct change, prefer platform primitives,
  and never trade away validation, security, or rollback for brevity.
- **Headroom:** keep logs, command output, and model context compact; redact
  secrets and retain full operational evidence outside model context. Do not
  proxy tenant prompts, credentials, raw media, or support messages through a
  third-party compression layer without a dedicated privacy review.

The JSON contract is checked by `npm run verify:engineering-controls`.
