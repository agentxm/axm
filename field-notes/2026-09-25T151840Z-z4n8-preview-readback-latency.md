---
observed_at: "2026-09-25T15:18:40Z"
session: "z4n8"
area: "public branch preview publication"
---

# Preview publication outlasted its npm readback window

## Context

The branch preview workflow published the public package cohort after exact-commit CI passed.

## Friction

The first npm publish command reported success for `@agentxm/extension-model`, but the workflow timed out after 120 seconds without reading that version back from the public registry. The version appeared in the registry after the workflow failed.

## Cost / impact

The preview cohort remained incomplete and the consuming repository could not pin it. Publication needs another commit, CI run, and preview attempt.

## Outcome

The branch preview publisher's npm readback window was increased to five minutes. Verification and the next preview attempt remain pending.

## Evidence

Release workflow run `36152847073` failed at `Publish Bootstrap Prerelease` with `Published content readback timed out` for `@agentxm/extension-model@0.34.0-preview.36152847073.b66280158a5f`. The public registry later returned that version with a publication timestamp of `2026-09-25T15:20:53.819Z`.
