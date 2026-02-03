## 1. Core Types and State

- [ ] 1.1 Create `packages/core/src/experimental/workspace-init/` directory structure
- [ ] 1.2 Write unit tests for InitState types (ActualInitState, IdealInitState, InitValidity)
- [ ] 1.3 Implement `types.ts` with InitState, InitValidity, and InitChange discriminated unions
- [ ] 1.4 Run typecheck, fix any issues
- [ ] 1.5 Run lint, fix any issues
- [ ] 1.6 Run tests, fix any issues
- [ ] 1.7 Kill any runaway vitest worker processes

## 2. State Loading

- [ ] 2.1 Write unit tests for loadActualInitState (not initialized, valid, invalid cases)
- [ ] 2.2 Implement `state.ts` with loadActualInitState function
- [ ] 2.3 Write unit tests for buildIdealInitState (detected agents, scope defaults)
- [ ] 2.4 Implement buildIdealInitState function
- [ ] 2.5 Run typecheck, fix any issues
- [ ] 2.6 Run lint, fix any issues
- [ ] 2.7 Run tests, fix any issues
- [ ] 2.8 Kill any runaway vitest worker processes

## 3. Diff Computation

- [ ] 3.1 Write unit tests for computeInitDiff (Add, Update, Unchanged cases)
- [ ] 3.2 Implement `diff.ts` with computeInitDiff function
- [ ] 3.3 Run typecheck, fix any issues
- [ ] 3.4 Run lint, fix any issues
- [ ] 3.5 Run tests, fix any issues
- [ ] 3.6 Kill any runaway vitest worker processes

## 4. Apply Phase

- [ ] 4.1 Write unit tests for applyInitDiff (creates settings.json correctly)
- [ ] 4.2 Implement `apply.ts` with applyInitDiff function
- [ ] 4.3 Add barrel export in `index.ts`
- [ ] 4.4 Run typecheck, fix any issues
- [ ] 4.5 Run lint, fix any issues
- [ ] 4.6 Run tests, fix any issues
- [ ] 4.7 Kill any runaway vitest worker processes

## 5. CLI Command

- [ ] 5.1 Create `packages/cli/src/commands/init/` directory structure
- [ ] 5.2 Implement `command.ts` with yargs builder (--force, --yes, --dry-run flags)
- [ ] 5.3 Run typecheck, fix any issues
- [ ] 5.4 Run lint, fix any issues

## 6. CLI Handler

- [ ] 6.1 Write handler tests for init scenarios (new workspace, already initialized, force, dry-run)
- [ ] 6.2 Implement `handler.ts` with handleInit function using state-based flow
- [ ] 6.3 Wire command into CLI entry point
- [ ] 6.4 Run typecheck, fix any issues
- [ ] 6.5 Run lint, fix any issues
- [ ] 6.6 Run tests, fix any issues
- [ ] 6.7 Kill any runaway vitest worker processes

## 7. E2E Tests

- [ ] 7.1 Write E2E test: `axm init --yes` creates settings.json with detected agents
- [ ] 7.2 Write E2E test: `axm init` on initialized workspace shows "already set up" message
- [ ] 7.3 Write E2E test: `axm init --force --yes` re-initializes workspace
- [ ] 7.4 Write E2E test: `axm init --dry-run --yes` shows plan without creating files
- [ ] 7.5 Run E2E tests, fix any issues
- [ ] 7.6 Kill any runaway vitest worker processes

## 8. Integration

- [ ] 8.1 Update `skills install` handler to use shared init module (if beneficial)
- [ ] 8.2 Run full test suite
- [ ] 8.3 Kill any runaway vitest worker processes
- [ ] 8.4 Manual smoke test of `axm init` command
