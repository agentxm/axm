---
observed_at: "2026-10-02T23:55:13Z"
session: "01a0fe8f-fd66-7563-a607-1751aa619aab"
area: "official skill test composition"
---

# Built-in Registry was initially supplied through the wrong fixture boundary

## Context

Official-skill lint fixtures needed a Registry endpoint matching their accepted lock rows after source binding became strict.

## Friction

The agent initially added `agentxm` to fixture settings instead of the runtime's `builtInSources`. Settings rejected the reserved source name with `SettingsDecodeError`.

## Cost / impact

The focused ten-file run passed 79 tests but failed all 22 official-skill tests at settings admission, requiring a fixture correction and another focused run.

## Outcome

Removed the settings declaration and supplied the built-in endpoint through `WorkspaceStateLive` in the lint fixture composition. Both official-skill files then passed all 22 tests in 36.87 seconds.

## Evidence

`workspace-features:test` ran the two official-skill specification files with one worker. Production CLI composition already supplies built-in sources through the runtime boundary.
