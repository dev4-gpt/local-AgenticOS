# Optional Oracle Self-Hosted Runtime

Updated 2026-07-27.

Oracle Cloud Always Free plus a self-hosted panel such as Coolify can be an
optional low-cost compute plane. It should not replace the GCP/Supabase control
plane or become a shared bucket of client secrets.

## Recommended role

Use an Oracle/Coolify deployment only for workloads that genuinely need a
long-lived process, such as:

- a private queue worker;
- a self-hosted open-source service such as a separately isolated Paperclip
  installation;
- an optional self-hosted model or media service;
- a cost-sensitive client's dedicated runtime when its isolation and backup
  requirements are accepted.

Keep these in GCP/Supabase:

- public intake and approval records;
- Auth and tenant membership;
- the authoritative client manifest;
- Secret Manager references and provider credentials;
- audit records and billing/budget decisions.

The Oracle worker should receive a scoped job reference, not the entire control
plane database or a broad service-role key. It should write results to the
client's approved storage namespace and report status back through an
authenticated server contract.

## Cost and operations reality

Oracle's Always Free resources are intended to remain available indefinitely,
but capacity is limited and availability depends on region and account
capacity. Oracle also requires account verification and may reclaim or limit
resources under its current free-tier rules. Treat this as a best-effort
secondary plane, not the only production recovery path. See the [Oracle Free
Tier documentation](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier.htm).

Coolify is free when self-hosted, but the operator still owns server patching,
backups, TLS, monitoring, firewall rules, Docker updates, and incident
response. See the [Coolify installation guide](https://coolify.io/docs/get-started/installation)
and [self-hosted usage notes](https://coolify.io/docs/get-started/usage).

## Security requirements before use

- dedicated VM or isolated project for the workload;
- SSH keys only, no password login;
- automatic security updates and a documented patch owner;
- Cloudflare Tunnel or an equivalent restricted ingress path;
- no public Redis, Docker socket, Postgres, or MinIO admin endpoint;
- per-client service identity and storage namespace;
- encrypted backups tested by restoring them;
- no personal CLI sessions or local vault mounts;
- no provider secret copied into a public image or browser bundle;
- a shutdown and offboarding procedure.

## Decision

Do not provision Oracle as “extra storage” for the current cloud test. The
current GCP shape is simpler and already has Cloud Run scale-to-zero behavior.
Add Oracle only after one hosted adapter needs a persistent worker, and keep
the worker optional so the client runtime remains recoverable if the VM is
unavailable. Cloud Run's local filesystem is disposable, so durable files must
still live in Cloud Storage or another managed object store; see the [Cloud
Run overview](https://docs.cloud.google.com/run/docs/overview/what-is-cloud-run).
