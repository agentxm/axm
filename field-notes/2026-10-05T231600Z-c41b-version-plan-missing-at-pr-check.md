---
observed_at: "2026-10-05T23:16:00Z"
session: "c41b7d2e"
area: "affected verification and release planning"
---

# PR verification found a missing version plan

## Context

Delivering a CLI behavior change with changes to the CLI and extension-model release projects. Local delivery used `pnpm run verify:affected`.

## Friction

Both hosted proposed-change source partitions stopped at `pnpm run release:plan:check`: the touched CLI and extension-model projects had no version plan. The local affected workflow does not include that check.

## Outcome

Generated a version plan through `pnpm run release:plan major --message ...`, following the release runbook. No release was published. The PR requires fresh checks after adding the plan.

## Evidence

Public PR #520, CI run 37386974066, jobs 112022671131 and 112022671016 reported `Touched projects missing version plans`.
