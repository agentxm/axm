---
observed_at: "2026-09-22T12:50:34Z"
session: "01a0c5f9-6c01-7113-a25a-e46ff106808d"
area: "executable-specification import guidance and Nx lint"
---

# Same-package specification import guidance conflicted with lint

## Context

A new specification in `registry-protocol` imported the contract through the package's exported subpath, following the repository's executable-specification binding guidance.

## Friction

`registry-protocol:lint` failed with two `@nx/enforce-module-boundaries` errors. The rule required relative imports for files in the same project.

## Cost / impact

The first `verify:affected` run stopped after the lint failure and did not run the remaining affected targets.

## Outcome

The two imports were changed to relative same-package paths. The focused `registry-protocol:lint` target then passed.

## Evidence

The failed affected run named `resolution-metadata-preserves-batch-evidence.spec.ts` lines 11 and 13 and reported two `@nx/enforce-module-boundaries` errors; the subsequent focused lint run exited successfully.
