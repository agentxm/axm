---
observed_at: "2026-09-26T22:31:04Z"
session: "wssp"
area: "repository lint policy tests during a package split"
---

# Lint policy cases that name a missing file pass without linting it

## Context

The agent session was moving lint enforcement from `packages/core/workspace` to `workspace-kernel`, `extension-kinds`, and `workspace-features`, and was adding negative cases to `scripts/module-boundaries.test.ts`. The policy tests call `ESLint.lintText(code, { filePath })` and keep only `@nx/enforce-module-boundaries` messages.

## Friction

Before the edit, the case "permits a core capability importing a supporting capability" linted `packages/core/workspace/src/sync/index.ts`, a path that no longer existed, and passed its `toEqual([])` assertion. The two new negative cases first named `materialization/managers.test.ts` and `skills/manager.test.ts`, which also do not exist, and failed with `expected [] to not deeply equal []`. For a file that does not exist the only message is a parser error, which the filter drops, so an empty result means the same thing as "allowed".

## Cost / impact

One extra run of `pnpm exec nx run axm:test`. A case that expects no violation cannot tell a missing fixture file from a permitted import.

## Outcome

The cases now name files that exist (`workspace-kernel/src/sources/index.ts`, `materialization/manager-kit.test.ts`, `extension-kinds/src/skills/source-hash.test.ts`), and `axm:test` passed 451 of 451.

## Evidence

`module-boundaries.test.ts > reports the workspace kernel importing an extension kind or a feature: packages/core/workspace-kernel/src/materialization/managers.test.ts: expected [] to not deeply equal []`.
