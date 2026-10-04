---
observed_at: "2026-10-04T05:04:15Z"
session: "q8m2"
area: "AXM merge-queue source verification"
---

# Pack recovery exceeded its deadline in the merge queue

## Context

PR #509 passed hosted pull-request CI and entered the native merge queue at source `c836a920254e54e4d100a9dc6591f8c853d46f49`.

## Friction

The synthesized revision `977a48c8e8584085b160affaefc4d5d5d5300258` failed source verification: `Lockfile rejection recovery routes > re-accepts installed Packs and their complete shared instruction contributors` exceeded the existing 20,000 ms deadline. The workspace-features result was 3,163 passed, one failed, and one existing skip.

## Outcome

The required integration gate failed and the pull request remained open. The exact failed source log was preserved for investigation; the deadline was unchanged.

## Evidence

[Merge-queue run 37176616886](https://github.com/agentxm/axm/actions/runs/37176616886), source job `111360538490`; `src/sync/lockfile-rejections-name-recovery-routes.spec.ts:117`.
