---
observed_at: "2026-10-01T05:14:52Z"
session: "d82a"
area: "Local source verification"
---

# Local test runtime and fixture budgets required separate verification

## Context

Running affected verification for the coding-agent catalog refresh.

## Friction

A full local feature run reported 2,855 passes, one skip, seven stale assertions
and five timeouts after 33 minutes 38 seconds. Isolated baseline main completed
two projection cases in 14.568 and 14.473 seconds against their 15-second limit;
the candidate exceeded it. Restricting the fixture's catalog inventory left
only about 0.3 seconds of margin and was reverted.

The local `mise exec -- pnpm` invocation selected a Node 22.23.1 child through
the workstation PATH, although direct `mise exec -- node` reported the pinned
24.19.0. The child executable was verified from its live process. Correcting
PATH selected Node 24, but two-worker execution still timed out in four cases.
A two-worker 20-second trial also failed; it is not passing evidence.

## Outcome

The command now puts the repository-pinned Node directory first after entering
mise. No workstation configuration was changed. GitHub's pinned mise action
prepends its shims, and source CI already selects one Vitest worker.

With Node 24 and one worker, all 36 selected cases passed in 164.55 seconds.
Completed slow cases were Knowledge projection 17.198 seconds, Pack switching
15.670 seconds and Rule projection 15.412 seconds. The three multi-operation
fixtures use the existing CI profile's 20-second budget; their assertions are
unchanged. No production performance code was changed. Full affected and
required platform verification remain separate gates.

## Evidence

The fixtures are `projection-currency-follows-state-authority.spec.ts`,
`pack-source-switches-are-member-diffed.spec.ts`, and
`secret-namespaces-include-local-and-source-identity.spec.ts` in
`workspace-features`. Repository `.github/workflows/ci.yml` owns the source
CI worker settings. The pinned mise-action source excludes PATH from its env
export and prepends shims through the GitHub Actions PATH interface.
