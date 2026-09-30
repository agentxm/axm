---
observed_at: "2026-09-30T02:04:00Z"
session: "tn5h"
area: "Local CLI verification"
---

# CLI fixture guards fail in a suite but pass in isolation

## Context

Verifying a compiled-binary native-location lifecycle test and platform CI steps.
The new focused binary test passed on Linux.

## Friction

The first full affected verification reported 157 existing CLI test failures
with the workspace fixture guard, then exited 130. A focused run of the sync
handler file using the repository CI execution profile reported 20 failures and
29 passes with the same guard. One failing test passed alone. The full file
passed all 49 tests with temporary working-directory diagnostic logging.

## Outcome

Removed the diagnostic logging and restarted full affected verification using
the repository CI profile with one Nx task at a time. That run is pending.
The cause of the inconsistent guard results is unknown.

## Evidence

- Guard: `Project workspace tests must set wsOptions.projectRoot or chdir into a temp dir before calling makeWorkspaceHandlerTestContext().`
- Owner: `apps/cli/src/test-support/test-helpers.ts`.
- Focused file: `apps/cli/src/root/sync/handler.test.ts`.
- Logs: `/tmp/native-case-platform-verify-affected.log`,
  `/tmp/native-case-platform-sync-diagnostic.log`,
  `/tmp/native-case-platform-sync-single-diagnostic.log`, and
  `/tmp/native-case-platform-sync-cwd-diagnostic.log`.
