# VoxCPM isolated pilot infrastructure

This directory is a release contract for a possible VoxCPM pilot. It is not a
model checkout, a hosted endpoint, or an enabled voice-cloning feature.

## Boundary

- Keep VoxCPM in a separate GPU project and a private worker service. Do not
  add its Python, CUDA, model weights, or GPU runtime to the Vercel app,
  control-plane provisioner, client runtime, or default Cloud Build path.
- Begin with **voice design only**. Reference-audio cloning remains disabled
  until the owner has given explicit, recorded consent for that exact voice
  and purpose.
- Reference clips, transcripts, and generated audio are sensitive biometric
  content. Store them only in the pilot's separate data store, use a short
  retention window, and prove deletion before broader use.
- The worker must have private ingress. Any future Veloce adapter may submit
  approved, short-lived jobs but may not receive reference audio or raw voice
  data back into Veloce's primary database.

## Activation gates

1. Pin and audit a specific OpenBMB/VoxCPM source commit and model-weight
   revision; retain Apache-2.0 notices.
2. Benchmark the selected model on the intended GPU, concurrency, latency,
   cold-start, and cost envelope. The upstream documents Python 3.10–3.12,
   PyTorch 2.5+, and CUDA 12+ as minimum requirements.
3. Implement a consent receipt tied to the speaker, clip, purpose, expiry,
   deletion request, and operator approval. Never accept a third-party or
   celebrity voice.
4. Test a non-public voice-design output with disclosure/watermark policy,
   then prove source-audio and generated-audio deletion and worker rollback.

Validate the tracked disabled contract with:

```bash
npm run verify:voxcpm-pilot
```
