---
observed_at: "2026-10-07T21:22:35Z"
session: "ec304b"
area: "CLI failure diagnostics integration"
---

# Diagnostic annotation dropped a non-enumerable error cause

## Context

Adding one diagnostic identity to a terminal CLI error while retaining its original evidence.

## Friction

The annotation copied an Error with object spread. Error.cause was non-enumerable and did not reach the copied error. Process checks in draft PR #538 failed their cause and stack assertions. Local evidence had been prepared before the copy, so the retained record did not expose the output regression.

## Cost / impact

The source and process gates required another correction and verification pass. The source affected run also surfaced forty failed CLI checks covering missed command registers and changed diagnostic expectations; these were not all caused by the annotation copy.

## Outcome

The annotation now copies cause explicitly. A focused regression retains the exact cause reference, and thirty-five real-process checks covering detail controls, local review/export, activation and lockfile rejection passed. Full affected and protected delivery checks remain pending.

## Evidence

`apps/cli/src/cli-runtime/terminal-diagnostics.ts`, its non-enumerable-cause regression in `terminal-diagnostics.test.ts`, and CI run `37685559368`.
