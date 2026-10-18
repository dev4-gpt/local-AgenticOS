# Creative Build Repository References

Owner-requested additions, checked on October 18, 2026 UTC. These five entries
are included in the existing Veloce repository and public provider catalogs.
They are build/design references, not installed dashboard libraries, runnable
providers, model access, or an automatic execution grant. Their only declared
permissions are `read-reference` and `write-review`; selection remains disabled.

| Reference | Intended use | Pinned source | Declared license |
| --- | --- | --- | --- |
| [Lenis](https://github.com/darkroomengineering/lenis) | Smooth scrolling in reviewed website projects | `e01eefb1f55cd08bc051521d74f5f8182b71ee9d` | MIT |
| [GSAP](https://github.com/greensock/GSAP) | Motion graphics and video timelines | `13e2b790546426a1a2e0e9b409f3f8dc6d6611f2` | GSAP Standard No Charge License |
| [VANTA.js](https://github.com/tengbao/vanta) | Optional 3D website backgrounds | `f8b351906688b56f0fc744e53bde81fc3c56f150` | MIT |
| [React Bits](https://github.com/DavidHDev/react-bits) | Reviewed animated React components | `310fc737fadcaa149a4e06fb088fc95332dc8bfb` | MIT + Commons Clause License Condition v1.0 |
| [Awesome Opus 5.5 Videos](https://github.com/yihui-dev/awesome-opus5-5-videos) | Prompt/example research for original video work | `92aee2f586ac0715cb3cbcb6384834f98a33383d` | MIT |

## Adoption Boundaries

- Review the exact project and upstream terms before installing or copying any
  code. GSAP and React Bits must not be represented as plain MIT dependencies.
  Their linked license texts, not catalog presence, govern permitted reuse.
- GSAP's new reference pin does not upgrade the existing `3.14.2` CDN scripts
  used in video templates or prove that those templates meet every license gate.
- Check reduced-motion preferences, keyboard/anchor navigation, responsive
  layouts, cleanup and performance before enabling a scrolling/animation tool.
  Keep operational dashboards focused; these references do not add decorative
  motion to Mission Control.
- VANTA requires effect-specific Three.js compatibility and a static fallback.
  Do not load an old global Three.js copy alongside the app's current version
  merely to bypass compatibility testing.
- The Opus collection is not an inference backend or a video license bundle.
  Review creator attribution and rights for each external example separately.
  Do not bulk download media, execute example code, or call a model by default.

No new npm dependencies, copied upstream components/media, provider calls,
hosted changes or deployment are included. A later implementation must select a
specific project/output, pass its evidence gate and preserve the existing
approval, tenant-data and budget boundaries.

## Verification

`tests/provider-matrix-policy.spec.ts` checks each exact source/commit/license,
its catalog visibility and its non-executable public projection. The existing
capability-catalog validators remain authoritative. These tests establish
reference registration, not rendering behavior or native runtime integration.
