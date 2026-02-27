> **Orchestration:** The main agent thread MUST NOT execute any tasks directly. Delegate each phase to subagents as directed below. The main agent's role is strictly to orchestrate: launch subagents, verify phase completion, and proceed to the next phase. This directive takes precedence over any apply-phase instructions that say to execute tasks in the main thread — always use subagents for implementation work.

## 1. Tag Namespacing + Typed Provide Helpers (D1 + D4)

> **Subagent:** Run this entire phase in a single subagent.
> **Parallelization:** Tasks 1.1 and 1.2 are independent — launch as parallel subagents.

No dependencies on other phases.

### Tag namespacing (D1)

- [ ] 1.1 Add `@axm.sh/cli/` prefix to all 12 unqualified tag identifier strings:
  - `extensions/skills/manager.ts` — `SkillManager`
  - `extensions/commands/manager.ts` — `CommandManager`
  - `extensions/packs/manager.ts` — `PackManager`
  - `extensions/mcp-servers/manager.ts` — `McpServerManager`
  - `cli-commands/skills/install/command-actions.ts` — `InstallSkillCommandWorkflowActions`
  - `cli-commands/skills/uninstall/command-actions.ts` — `UninstallSkillCommandWorkflowActions`
  - `cli-commands/commands/install/command-actions.ts` — `InstallCommandCommandWorkflowActions`
  - `cli-commands/commands/uninstall/command-actions.ts` — `UninstallCommandCommandWorkflowActions`
  - `cli-commands/packs/install/command-actions.ts` — `InstallPackCommandWorkflowActions`
  - `cli-commands/packs/uninstall/command-actions.ts` — `UninstallPackCommandWorkflowActions`
  - `cli-commands/mcp-servers/install/command-actions.ts` — `InstallMcpServerCommandWorkflowActions`
  - `cli-commands/mcp-servers/uninstall/command-actions.ts` — `UninstallMcpServerCommandWorkflowActions`

### Typed provide helpers (D4)

- [ ] 1.2 Type `provide` / `provideServices` helpers — replace `any` with explicit unions in 4 files:
  - `cli-commands/skills/install/command-actions.ts` — replace `<A>(effect: Effect.Effect<A, any, any>)` with `<A, E>` and explicit R union; include `PromptCancelled` in error union
  - `cli-commands/packs/install/command-actions.ts` — same pattern as above
  - `cli-commands/packs/install/plan.ts` — replace `any` in R with explicit service union
  - `cli-commands/packs/uninstall/plan.ts` — replace `any` in R with explicit service union

### Verification

- [ ] 1.3 Run `pnpm typecheck` — fix any errors
- [ ] 1.4 Run `pnpm lint` — fix any errors
- [ ] 1.5 Run `pnpm test` — fix any failures
- [ ] 1.6 Run `pnpm test:e2e` — fix any failures
- [ ] 1.7 Kill any vitest worker processes

## 2. Combined Tag Pattern (D2)

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 1 (shared files in command-actions).

### Service definitions — clack services

- [ ] 2.1 Convert 6 clack service definitions to combined tag + inline interface pattern. For each: inline the `*Service` interface on the `Context.Tag` class, remove the separate interface type export:
  - `clack-effect/log/service.ts` — inline `ClackLogService`, remove type export
  - `clack-effect/spinner/service.ts` — inline `ClackSpinnerService`, remove type export
  - `clack-effect/prompt/service.ts` — inline `ClackPromptService`, remove type export
  - `clack-effect/progress/service.ts` — inline `ClackProgressService`, remove type export
  - `clack-effect/task-log/service.ts` — inline `ClackTaskLogService`, remove type export
  - `clack-effect/stream/service.ts` — inline `ClackStreamService`, remove type export

### Service definitions — legacy prompt services

- [ ] 2.2 Convert 5 legacy prompt service definitions in `clack-effect/legacy-prompt.ts` to combined tag + inline interface:
  - Inline `ConfirmService` on `Confirm` tag, remove separate interface
  - Inline `SelectService` on `Select` tag, remove separate interface
  - Inline `MultiselectService` on `Multiselect` tag, remove separate interface
  - Inline `TextInputService` on `TextInput` tag, remove separate interface
  - Inline `PasswordInputService` on `PasswordInput` tag, remove separate interface
  - Update `makeLegacyPromptServices` helper to use `Context.Tag.Service<typeof Tag>` instead of removed interface types

### Consumer migration

- [ ] 2.3 Update all imports of removed `*Service` types across the codebase. Replace with `Context.Tag.Service<typeof Tag>` or remove if unused. Check:
  - Barrel re-exports in `clack-effect/*/index.ts` and `clack-effect/index.ts` — remove `*Service` exports and any deprecated aliases (`LogService`, `SpinnerService`, etc.)
  - Production code importing `*Service` types for parameter typing
  - Test files importing `*Service` types for mock typing (e.g., `as ClackLogService`)

### Verification

- [ ] 2.4 Run `pnpm typecheck` — fix any errors
- [ ] 2.5 Run `pnpm lint` — fix any errors
- [ ] 2.6 Run `pnpm test` — fix any failures
- [ ] 2.7 Run `pnpm test:e2e` — fix any failures
- [ ] 2.8 Kill any vitest worker processes

## 3. Test Layer Migration (D3)

> **Subagent:** Run this entire phase in a single subagent.
> **Parallelization:** Tasks 3.1–3.6 are independent — launch as parallel subagents.

Depends on: Phase 2 (service type exports changed).

### Rewrite test layer factories

For each factory: create a new `*Test.ts` file with a named `*Test` constant using `Layer.effect` + `Ref`-based state. Expose an inspection API (e.g., `_calls: Ref.get(ref)`) on the service for test assertions. Delete the old `test.ts` file. Update the barrel `index.ts` in the same directory to export from `*Test.ts` instead of `test.ts`.

- [ ] 3.1 Rewrite `clack-effect/log/test.ts` → `clack-effect/log/ClackLogTest.ts` (export `ClackLogTest`)
- [ ] 3.2 Rewrite `clack-effect/spinner/test.ts` → `clack-effect/spinner/ClackSpinnerTest.ts` (export `ClackSpinnerTest`)
- [ ] 3.3 Rewrite `clack-effect/prompt/test.ts` → `clack-effect/prompt/ClackPromptTest.ts` (export `ClackPromptTest`, plus `ConfirmTest`, `SelectTest`, `MultiselectTest`)
- [ ] 3.4 Rewrite `clack-effect/progress/test.ts` → `clack-effect/progress/ClackProgressTest.ts` (export `ClackProgressTest`)
- [ ] 3.5 Rewrite `clack-effect/stream/test.ts` → `clack-effect/stream/ClackStreamTest.ts` (export `ClackStreamTest`)
- [ ] 3.6 Rewrite `clack-effect/task-log/test.ts` → `clack-effect/task-log/ClackTaskLogTest.ts` (export `ClackTaskLogTest`)

### Update test consumers

- [ ] 3.7 Update all ~46 test files that consume test layer factories. For each file:
  - Replace `const [layer, mock] = make*TestLayer()` with the named `*Test` layer constant
  - Replace mock property assertions (e.g., `mock.logs.info`) with `yield* service._calls` inside Effect context
  - Update import paths from `test.ts` barrel to `*Test.ts` barrel

### Barrel cleanup

- [ ] 3.8 Update barrel exports in `clack-effect/*/index.ts` — remove old `make*TestLayer` exports, add new `*Test` exports
- [ ] 3.9 Update `clack-effect/index.ts` barrel — remove old `make*TestLayer` re-exports, add new `*Test` re-exports

### Verification

- [ ] 3.10 Run `pnpm typecheck` — fix any errors
- [ ] 3.11 Run `pnpm lint` — fix any errors
- [ ] 3.12 Run `pnpm test` — fix any failures
- [ ] 3.13 Run `pnpm test:e2e` — fix any failures
- [ ] 3.14 Kill any vitest worker processes
