> **Orchestration:** The main agent thread MUST NOT execute any tasks directly. Delegate each phase to subagents as directed below. The main agent's role is strictly to orchestrate: launch subagents, verify phase completion, and proceed to the next phase. This directive takes precedence over any apply-phase instructions that say to execute tasks in the main thread — always use subagents for implementation work.

## 1. Build expanded glob candidate discovery for `skills fork`

> **Subagent:** Run this entire phase in a single subagent.

- [ ] 1.1 Add/red tests in `packages/cli/src/cli-commands/skills/fork/handler.test.ts` for glob candidate discovery from: lockfile skills, unmanaged configured settings skills, and unmanaged on-disk skills in configured agent directories
- [ ] 1.2 Add/red tests for dedupe behavior when the same skill name appears in multiple candidate sources
- [ ] 1.3 Implement discovery helper(s) used by `handleFork` to build a combined deduplicated local candidate set for glob sources
- [ ] 1.4 Run `pnpm typecheck` immediately after implementation changes and fix any errors
- [ ] 1.5 Integrate the helper into `packages/cli/src/cli-commands/skills/fork/handler.ts` glob branch (replace lockfile-only candidate enumeration)
- [ ] 1.6 Run `pnpm typecheck` immediately after implementation changes and fix any errors
- [ ] 1.7 Run `pnpm typecheck` and fix any errors
- [ ] 1.8 Run `pnpm lint` and fix any errors
- [ ] 1.9 Run `pnpm test` and fix any failures
- [ ] 1.10 Run `pnpm test:e2e` and fix any failures
- [ ] 1.11 Kill any vitest worker processes

## 2. Update fork matching and error/reporting semantics

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 1

- [ ] 2.1 Add/red tests in `packages/cli/src/cli-commands/skills/fork/handler.test.ts` for `NO_SKILLS_MATCHED` `Available:` output using the expanded candidate set
- [ ] 2.2 Add/red tests ensuring non-glob source behavior remains unchanged
- [ ] 2.3 Implement deterministic candidate ordering for glob matching and error output in `packages/cli/src/cli-commands/skills/fork/handler.ts`
- [ ] 2.4 Run `pnpm typecheck` immediately after implementation changes and fix any errors
- [ ] 2.5 Update command help/examples in `packages/cli/src/cli-commands/skills/fork/command.ts` to reflect expanded local matching semantics for glob sources
- [ ] 2.6 Run `pnpm typecheck` immediately after implementation changes and fix any errors
- [ ] 2.7 Run `pnpm typecheck` and fix any errors
- [ ] 2.8 Run `pnpm lint` and fix any errors
- [ ] 2.9 Run `pnpm test` and fix any failures
- [ ] 2.10 Run `pnpm test:e2e` and fix any failures
- [ ] 2.11 Kill any vitest worker processes

## 3. Add end-to-end coverage for unmanaged skill glob forking

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 2

- [ ] 3.1 Add/red e2e test(s) in `packages/cli/src/cli-commands/skills/fork/fork.e2e.test.ts` covering glob fork with unmanaged configured/on-disk skills
- [ ] 3.2 Add/red e2e test for glob no-match path showing expanded `Available:` candidates
- [ ] 3.3 Implement any fixture/setup updates in `packages/cli/src/e2e/fixtures/` needed to represent unmanaged configured and on-disk skills
- [ ] 3.4 Run `pnpm typecheck` immediately after implementation changes and fix any errors
- [ ] 3.5 Run `pnpm typecheck` and fix any errors
- [ ] 3.6 Run `pnpm lint` and fix any errors
- [ ] 3.7 Run `pnpm test` and fix any failures
- [ ] 3.8 Run `pnpm test:e2e` and fix any failures
- [ ] 3.9 Kill any vitest worker processes
