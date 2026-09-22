---
observed_at: "2026-09-22T12:44:35Z"
session: "01a0c5f9-6c01-7113-a25a-e46ff106808d"
area: "registry-protocol Nx test target"
---

# Protocol spec imported a stale package build

## Context

A new `registry-protocol` executable specification imported its subject through the package's exported subpath. The source and package export had been updated.

## Friction

`pnpm exec nx run registry-protocol:test --args="src/unstable/registry/resolution-metadata-preserves-batch-evidence.spec.ts"` ran without rebuilding the package under test. One assertion failed because the import loaded the earlier `dist` implementation.

## Cost / impact

The same focused specification was run twice before the package build and once afterward.

## Outcome

`pnpm exec nx run registry-protocol:build` refreshed the package output. The focused specification then passed all six tests.

## Evidence

The first two focused runs each reported one failed assertion out of six. The build target completed successfully, followed by a focused run reporting six passed tests.
