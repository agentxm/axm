> **Orchestration:** The main agent thread MUST NOT execute any tasks directly. Delegate each phase to subagents as directed below. The main agent's role is strictly to orchestrate: launch subagents, verify phase completion, and proceed to the next phase. This directive takes precedence over any apply-phase instructions that say to execute tasks in the main thread — always use subagents for implementation work.

## 1. Operation Test Baseline

> **Subagent:** Run this entire phase in a single subagent.

Depends on: None (start here)

- [ ] 1.1 Add/red operation tests for `NewSkillOperation`, `NewPackOperation`, `AddToPackOperation`, and `RemoveFromPackOperation` covering success, no-op, and error paths
- [ ] 1.2 Add/red operation tests for stale-manifest conflict handling in pack add/remove apply paths
- [ ] 1.3 Add/red operation tests for `enable-skill` / `disable-skill` matrix paths (lock-backed, no-lock settings-only, implicit promotion, missing source failure)
- [ ] 1.4 Run `pnpm typecheck` and fix any errors
- [ ] 1.5 Run `pnpm lint` and fix any errors
- [ ] 1.6 Run `pnpm test` and fix any failures
- [ ] 1.7 Run `pnpm test:e2e` and fix any failures
- [ ] 1.8 Kill any vitest worker processes

## 2. Implement New Plan Operations

> **Subagent:** Run this entire phase in a single subagent.
> **Parallelization:** Tasks 2.2, 2.4, 2.6, and 2.8 are independent — launch as parallel subagents.

Depends on: Phase 1

- [ ] 2.1 Add operation type exports/placeholders in feature operation barrels for new operations
- [ ] 2.2 Run `pnpm typecheck` immediately after task 2.1 and fix any errors
- [ ] 2.3 Implement `NewSkillOperation` handler with skill scaffolding side-effects moved out of `skills new` handler
- [ ] 2.4 Run `pnpm typecheck` immediately after task 2.3 and fix any errors
- [ ] 2.5 Implement `NewPackOperation` handler with pack scaffolding side-effects moved out of `packs new` handler
- [ ] 2.6 Run `pnpm typecheck` immediately after task 2.5 and fix any errors
- [ ] 2.7 Implement `AddToPackOperation` handler to apply precomputed manifest-add delta
- [ ] 2.8 Run `pnpm typecheck` immediately after task 2.7 and fix any errors
- [ ] 2.9 Implement `RemoveFromPackOperation` handler to apply precomputed manifest-remove delta
- [ ] 2.10 Run `pnpm typecheck` immediately after task 2.9 and fix any errors
- [ ] 2.11 Add optimistic manifest precondition validation in pack add/remove operations and return `CliError` conflict on stale state
- [ ] 2.12 Run `pnpm typecheck` immediately after task 2.11 and fix any errors
- [ ] 2.13 Run `pnpm typecheck` and fix any errors
- [ ] 2.14 Run `pnpm lint` and fix any errors
- [ ] 2.15 Run `pnpm test` and fix any failures
- [ ] 2.16 Run `pnpm test:e2e` and fix any failures
- [ ] 2.17 Kill any vitest worker processes

## 3. Migrate Handlers To Resolve-Plan

> **Subagent:** Run this entire phase in a single subagent.
> **Parallelization:** Tasks 3.2, 3.4, 3.6, and 3.8 are independent — launch as parallel subagents.

Depends on: Phase 2

- [ ] 3.1 Add/red handler tests proving `skills new`, `packs new`, `packs add`, and `packs remove` call `ws.resolvePlan()` and avoid direct mutation calls
- [ ] 3.2 Refactor `skills new` handler to build a single-step plan and execute `NewSkillOperation`
- [ ] 3.3 Run `pnpm typecheck` immediately after task 3.2 and fix any errors
- [ ] 3.4 Refactor `packs new` handler to build a single-step plan and execute `NewPackOperation`
- [ ] 3.5 Run `pnpm typecheck` immediately after task 3.4 and fix any errors
- [ ] 3.6 Refactor `packs add` handler to compute preflight add delta, build plan, and execute `AddToPackOperation`
- [ ] 3.7 Run `pnpm typecheck` immediately after task 3.6 and fix any errors
- [ ] 3.8 Refactor `packs remove` handler to compute preflight remove delta, build plan, and execute `RemoveFromPackOperation`
- [ ] 3.9 Run `pnpm typecheck` immediately after task 3.8 and fix any errors
- [ ] 3.10 Remove legacy direct file/settings mutation branches from these four handlers
- [ ] 3.11 Run `pnpm typecheck` immediately after task 3.10 and fix any errors
- [ ] 3.12 Run `pnpm typecheck` and fix any errors
- [ ] 3.13 Run `pnpm lint` and fix any errors
- [ ] 3.14 Run `pnpm test` and fix any failures
- [ ] 3.15 Run `pnpm test:e2e` and fix any failures
- [ ] 3.16 Kill any vitest worker processes

## 4. Unify Enable/Disable Edge Paths In Operations

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 2 (can proceed in parallel with Phase 3 after operation scaffolding is complete)

- [ ] 4.1 Add/red handler tests proving all state-changing `skills enable` / `skills disable` paths resolve through operation plans
- [ ] 4.2 Refactor `skills enable` handler to remove direct `ws.updateSkillEntry()` branch and always route state-changing paths through `EnableSkillOperation`
- [ ] 4.3 Run `pnpm typecheck` immediately after task 4.2 and fix any errors
- [ ] 4.4 Refactor `skills disable` handler to remove direct `ws.setSkillEntry()` branch and always route state-changing paths through `DisableSkillOperation`
- [ ] 4.5 Run `pnpm typecheck` immediately after task 4.4 and fix any errors
- [ ] 4.6 Extend `enableSkill` operation to support configured/no-lock settings-only enable behavior
- [ ] 4.7 Run `pnpm typecheck` immediately after task 4.6 and fix any errors
- [ ] 4.8 Extend `disableSkill` operation to support configured/no-lock settings-only disable and implicit->configured disabled promotion
- [ ] 4.9 Run `pnpm typecheck` immediately after task 4.8 and fix any errors
- [ ] 4.10 Implement deterministic source fallback order for implicit promotion and fail with `CliError` when source cannot be derived
- [ ] 4.11 Run `pnpm typecheck` immediately after task 4.10 and fix any errors
- [ ] 4.12 Run `pnpm typecheck` and fix any errors
- [ ] 4.13 Run `pnpm lint` and fix any errors
- [ ] 4.14 Run `pnpm test` and fix any failures
- [ ] 4.15 Run `pnpm test:e2e` and fix any failures
- [ ] 4.16 Kill any vitest worker processes

## 5. CLI Preview Wiring And Regression Coverage

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phases 3 and 4

- [ ] 5.1 Add/red command parsing tests for `packs new`, `packs add`, and `packs remove` to accept `--preview` and pass workspace preview mode
- [ ] 5.2 Implement `--preview` option wiring in packs command definitions and runtime workspace options
- [ ] 5.3 Run `pnpm typecheck` immediately after task 5.2 and fix any errors
- [ ] 5.4 Add/red handler/integration tests proving preview mode performs no writes for `skills new`, `packs new`, `packs add`, and `packs remove`
- [ ] 5.5 Add/red integration tests covering enable/disable matrix outcomes and conflict-safe pack manifest apply behavior
- [ ] 5.6 Run `pnpm typecheck` and fix any errors
- [ ] 5.7 Run `pnpm lint` and fix any errors
- [ ] 5.8 Run `pnpm test` and fix any failures
- [ ] 5.9 Run `pnpm test:e2e` and fix any failures
- [ ] 5.10 Kill any vitest worker processes

## 6. Final Verification And Change Completion

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 5

- [ ] 6.1 Run `openspec validate handler-side-effect-audit --json` and fix any reported issues
- [ ] 6.2 Run `openspec status --change handler-side-effect-audit --json` and confirm all artifacts are complete
- [ ] 6.3 Run `pnpm typecheck` and fix any errors
- [ ] 6.4 Run `pnpm lint` and fix any errors
- [ ] 6.5 Run `pnpm test` and fix any failures
- [ ] 6.6 Run `pnpm test:e2e` and fix any failures
- [ ] 6.7 Kill any vitest worker processes
- [ ] 6.8 Acceptance criteria: all six targeted handlers (`skills new`, `packs new`, `packs add`, `packs remove`, `skills enable`, `skills disable`) execute state-changing paths through `ws.resolvePlan()`
- [ ] 6.9 Acceptance criteria: pack add/remove apply path rejects stale manifest preconditions with a typed `CliError` conflict and no partial writes
- [ ] 6.10 Acceptance criteria: `openspec status --change handler-side-effect-audit --json` reports `isComplete: true`
