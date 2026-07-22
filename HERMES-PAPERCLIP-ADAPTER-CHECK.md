# Hermes-Paperclip Adapter Compatibility Check

## v2 decision

Veloce AgenticOS retains Hermes and Paperclip as separate private tools. The
`hermes-paperclip-adapter` is **not enabled** in v2 until it passes this isolated
check on a disposable Paperclip project. This protects the active local and VPS
workspaces from unexpected writes, duplicate tasks, or credential crossover.

## Prerequisites

- `hermes --version` succeeds with the intended private profile.
- `paperclipai --help` succeeds and Paperclip is reachable locally.
- A disposable Paperclip company/project exists; never use a live client project.
- The test uses a dedicated least-privilege automation token, a capped model key,
  and no production vault.

## Required smoke test

1. Create one disposable task labeled `adapter-smoke`.
2. Allow the adapter to read only that task and post exactly one dry-run comment.
3. Confirm no task is created, changed, assigned, or published without an explicit
   human approval action.
4. Verify logs contain no provider key, vault path, client data, or prompt payload.
5. Delete the disposable task and revoke the test token.

## Pass criteria

Enable the adapter only when all five conditions hold: connectivity succeeds,
scope is limited to the disposable project, writes are approval-gated, logs are
redacted, and teardown leaves no active token or task artifact. Record the exact
adapter version and result in the private operations vault.

## Failure policy

If any condition fails, leave the adapter disabled. Hermes and Paperclip continue
to operate as their existing independent private tools; no client workflow depends
on this adapter in v2.
