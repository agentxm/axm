---
observed_at: "2026-09-26T05:41:18Z"
session: "c72a"
area: "workspace test fixtures"
---

# Shared workspace directories changed setup's bare starting state

## Context

this consolidation consolidated lifecycle, sync, and configuration fixtures onto one directory helper. Setup uses the helper before it creates a workspace.

## Friction

The helper initially created `.axm` in project and home directories for every caller. Six setup preview and unattended-apply assertions failed because setup no longer started from bare directories.

## Cost / impact

The first full workspace run had 132 failures. Correcting the fixture required a focused setup rerun and a second full workspace run, each beyond the planned first verification; the full rerun took 1m 44s.

## Outcome

The helper gained a `bare` option for setup. The focused setup preview and unattended-apply specifications passed, and the full workspace rerun had 126 failures. One bootstrap-plan assertion outside the changed fixture remained among them.

## Evidence

`/tmp/axm-work-step67-workspace-tests.json` recorded 4,337 passed and 132 failed; `/tmp/axm-work-step67-workspace-tests-final.json` recorded 4,344 passed and 126 failed. The correction is in `packages/core/workspace/src/testing/workspace-world.ts` and `packages/core/workspace/src/configuration/testing.ts`.
