# Archived Cosmic UI Restore Note

The files below remain the design reference for the previous **Cosmic Edition**
of Veloce AgenticOS. They are intentionally retained after the Operator Edition
refresh:

- `VELOCE-EDITION-EXPERIENCE-BLUEPRINT.md`
- `VELOCE-COSMIC-STORYBOARD.md`

## Restore Baseline

The last published baseline before the Operator Edition presentation refresh is
Git commit `790ccc0` on `main` in `dev4-gpt/local-AgenticOS`.

The Operator Edition changes are deliberately concentrated in:

- `src/components/HomeImmersive.tsx`
- `src/app/globals.css`
- `tests/visual-shell.spec.ts`
- `tests/sidebar-smoke.spec.ts`

To recreate the earlier cosmic home, restore only those presentation files from
the baseline in a new branch, then run `npm run build` and the visual/sidebar
Playwright suites. Do not revert agent routes, local configuration, vault data,
or any private credential files.

## Why This Exists

The Cosmic Edition remains a useful alternative for a more abstract
three-dimensional demonstration. The Operator Edition is the current local
demo direction: an editorial six-lens journey with practical workspaces and
direct navigation into live Veloce tools.
