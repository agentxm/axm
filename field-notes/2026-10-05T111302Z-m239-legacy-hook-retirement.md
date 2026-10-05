---
observed_at: "2026-10-05T11:13:02.738616+00:00"
session: "axm039-upgrade"
area: "axm-cli-interactions"
---

# Disabled legacy hook leaves native commands and an unsupported region

## Context

Migrating a no-op example hook to AXM 0.39 native implementations and making it opt-in while retaining OpenCode among the configured agents.

## Friction

`axm hooks disable` succeeded but left old native commands carrying `x-axm` markers in Claude, Gemini, and Codex settings. Sync rejected the old `hook-fallbacks` instruction region as an invalid or missing region. Instruction adoption could not adopt that legacy region.

## Cost / impact

The three native files and the fully generated instruction file had to be inspected and preserved outside the workspace before regeneration. The hook was not fully disabled in native outputs by the successful disable command alone.

## Outcome

Only files wholly owned by the proven legacy hook were retired. Sync regenerated the current rules region and the disabled-hook workspace passed lint and no-change preview.

## Evidence

AXM 0.39.0 reported `AXM region marker has an invalid or missing region` during sync. The retained native commands referenced `.axm/extensions/` paths.
