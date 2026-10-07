---
observed_at: "2026-10-07T14:04:19Z"
session: "r42v"
area: "CLI release publication"
---

# Acknowledged npm publication exceeded its visibility window

## Context

Publish `cli-v0.42.0` from commit
`36a51b900214587a139bdcffc501d7eb1b193f40` using canonical workflow run
37629789428 and successful exact-commit CI run 37624800879.

## Friction

npm acknowledged all five cohort uploads. The publisher failed at
`axm.sh@0.42.0` readback after 70 attempts in 360,002 ms, with the last
observation `absent`. Nx's static output delivered the distribution command
log together at failure, so intermediate command output was unavailable from
the completed-job log during the wait.

## Cost / impact

The run ended before Homebrew, final GitHub Release publication, and the ten
hosted installation checks. R2 distribution and four npm coordinates were
already publicly available. Independent R2 hash and fresh-install checks
passed; those checks did not establish complete release publication.

## Outcome

Read-only observation found `axm.sh@0.42.0` with `latest=0.42.0` at
14:04:19Z. npm metadata records publication at 14:04:16.290Z, after the
14:01:40Z readback failure. The documented `stable-recovery` workflow was
then dispatched for the same tag, without manually republishing or changing
release identity. Recovery is pending at capture.

## Evidence

- https://github.com/agentxm/axm/actions/runs/37629789428
- `scripts/distribute-release.ts`: dependency-order npm readback budget 360,000 ms.
- `https://registry.npmjs.org/axm.sh?write=true`: exact version and integrity became visible.
