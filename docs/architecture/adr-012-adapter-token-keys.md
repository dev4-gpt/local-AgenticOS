# ADR 012: Where the adapter token signing key lives, and how it rotates

**Status:** decided 2026-10-20 on the owner's behalf (tracker item 13); easy to reverse before any adapter is enabled.
**Builds on:** ADR-006 (the Ed25519 host tokens), ADR-011 (the QM shim, which verifies them).

## Decision

1. **One Ed25519 key pair per deployment.** The host signs adapter tokens; adapters only verify. A token is at most
   300 seconds old, names one tenant, one adapter and the operations it may call, and is used once. Because adapters
   hold only the public key, a compromised adapter cannot mint tokens.
2. **The private key lives in Google Secret Manager**, one secret per client environment (clients are single-tenant on
   GCP). The host reads it at start-up through its runtime identity. It is never in an `.env` file, the repository,
   CI, logs, a chat or a build artifact. No person needs to read it after it is created.
3. **Public keys are plain configuration** of each adapter (`ADAPTER_PUBLIC_KEY_PEM`). A verifier accepts **one to
   three** public keys at once: the current one, the next one, and the one being retired. A token must verify against
   at least one; every other check (tenant, adapter, scope, lifetime, single use) is unchanged. Implemented in
   `src/lib/adapterTokens.ts` and `services/qm-adapter/server.mjs`; the ContractorOS h1 surface needs the same change.
4. **Rotation is an overlap, not a switch-over.**

## Routine rotation (every 90 days, or when someone with access leaves)

1. Create the next key pair somewhere private and add the private half as a new Secret Manager version. Do not print it.
   ```bash
   umask 077 && openssl genpkey -algorithm ed25519 -out /tmp/next-adapter-key.pem
   gcloud secrets versions add ADAPTER_TOKEN_SIGNING_KEY --data-file=/tmp/next-adapter-key.pem
   openssl pkey -in /tmp/next-adapter-key.pem -pubout          # the public half; this is safe to print and share
   rm -P /tmp/next-adapter-key.pem
   ```
2. Add the new public key to every adapter's `ADAPTER_PUBLIC_KEY_PEM` (two PEM blocks, old then new) and redeploy them.
3. Switch the host's signer to the new Secret Manager version and redeploy it.
4. Wait at least **15 minutes** (a token lives 300 seconds, clock skew is 30, and deploys lag), then remove the old
   public key from every adapter and disable the old Secret Manager version.
5. Record the date and who did it in the deployment log.

## If a key may have leaked

Do steps 1 to 3 at once and remove the old public key in step 2 straight away instead of waiting. Every token already
issued stops verifying within the moment the adapters restart, and none can live longer than 5 minutes anyway. Then
disable the leaked Secret Manager version. Nothing signed by an adapter needs re-issuing, because adapters sign nothing.

## What this does not do yet

- **No code reads the secret yet.** The host does not send adapter tokens until the first real adapter route exists
  (nothing calls an adapter today). That route will load the key from Secret Manager at start-up through an injected
  loader, with a test, and will fail closed (no key, no tokens).
- **No rotation drill has been run.** The overlap is covered by tests (old and new tokens both verify during the
  overlap; the old key's tokens stop once it is dropped), but the runbook above has not been rehearsed against a real
  Secret Manager and a deployed adapter. Do that once on staging before the first client.
- **One key for all adapters in a deployment.** Per-adapter keys are possible later; the token already names its
  audience, so a stolen token cannot be used on another adapter.

## Alternatives rejected

- **Key in an environment variable or `.env`:** it ends up in shell history, process listings and backups.
- **A shared secret (HMAC) instead of a key pair:** every adapter could then mint tokens, so one compromised adapter
  could call every other one.
- **Rotating by switching all parties at one moment:** any lag between the host and one adapter drops real requests.

## Rollback

Documentation and a verifier change that is backward compatible: a single key still works exactly as before.
