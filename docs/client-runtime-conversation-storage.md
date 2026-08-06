# Client Conversation Storage

The hosted client runtime treats provider conversations as tenant-owned data.

## Current contract

- Every provider prompt is stored in `client_runtime_jobs.input_metadata.prompt`.
- Every successful text result is stored in `client_runtime_jobs.output_metadata.output`.
- Rows are scoped by `tenant_slug` and protected by Supabase RLS through `client_member(tenant_slug)`.
- `/api/client-runtime/provider-history?provider=...` reconstructs the provider thread from those rows.
- `DELETE /api/client-runtime/provider-history?provider=...` removes the signed-in user's provider thread from the tenant job ledger; the client UI's Clear action calls this endpoint before clearing its optimistic browser cache.
- The provider workspace hydrates from that endpoint after login, so the visible thread survives route changes, logout/login, hard reloads, and another device using the same account.
- `localStorage` remains an optimistic browser cache only. It is not the source of truth.

## Retention and deletion

The live test client currently has a 14-day Cloud Storage lifecycle for generated artifacts. The Postgres job transcript is not automatically deleted by that object rule; it remains in the tenant database until the user explicitly clears a provider thread or an explicit retention/offboarding process removes it. The deletion RPC is defined in `product-experience/supabase-client-runtime-conversation-lifecycle.sql`; it is tenant/member scoped and deletes only jobs requested by the signed-in user. A production rollout should add a scheduled cleanup job that soft-deletes or removes expired job input/output metadata while preserving minimum audit evidence. Client export and offboarding must include the job ledger, artifacts, records, and graph data as one tenant package.

## Why no second database yet

Supabase is already the authenticated system of record and contains the tenant membership, RLS, job queue, budget ledger, artifacts, records, and memory graph. Adding Neon, Pinecone, Qdrant, or another database before the transcript contract is proven would create synchronization, deletion, retention, and tenant-isolation work without solving the browser-history problem.

When conversation search becomes a measured bottleneck, add `pgvector` in the same Postgres project or a dedicated vector store for derived embeddings. Keep the canonical transcript in Postgres; vector indexes must be rebuildable and must never become the only copy.

## Planned next layers

1. Add explicit conversation IDs and a `client_runtime_conversations` view/table when users need multiple threads per provider.
2. Add background summaries and semantic memories derived from approved conversations.
3. Add embeddings only after retrieval tests show that keyword and recent-history retrieval are insufficient.
4. Add object storage for large attachments and media; keep text transcripts in Postgres.
