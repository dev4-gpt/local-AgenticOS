# AgentOS V2 Local AI Tools Roadmap

Last updated: 2026-07-14

This document captures the CANCEL Guide review and our Mac-specific analysis for adding local open-source alternatives to paid AI tools inside AgentOS.

Source guide:

- [CANCEL Guide: The 5 Repos That Kill Your AI Bills](https://docs.google.com/document/u/0/d/1rZtJvKrpkpkyZp1ZSppJLei9tcDEdLfaQdGoXHAQ6iY/mobilebasic?)

Related project sources checked:

- [Handy](https://github.com/cjpais/handy)
- [OmniVoice Studio](https://github.com/debpalash/OmniVoice-Studio)
- [ComfyUI system requirements](https://docs.comfy.org/installation/system_requirements)
- [Wan 2.2 ComfyUI workflow guide](https://docs.comfy.org/tutorials/video/wan/wan2_2)
- [Duix-Avatar / HeyGem](https://github.com/duixcom/Duix-Avatar)

## Why This Matters For AgentOS

AgentOS already follows a local-first philosophy: use local and free workflows when they are practical, then use paid APIs only when they are worth the cost.

The CANCEL Guide lines up with that philosophy. It lists five open-source tools that can reduce or replace common paid AI subscriptions:

| Paid tool category | Local alternative from the guide | AgentOS relevance |
| --- | --- | --- |
| Wispr Flow dictation | Handy | Local speech-to-text and system-wide dictation. |
| ElevenLabs voice | OmniVoice Studio | Local voice cloning, TTS, dubbing, and dictation. |
| Nano Banana / GPT Image | ComfyUI | Local image generation and visual workflows. |
| Runway / Sora video | Wan through ComfyUI | Local text-to-video or image-to-video, if hardware allows. |
| HeyGen avatars | HeyGem / Duix-Avatar | Local talking-head avatar generation, but very hardware-heavy. |

The important product lesson is not "install everything." The lesson is to make AgentOS aware of local substitutes, then install only the ones that fit the current machine and workflow.

## Current Mac Reality Check

Current machine:

| Item | Value |
| --- | --- |
| Machine | MacBook Pro |
| Chip | Apple M3 Pro |
| CPU | 12 cores |
| GPU | Apple M3 Pro, 18 cores, Metal 4 |
| Memory | 18 GB |
| Architecture | arm64 / Apple Silicon |
| Free disk space | About 47 GiB |
| Docker | Installed, but daemon was not running during the check |
| Existing local AI storage | Ollama about 3.2 GB, Hugging Face cache about 2.7 GB |

This is a strong Mac for local AI work, but it is not an NVIDIA CUDA machine. That matters because several media-generation tools are built or tuned around NVIDIA GPUs.

The biggest blocker right now is disk space. With only about 47 GiB free, installing more model-heavy tools would leave macOS, Docker, browsers, Node builds, and AgentOS with too little breathing room.

## Tool-by-Tool Decision

### 1. Handy

What it does:

- Local speech-to-text.
- Press a hotkey, speak, and paste text into the active app.
- Useful as a Wispr Flow-style dictation replacement.

Fit for this Mac:

- Good.
- Lightweight compared with the other tools.
- No NVIDIA GPU needed.
- Handy supports macOS, Windows, and Linux-style control flags.

Estimated space:

- Around 1-3 GB in practical use.

AgentOS recommendation:

- Include as an optional local dictation adapter.
- Do not install right now unless dictation becomes a daily workflow.
- Best future integration: status card, install guide, and optional launch/open action.

Decision:

- Add to V2 roadmap.
- Install later only when we intentionally want local dictation.

### 2. OmniVoice Studio

What it does:

- Local voice cloning.
- Text-to-speech.
- Voice design.
- Dubbing.
- Dictation.
- Potential local alternative to ElevenLabs for some workflows.

Fit for this Mac:

- Good but heavier than Handy.
- Apple Silicon is supported.
- 18 GB RAM is enough to test, though not luxurious.
- CPU/MPS generation may be slower than ElevenLabs.

Estimated space:

- App and base models: around 10-20 GB.
- Extra cache, voices, models, and working files: another 5-10 GB over time.
- Practical planning number: 15-30 GB.

AgentOS recommendation:

- Include as an optional local ElevenLabs alternative.
- Keep ElevenLabs as the fast/pro-quality provider for now.
- OmniVoice should be framed as a local/private/cost-saving option, not a full replacement until tested.

Decision:

- Add to V2 roadmap.
- Skip install for now because disk space is tight.
- Revisit after freeing at least 80-100 GB.

### 3. ComfyUI

What it does:

- Local image-generation workflow canvas.
- Can run FLUX, Qwen-Image, Stable Diffusion-family workflows, and many custom nodes.
- Also becomes the base for Wan video workflows.

Fit for this Mac:

- Possible.
- Official ComfyUI docs support Apple Silicon with Metal acceleration.
- Model downloads can be large.
- The desktop app is the simplest path on Apple Silicon, but advanced workflows can still become dependency-heavy.

Estimated space:

- App and Python/runtime: several GB.
- First image model workflow: commonly 10-30 GB depending on models.
- Comfortable working budget: 50-100 GB if using multiple image workflows.

AgentOS recommendation:

- Include as a supported but heavy local creative engine.
- Do not install while only 47 GiB is free.
- Add it later after clearing disk space or moving model storage to an external drive.

Decision:

- Add to V2 roadmap.
- Phase 2 only.

### 4. Wan Video Through ComfyUI

What it does:

- Local text-to-video or image-to-video generation using Wan models.
- Best used through ComfyUI templates rather than the raw Wan repository.

Fit for this Mac:

- Experimental.
- The guide says the 5B workflow targets around 8 GB VRAM, and ComfyUI has offloading paths.
- Apple Silicon may run it, but video generation is slow and memory-heavy.
- Larger 14B workflows are not a good match for this Mac's current RAM/storage situation.

Estimated space:

- Wan 5B plus text encoder and VAE can require tens of GB.
- Practical planning number: 30-80 GB on top of ComfyUI, depending on workflow and model variants.

AgentOS recommendation:

- Include as "experimental local video."
- Keep OpenMontage and API-backed video options separate.
- Do not install until ComfyUI is already stable and storage is expanded.

Decision:

- Add to V2 roadmap.
- Not a near-term install.

### 5. HeyGem / Duix-Avatar

What it does:

- Local talking-head avatar generation.
- Face and voice avatar workflows.
- Local alternative to HeyGen in theory.

Fit for this Mac:

- Poor.
- The official Duix-Avatar repo lists Windows and Ubuntu deployment modes.
- It recommends NVIDIA hardware, 32 GB RAM, and substantial storage.
- The guide warns about around 70 GB downloads and about 100 GB free space.
- This Mac has Apple Silicon, 18 GB RAM, and only about 47 GiB free.

Estimated space:

- 100 GB+ should be expected before even considering it.

AgentOS recommendation:

- Catalog only.
- Do not install locally on this Mac.
- If avatars become important, use HeyGen API, a GPU VPS, a separate NVIDIA workstation, or a hosted workflow.

Decision:

- Document as not recommended for this Mac.
- Do not install.

## Product Decision

Do not install these tools right now.

Reason:

- Handy and OmniVoice together could consume around 20-30 GB.
- Current free space is about 47 GiB.
- Installing them could leave only about 17-27 GiB free.
- That is too tight for macOS plus AgentOS, Docker, browser sessions, Node builds, caches, Ollama, and future model downloads.

This is exactly the kind of decision AgentOS should encourage: document the opportunity, understand the tradeoff, and avoid cluttering the machine until there is a real workflow need.

## V2 Integration Plan

### Phase 1: Documentation And Awareness

Status: Done in this document.

Add the local alternatives into AgentOS as known optional tools:

| Tool | AgentOS status label |
| --- | --- |
| Handy | Optional local dictation |
| OmniVoice Studio | Optional local voice/TTS |
| ComfyUI | Supported but heavy local image engine |
| Wan | Experimental local video through ComfyUI |
| HeyGem / Duix-Avatar | Not recommended on this Mac |

### Phase 2: Lightweight App Support

Add an AgentOS UI section for "Local Cost-Saving Tools" that shows:

- What the tool replaces.
- Whether it is installed.
- Whether this Mac is a good fit.
- Estimated disk requirement.
- Recommended action.
- Link to official install docs.

This section should not auto-install anything by default.

### Phase 3: Install Only The Useful Lightweight Tools

Install order if we free enough space:

1. Handy for local dictation.
2. OmniVoice Studio for local voice testing.
3. ComfyUI Desktop for images only.
4. Wan through ComfyUI after image workflows are stable.

Do not install HeyGem locally unless hardware changes.

### Phase 4: Deep Integration

Only after a tool is proven useful locally:

- Add service detection.
- Add local launch commands.
- Add API/MCP connection if the tool exposes one.
- Add output folders to AgentOS media history.
- Add Obsidian writeback for generated assets, prompts, and notes.

## Minimum Space Targets

| Goal | Free space target |
| --- | --- |
| Stay healthy with current AgentOS | 40-60 GB free |
| Add Handy only | 50 GB+ free preferred |
| Add Handy plus OmniVoice | 80 GB+ free preferred |
| Add ComfyUI image workflows | 120 GB+ free preferred |
| Add ComfyUI plus Wan video | 180 GB+ free preferred |
| Try HeyGem / Duix locally | Not recommended; 150 GB+ and NVIDIA-style hardware preferred |

## Final Recommendation

For this Mac and this stage of AgentOS:

1. Keep using ElevenLabs for voice because it is already configured and does not consume local disk.
2. Skip Handy and OmniVoice installs for now because they would reduce free disk too much.
3. Do not install ComfyUI, Wan, or HeyGem until storage is cleaned up or model storage is moved off the internal drive.
4. Add a V2 "Local Cost-Saving Tools" page later so these options are visible, researched, and ready when the machine has room.
5. Keep the current AgentOS focus on production readiness, content launch, Web Studio workflows, memory, Graphify, and business use cases.

This keeps AgentOS disciplined: local-first, but not local-at-any-cost.
