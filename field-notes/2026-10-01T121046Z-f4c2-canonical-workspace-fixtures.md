---
observed_at: "2026-10-01T12:10:46.058240+00:00"
session: "01a0f71d-09f4-70b2-bc4c-ce6fad93dc54"
area: "Extension-kind verification"
---

# Temporary workspace aliases break manager fixture expectations on macOS

## Context

Run affected verification on Node 24.19.0. Production `makeWorkspaceLocation` resolves the selected workspace's physical location before supplying `baseDir`.

## Friction

Six test failures compared unresolved temporary roots with canonical native paths: `/var/folders/...` versus `/private/var/folders/...`. Relative output escaped the fixture root; one uninstall failed relative-path validation. Three graph-projection tests also exceeded the local five-second timeout during concurrent affected verification.

## Cost / impact

The affected workflow failed. Its extension-kind report contained nine failures in six files.

## Outcome

Canonicalized temporary roots in four manager fixture files without changing assertions. A focused six-file run with one worker passed all 54 tests in 27.90 seconds. The three previously timed-out scenarios measured 1.286 seconds, 1.209 seconds, and below the five-second limit for the remaining scenario. Timeout values remain unchanged.

## Evidence

`extension-kinds:test` passed; `makeWorkspaceLocation` calls `resolveNativeReferent` before assigning `baseDir`.
