---
observed_at: "2026-09-25T01:40:00Z"
session: "ti9x"
area: "codebase: packages/core/workspace reconciliation retirement and materialization"
---

# Retirement and materialization both withdrew the same superseded lock row

## Context

Making one `desiredReachesAcceptedRow` predicate serve the install-root
inventory, unreachable-row retirement, and the lockfile-alignment lint. A
workspace-authored declaration no longer reaches an external accepted row of
its name, so sync now plans that row's retirement.

## Friction

`apps/cli/src/root/sync/handler.test.ts` ("removes a stale external lock row
when settings declare workspace authority") failed with `Accepted skill review
changed before retirement (conflict)`. The materialize step for the authored
skill already withdraws the superseded row through `recordMaterialization`,
and the retirement step, planned from the same graph and ordered after it,
found the row gone and refused. The two owners of that withdrawal were not
visible from either module.

## Cost / impact

One failed full CLI run, two focused reruns, and a design detour to decide
which step owns the withdrawal.

## Outcome

Retirement treats a row that is already absent at transition time as retired
and removes only the rows that remain; the test now expects two applied steps.
The materialize-time withdrawal was left in place because install and adopt
flows rely on it outside sync.

## Evidence

`pnpm exec nx run cli:test --args='src/root/sync/handler.test.ts'` before and
after the retirement change; `packages/core/workspace/src/reconciliation/retirement.ts`
transition block and `reconciliation/extensions/declaration.ts`
`recordMaterialization`.
