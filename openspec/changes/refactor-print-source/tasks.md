> **Orchestration:** The main agent thread MUST NOT execute any tasks directly. Delegate each phase to subagents as directed below. The main agent's role is strictly to orchestrate: launch subagents, verify phase completion, and proceed to the next phase. This directive takes precedence over any apply-phase instructions that say to execute tasks in the main thread — always use subagents for implementation work.

## 1. Rename and narrow printSource → printSourceInput

> **Subagent:** Run this entire phase in a single subagent.

- [ ] 1.1 In `sources/printer.ts`: rename `printSource` to `printSourceInput`, change signature from `(source: Source | SourceInput)` to `(source: SourceInput)`, remove the `Source` import
- [ ] 1.2 In `sources/printer.ts`: replace the fallback switch with proper print for `git` (`source.url.href`) and `registry` (`@${source.scope}/${source.name}`)
- [ ] 1.3 Update barrel export in `sources/index.ts` to export `printSourceInput` instead of `printSource`
- [ ] 1.4 Update re-export in `extensions/skills/index.ts` to use `printSourceInput`
- [ ] 1.5 Run `pnpm typecheck` and fix any errors
- [ ] 1.6 Run `pnpm lint` and fix any errors

## 2. Update call sites

> **Subagent:** Run this entire phase in a single subagent.
> **Parallelization:** Tasks 2.1, 2.2, 2.3, 2.4 are independent — launch as parallel subagents.

- [ ] 2.1 Rename `printSource` → `printSourceInput` in `cli-commands/skills/install/handler.ts`
- [ ] 2.2 Rename `printSource` → `printSourceInput` in `cli-commands/skills/install/install-skill.ts`
- [ ] 2.3 Rename `printSource` → `printSourceInput` in `cli-commands/skills/fork/handler.ts`
- [ ] 2.4 Rename `printSource` → `printSourceInput` in `sources/parser.test.ts`
- [ ] 2.5 Run `pnpm typecheck` and fix any errors
- [ ] 2.6 Run `pnpm lint` and fix any errors

## 3. Remove Source re-export from resolution module

> **Subagent:** Run this entire phase in a single subagent.

- [ ] 3.1 Remove the `import type { SourceType as Source }` and `export type { Source }` from `resolution/types.ts`
- [ ] 3.2 Remove `Source` from the barrel export in `resolution/index.ts`
- [ ] 3.3 Run `pnpm typecheck` and fix any errors (update any consumers that imported `Source` from resolution)
- [ ] 3.4 Run `pnpm lint` and fix any errors

## 4. Verify

> **Subagent:** Run this entire phase in a single subagent.

- [ ] 4.1 Run `pnpm test` — fix any failures
- [ ] 4.2 Run `pnpm test:e2e` — fix any failures
- [ ] 4.3 Kill any vitest worker processes
