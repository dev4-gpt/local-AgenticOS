# Managed provider access

Veloce exposes two separate billing models:

1. BYOK: the tenant supplies a provider credential. The provider bills the
   tenant directly. Veloce stores the credential server-side, applies the
   tenant manifest, quota, timeout, retry, and budget policy, and never returns
   the key to the browser.
2. Veloce-managed: the tenant funds a Veloce wallet. Veloce owns the provider
   account and credential, pays the provider, and charges the tenant wallet
   from a tenant-scoped reservation ledger. A funded wallet is not an
   activation grant.

The “request managed provider access” path is a support/control-plane request.
It records the provider and requested budget, then waits for team review. It
must not create a provider connection, reveal a credential, or enable execution
by itself. Approval requires:

- provider account ownership and terms review;
- a current pricing snapshot and quota/spend cap;
- a tenant manifest approval;
- a server-side credential reference and successful health check;
- reserve → execute → settle/refund evidence;
- an audit record and a tested disable/restore path.

Disable is persisted on the tenant/provider budget and blocks future quote,
reserve, and execute calls. Settlement and refund remain available for
in-flight reservations. Restore only re-enables the route as `not_checked`;
the provider must pass a new health check before execution can resume.

OpenRouter is the first managed adapter. The adapter is fail-closed until the
account, Secret Manager reference, reconciliation, manifest, health, and smoke
gates are all present. Other catalog providers remain BYOK unless separately
promoted through the same evidence bundle.
