---
observed_at: "2026-09-26T22:12:37Z"
session: "wssp"
area: "path-sensitive tests during a multi-step package split"
---

# Kernel tests that read files by path broke at the split and first failed a later step's gate

## Context

The agent session was rewriting import specifiers and service identity strings after `packages/core/workspace` had been split into `workspace-kernel`, `extension-kinds`, and `workspace-features`. The step's verification ended with the test targets of the three new packages. The split step before it had been verified with install and sync checks only, and the plan assigned repository path literals to a step after this one.

## Friction

`workspace-kernel:test` failed with 21 failures in 4 files. None came from an import. Each test built a filesystem path relative to its own location or to the old package root: `projection/conformance.test.ts` read `packages/core/workspace/src/...` and a nested `agent-adapters` folder; `workspace-state/examples.test.ts` read example files that had moved under `desired/`; `workspace-state/desired/settings/generated-schema.test.ts` climbed one directory too few to reach `apps/cli`; and `sources/git/operations.test.ts` loaded `dist/src/resolution/sources/git/operations.js` and `dist/src/lifecycle/install/git-discovery.js` from the kernel's own `dist`. The second of those two modules now lives in the features package, so no path inside the kernel could load it.

## Cost / impact

The four files were not on any step's list. The agent fixed the paths inside this step and moved one test case from the kernel's Git test to the features package's `git-discovery.test.ts`, because its subject is feature code.

## Outcome

After the edits `pnpm exec nx run-many -t test --projects=workspace-kernel,extension-kinds,workspace-features` passed: 195, 17, and 345 test files.

## Evidence

Failures included `ENOENT ... packages/core/workspace/src/instructions/manager.ts`, `ENOENT ... packages/apps/cli/site-content/__generated__/schemas/axm-lock.schema.json`, and `ERR_MODULE_NOT_FOUND ... packages/core/dist/src/lifecycle/install/git-discovery.js`.
