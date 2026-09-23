---
observed_at: "2026-09-23T23:13:02Z"
session: "unknown"
area: "cli-e2e Nx targets"
---

# A file filter passed to cli-e2e:e2e runs the whole suite

## Context

A review needed at most three focused end-to-end files run through
`pnpm exec nx run cli-e2e:e2e --args="<files>"`.

## Friction

`cli-e2e:e2e` is an `nx:noop` aggregate that depends on `e2e-main`,
`binary-smoke`, and `install-suite`. The `--args` value never reached
`e2e-main`, so the whole main suite ran.

## Cost / impact

The run took 5m 19s and covered 65 test files instead of three. The same full
run had to be repeated to verify a fix.

## Outcome

Both runs finished and their full-suite results were used as evidence.

## Evidence

```text
Test Files  1 failed | 64 passed (65)
Run duration:      5m 19s
```

`apps/cli-e2e/project.json` defines `e2e` with `"executor": "nx:noop"`.
