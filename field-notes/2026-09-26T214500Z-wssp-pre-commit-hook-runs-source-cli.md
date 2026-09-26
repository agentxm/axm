---
observed_at: "2026-09-26T21:45:00Z"
session: "wssp"
area: "commit hooks during a multi-step package split"
---

# The pre-commit hook needs a loadable source CLI, so a move-only commit cannot land

## Context

The agent session moved every folder of `packages/core/workspace` into `workspace-kernel`, `extension-kinds`, and `workspace-features` with `git mv`. The step plan said the tree would not compile until the next step rewrote import specifiers, told the agent not to start that rewrite, and required a normal commit without `--no-verify`.

## Friction

The husky pre-commit hook runs `pnpm axm:local lint --view git-index --strict`, which starts the CLI from source with Bun. After the moves the CLI stopped at load time with `Cannot find module '@agentxm/workspace/transitions/settlement/live' from '.../apps/cli/src/runtime.ts'`, so no commit containing the moves could pass the hook. The hook's `lint-staged` step also lints every renamed file, and 17 files failed on ESLint path exceptions that still named `packages/core/workspace/src`.

## Cost / impact

The move-only commit the plan described was not possible without bypassing the hook. The agent pulled the mechanical import-specifier rewrite and the ESLint path exceptions for the moved files forward from the two later steps into the same commit.

## Outcome

With relative specifiers recomputed from the staged rename map, cross-package imports mapped to package entry points, consumer specifiers mapped to the new packages, and the ESLint path exceptions pointed at the new paths, the source CLI loaded, `axm lint --view git-index --strict` reported no findings, and the commit passed the hook.

## Evidence

`.husky/pre-commit` runs `pnpm exec lint-staged --no-stash`, `pnpm axm:local lint --view git-index --strict`, and `pnpm exec nx run axm:scan-secrets:staged`. `scripts/axm-local-shared.ts` launches `bun --conditions=axm-source apps/cli/src/main.ts` with no prebuilt fallback.
