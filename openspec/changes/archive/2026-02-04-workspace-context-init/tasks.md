## 1. Update WorkspaceContext Types and Options

- [x] 1.1 Update `WorkspaceContextOptions` interface to add `yes: boolean` and `nonInteractive: boolean` flags
- [x] 1.2 Run `pnpm typecheck` and fix any errors
- [x] 1.3 Run `pnpm lint` and fix any errors

## 2. Implement Global Workspace Auto-Initialization

- [x] 2.1 Write tests for global workspace auto-initialization (settings.json and axm-lock.yaml creation when missing)
- [x] 2.2 Implement global workspace auto-init in `WorkspaceContext.make()` - create empty files when missing
- [x] 2.3 Run `pnpm typecheck` and fix any errors
- [x] 2.4 Run `pnpm lint` and fix any errors
- [x] 2.5 Run `pnpm test` and fix any failures
- [x] 2.6 Kill any vitest worker processes

## 3. Implement Project Workspace Initialization

- [x] 3.1 Write tests for project workspace initialization (agent detection, selection, settings creation)
- [x] 3.2 Move agent detection logic from init handler into WorkspaceContext.make()
- [x] 3.3 Move agent selection logic (interactive prompt) into WorkspaceContext.make()
- [x] 3.4 Implement `yes` flag behavior - auto-select all detected agents
- [x] 3.5 Implement `nonInteractive` flag behavior - fail if prompts needed
- [x] 3.6 Run `pnpm typecheck` and fix any errors
- [x] 3.7 Run `pnpm lint` and fix any errors
- [x] 3.8 Run `pnpm test` and fix any failures
- [x] 3.9 Run `pnpm test:e2e` and fix any failures
- [x] 3.10 Kill any vitest worker processes

## 4. Simplify Init Command Handler

- [x] 4.1 Update init handler tests for thin wrapper behavior
- [x] 4.2 Refactor init handler to yield WorkspaceContext and display result only
- [x] 4.3 Remove agent detection, selection, and file creation logic from init handler
- [x] 4.4 Run `pnpm typecheck` and fix any errors
- [x] 4.5 Run `pnpm lint` and fix any errors
- [x] 4.6 Run `pnpm test` and fix any failures
- [x] 4.7 Run `pnpm test:e2e` and fix any failures
- [x] 4.8 Kill any vitest worker processes

## 5. Update Install Handler

- [x] 5.1 Update install handler tests to remove OperationContext dependency
- [x] 5.2 Remove OperationContext yield from install handler
- [x] 5.3 Update install handler to pass `yes` and `nonInteractive` via WorkspaceContext options
- [x] 5.4 Remove agent selection logic from install handler (use agents from settings)
- [x] 5.5 Run `pnpm typecheck` and fix any errors
- [x] 5.6 Run `pnpm lint` and fix any errors
- [x] 5.7 Run `pnpm test` and fix any failures
- [x] 5.8 Run `pnpm test:e2e` and fix any failures
- [x] 5.9 Kill any vitest worker processes

## 6. Update Uninstall Handler

- [x] 6.1 Update uninstall handler tests to remove OperationContext dependency
- [x] 6.2 Remove OperationContext yield from uninstall handler
- [x] 6.3 Update uninstall handler to use WorkspaceContext for initialization
- [x] 6.4 Run `pnpm typecheck` and fix any errors
- [x] 6.5 Run `pnpm lint` and fix any errors
- [x] 6.6 Run `pnpm test` and fix any failures
- [x] 6.7 Run `pnpm test:e2e` and fix any failures
- [x] 6.8 Kill any vitest worker processes

## 7. Remove OperationContext Service

- [x] 7.1 Search codebase for any remaining OperationContext usages
- [x] 7.2 Delete `packages/cli/src/services/operation-context.ts`
- [x] 7.3 Remove OperationContext exports from service barrel files
- [x] 7.4 Run `pnpm typecheck` and fix any errors
- [x] 7.5 Run `pnpm lint` and fix any errors
- [x] 7.6 Run `pnpm test` and fix any failures
- [x] 7.7 Run `pnpm test:e2e` and fix any failures
- [x] 7.8 Kill any vitest worker processes

## 8. Final Verification

- [x] 8.1 Run full test suite (`pnpm test && pnpm test:e2e`)
- [x] 8.2 Verify all specs are satisfied by reviewing implementation against specs
- [x] 8.3 Kill any vitest worker processes
