---
observed_at: "2026-09-25T20:31:35Z"
session: "01a0d9de-cc8e-7ca0-b584-d186f30c10c3"
area: "AXM CLI end-to-end task interface"
---

# The aggregate e2e target ignored a focused test filter

## Context

The home and environment consolidation plan called for the relocation specification through `cli-e2e:e2e` with a file filter.

## Friction

`cli-e2e:e2e` is an `nx:noop` aggregate depending on `e2e-main`, binary smoke, and install verification. Passing `--args='src/environment-relocates-user-resources.spec.ts'` to the aggregate did not pass the filter to `e2e-main`; its Vitest process ran without a file argument.

## Cost / impact

The focused check expanded into the full CLI end-to-end suite, including compilation and the binary and installer lanes. The run was still active at capture.

## Outcome

The full aggregate run was allowed to finish; its result was pending at capture.

## Evidence

The command was `pnpm exec nx run cli-e2e:e2e --args='src/environment-relocates-user-resources.spec.ts'`. The project target is `nx:noop` with three dependencies, and the running Vitest process had `run` without the requested file argument.
