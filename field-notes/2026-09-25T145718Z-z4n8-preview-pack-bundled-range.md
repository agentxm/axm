---
observed_at: "2026-09-25T14:57:18Z"
session: "z4n8"
area: "public branch preview publication"
---

# Preview packaging retained a cohort range from a bundled package

## Context

The branch preview workflow attempted to publish the exact public package cohort from a successful CI commit.

## Friction

The publication job stopped before npm publication because its pack validator found `@agentxm/extension-content@^0.34.0-preview.36149789918.f9520a18e46d` in the packed CLI, while preview cohort dependencies must be exact.

## Cost / impact

The preview did not publish. The publisher needed another commit and exact-commit CI run before retrying.

## Outcome

The publisher now stamps bundled production package references to the exact preview version during packing and restores their source manifests afterward. Its typecheck and 20 focused release-package tests pass; a new CI run is pending.

## Evidence

Release workflow run `36149789918` failed in `Publish Bootstrap Prerelease` with `Packed bootstrap cohort dependency must be exact`. Commit `b66280158` contains the publisher change.
