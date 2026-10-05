---
observed_at: "2026-10-05T11:13:02.738616+00:00"
session: "axm039-upgrade"
area: "axm-cli-interactions"
---

# Legacy instruction adoption requires lock recovery first

## Context

Upgrading AXM workspaces with incompatible old lockfiles and managed instruction regions lacking current source ownership metadata.

## Friction

After preserving and removing the incompatible lockfile, instruction adoption required accepted contributor authority. Sync could not establish that authority while the legacy instruction region remained. Disabling instruction management did not prevent sync from inspecting the old region.

## Cost / impact

The recovery required preserving the entire instruction file outside the workspace, syncing with management disabled, restoring the file, adopting its rules and knowledge regions, enabling management again, and syncing.

## Outcome

Two workspaces recovered successfully through that sequence. No authored instruction content was discarded.

## Evidence

AXM 0.39.0 returned conflicts from `axm instructions adopt rules --preview --json` before recovery. Subsequent adoption and sync returned successful plan results.
