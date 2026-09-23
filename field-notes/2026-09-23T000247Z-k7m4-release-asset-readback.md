---
observed_at: "2026-09-23T00:02:47Z"
session: "k7m4"
area: "AXM CLI release publication"
---

# Release asset readback timed out after upload

## Context

The canonical publication workflow was distributing `cli-v0.34.0` from release commit `33cd67cb47354e8217376170300b8ad2461ceb55` after successful exact-commit CI.

## Friction

The `Publish Release Assets` job uploaded release assets, then failed while checking `cli-reference.json` with `Published content readback timed out`. The workflow left the GitHub Release in draft state and reported artifact distribution failed, with npm and Homebrew pending.

## Cost / impact

The stable release was incomplete, and a separate exact-tag recovery run was required. The failed distribution target ran for 1 minute 32 seconds.

## Outcome

A later `gh release download` of `cli-reference.json` succeeded, and its SHA-256 matched the file in the release commit. The canonical `stable-recovery` workflow was dispatched for `cli-v0.34.0`; its outcome was pending when this note was written.

## Evidence

Automatic publication run `35799823389` failed in `axm:distribute-release` with `Published content readback timed out: cli-reference.json.` Recovery run `35800236357` was started for the same tag.
