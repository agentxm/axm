---
observed_at: "2026-09-26T13:36:07Z"
session: "6f2c"
area: "pre-commit verification"
---

# Nx database error stopped a validated commit

## Context

The product branch had passed `pnpm run verify:affected` and attempted to commit a specification assertion update.

## Friction

The pre-commit hook passed lint-staged, AXM lint, and staged secret scanning, then stopped with an Nx SQLite foreign-key constraint error.

## Cost / impact

The commit failed after 23 seconds and required a retry.

## Outcome

`pnpm exec nx reset` completed; the commit retry was pending at capture time.

## Evidence

Pre-commit output: `NX DB transaction error: SqliteFailure(... FOREIGN KEY constraint failed)`; `husky - pre-commit script failed (code 1)`.
