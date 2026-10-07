---
observed_at: "2026-10-07T12:09:00Z"
session: "r42v"
area: "CLI release verification"
---

# Local release verification exceeds the workstation timeout

## Context

Verify the generated `cli-v0.42.0` candidate at
`988fdf5ceb27326eab4a03d0dba067a32afa4bcf` in a new isolated worktree.

## Friction

`pnpm run verify:affected` stopped at the captured external native-root rollback
scenario in `workspace-kernel:test`. The scenario exceeded the workstation's
5,000 ms limit both in the broad run and when its specification ran alone.

## Cost / impact

The broad source invocation stopped after 3m 8s, leaving dependent tasks
unexecuted and interrupting `workspace-features:test`. A focused reproduction
took 18.9s and failed at the same limit.

## Outcome

The same focused target passed all eight scenarios with the repository's
existing `CI=true` execution profile. The rollback scenario completed in
5,363 ms. Full local verification will use that profile; no source, assertion,
or committed timeout was changed.

## Evidence

- `packages/core/workspace-kernel/src/projection/captured-external-native-roots.spec.ts`
- `vitest.execution.ts`: workstation timeout 5,000 ms; CI timeout 20,000 ms.
- Focused command: `pnpm exec nx run workspace-kernel:test --args='src/projection/captured-external-native-roots.spec.ts'`.
- Initial broad run: 2,335 passing kernel tests, one timeout, four skipped.
