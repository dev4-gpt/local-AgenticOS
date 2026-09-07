# VoxCPM — isolated, consent-gated voice generation

## Decision

**Staged and disabled.** VoxCPM must run as a separate private GPU worker, not
inside Vercel, Cloud Run control-plane workers, or the tenant runtime.

The upstream project describes VoxCPM2 as a 2B multilingual TTS system with
voice design and reference-audio cloning. Its source and weights are presented
under Apache-2.0, but those terms do not remove the need for speaker consent,
audio-retention controls, impersonation safeguards, and measured GPU cost.

## Best first use

Use **voice design** for an explicitly approved Veloce marketing asset: create
a new synthetic voice from a written description, retain the approval and
generated-asset record, and publish only after normal delivery approval. Do
not accept reference audio during the first pilot.

## Hard boundaries

- No cloning of a third party, customer, creator, public figure, or employee
  without the verified speaker's explicit purpose-bound consent.
- No public endpoint and no browser upload directly to the GPU worker.
- No voice clips, transcripts, or generated waveforms in the primary Veloce
  database, task logs, model context, or OpenReply data stores.
- No automatic posting; marketing delivery remains a human-approved action.

## Required evidence before activation

1. Exact source and model-weight revisions are pinned and audited.
2. The intended GPU runtime passes latency, concurrency, cold-start, cost, and
   failure/rollback benchmarks.
3. Consent, retention, deletion, disclosure, and access-control tests pass.
4. A private voice-design sample, deletion drill, and worker rollback are
   recorded. Only then may an internal adapter be designed.

The tracked contract is in
[`infrastructure/voxcpm`](../../infrastructure/voxcpm/README.md); validate it
with `npm run verify:voxcpm-pilot`.
