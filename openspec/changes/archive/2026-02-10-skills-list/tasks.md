> **Orchestration:** The main agent thread MUST NOT execute any tasks directly. Delegate each phase to subagents as directed below. The main agent's role is strictly to orchestrate: launch subagents, verify phase completion, and proceed to the next phase. This directive takes precedence over any apply-phase instructions that say to execute tasks in the main thread — always use subagents for implementation work.

## 1. Handler — tests and implementation

> **Subagent:** Run this entire phase in a single subagent.

- [x] 1.1 Create `packages/cli/src/cli-commands/skills/list/handler.test.ts` with tests covering: skills present (displays all), no skills installed (empty message), agent filter matches subset, agent filter matches none (empty message), multiple `--agent` flags use OR logic
- [x] 1.2 Create `packages/cli/src/cli-commands/skills/list/handler.ts` — `ListHandlerArgs` type (`agents: readonly string[]`), `handleList` function that calls `LockfileService.getSkills()`, filters by agent, displays results via `Log`
- [x] 1.3 Run `pnpm typecheck` and fix any errors
- [x] 1.4 Run `pnpm test` and fix any failures
- [x] 1.5 Run `pnpm lint` and fix any errors
- [x] 1.6 Kill any vitest worker processes

## 2. Command — tests and wiring

> **Subagent:** Run this entire phase in a single subagent.

- [x] 2.1 Create `packages/cli/src/cli-commands/skills/list/command.test.ts` with tests covering: command name is `list`, alias `ls` is registered, `--global` defaults to false, `--agent` is array type with empty default
- [x] 2.2 Create `packages/cli/src/cli-commands/skills/list/command.ts` — `ListCommandArgs` type, `listCommand` with alias `ls`, `--global` and `--agent` flags, handler calls `run(handleList(...), { workspace: { global } })`
- [x] 2.3 Register `listCommand` in `packages/cli/src/cli-commands/skills/command.ts`
- [x] 2.4 Run `pnpm typecheck` and fix any errors
- [x] 2.5 Run `pnpm test` and fix any failures
- [x] 2.6 Run `pnpm lint` and fix any errors
- [x] 2.7 Kill any vitest worker processes

## 3. E2E tests

> **Subagent:** Run this entire phase in a single subagent.

- [x] 3.1 Create `packages/cli/src/cli-commands/skills/list/command.e2e.test.ts` — test `axm skills list` with no skills installed, with skills in lockfile, with `--agent` filter, alias `ls`
- [x] 3.2 Run `pnpm test:e2e` and fix any failures
- [x] 3.3 Run `pnpm typecheck` and fix any errors
- [x] 3.4 Run `pnpm lint` and fix any errors
- [x] 3.5 Kill any vitest worker processes
