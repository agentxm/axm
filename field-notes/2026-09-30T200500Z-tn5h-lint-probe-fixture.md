---
observed_at: "2026-09-30T20:05:00Z"
session: "tn5h"
area: "lint observation test fixture"
---

# Probe relocation exposed an unsupported fixture operation

## Context

Verifying the native-boundary delivery after moving each symlink probe into its
own temporary child of the existing native root.

## Friction

Hosted source verification failed the lint workspace's observe-once control with
`not implemented`. Its fake filesystem converted unsupported operations into
typed refusals but did not cover the probe's new `makeTempDirectory` call.

## Cost / impact

The hosted feature suite recorded 2,865 passes, one failure and one existing
skip. The local full source run was stopped before correcting the fixture;
neither run establishes full verification.

## Outcome

The complete five-case lint owner file reproduced one failure locally. Adding
the missing typed filesystem refusal made all five cases pass without changing
the observe-once assertion or runtime code.

## Evidence

- Hosted source run: <https://github.com/agentxm/axm/actions/runs/36766475587>
- Control: `packages/core/workspace-features/src/linting/catalog/workspace-read-model/lint-workspace.test.ts`
