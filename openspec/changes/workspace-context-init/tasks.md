## 1. Update WorkspaceContext Types and Options

- [ ] 1.1 Update `WorkspaceContextOptions` interface to add `yes: boolean` and `nonInteractive: boolean` flags
- [ ] 1.2 Run `pnpm typecheck` and fix any errors
- [ ] 1.3 Run `pnpm lint` and fix any errors

## 2. Implement Global Workspace Auto-Initialization

- [ ] 2.1 Write tests for global workspace auto-initialization (settings.json and axm-lock.yaml creation when missing)
- [ ] 2.2 Implement global workspace auto-init in `WorkspaceContext.make()` - create empty files when missing
- [ ] 2.3 Run `pnpm typecheck` and fix any errors
- [ ] 2.4 Run `pnpm lint` and fix any errors
- [ ] 2.5 Run `pnpm test` and fix any failures
- [ ] 2.6 Kill any vitest worker processes

## 3. Implement Project Workspace Initialization

- [ ] 3.1 Write tests for project workspace initialization (agent detection, selection, settings creation)
- [ ] 3.2 Move agent detection logic from init handler into WorkspaceContext.make()
- [ ] 3.3 Move agent selection logic (interactive prompt) into WorkspaceContext.make()
- [ ] 3.4 Implement `yes` flag behavior - auto-select all detected agents
- [ ] 3.5 Implement `nonInteractive` flag behavior - fail if prompts needed
- [ ] 3.6 Run `pnpm typecheck` and fix any errors
- [ ] 3.7 Run `pnpm lint` and fix any errors
- [ ] 3.8 Run `pnpm test` and fix any failures
- [ ] 3.9 Run `pnpm test:e2e` and fix any failures
- [ ] 3.10 Kill any vitest worker processes

## 4. Simplify Init Command Handler

- [ ] 4.1 Update init handler tests for thin wrapper behavior
- [ ] 4.2 Refactor init handler to yield WorkspaceContext and display result only
- [ ] 4.3 Remove agent detection, selection, and file creation logic from init handler
- [ ] 4.4 Run `pnpm typecheck` and fix any errors
- [ ] 4.5 Run `pnpm lint` and fix any errors
- [ ] 4.6 Run `pnpm test` and fix any failures
- [ ] 4.7 Run `pnpm test:e2e` and fix any failures
- [ ] 4.8 Kill any vitest worker processes

## 5. Update Install Handler

- [ ] 5.1 Update install handler tests to remove OperationContext dependency
- [ ] 5.2 Remove OperationContext yield from install handler
- [ ] 5.3 Update install handler to pass `yes` and `nonInteractive` via WorkspaceContext options
- [ ] 5.4 Remove agent selection logic from install handler (use agents from settings)
- [ ] 5.5 Run `pnpm typecheck` and fix any errors
- [ ] 5.6 Run `pnpm lint` and fix any errors
- [ ] 5.7 Run `pnpm test` and fix any failures
- [ ] 5.8 Run `pnpm test:e2e` and fix any failures
- [ ] 5.9 Kill any vitest worker processes

## 6. Update Uninstall Handler

- [ ] 6.1 Update uninstall handler tests to remove OperationContext dependency
- [ ] 6.2 Remove OperationContext yield from uninstall handler
- [ ] 6.3 Update uninstall handler to use WorkspaceContext for initialization
- [ ] 6.4 Run `pnpm typecheck` and fix any errors
- [ ] 6.5 Run `pnpm lint` and fix any errors
- [ ] 6.6 Run `pnpm test` and fix any failures
- [ ] 6.7 Run `pnpm test:e2e` and fix any failures
- [ ] 6.8 Kill any vitest worker processes

## 7. Remove OperationContext Service

- [ ] 7.1 Search codebase for any remaining OperationContext usages
- [ ] 7.2 Delete `packages/cli/src/services/operation-context.ts`
- [ ] 7.3 Remove OperationContext exports from service barrel files
- [ ] 7.4 Run `pnpm typecheck` and fix any errors
- [ ] 7.5 Run `pnpm lint` and fix any errors
- [ ] 7.6 Run `pnpm test` and fix any failures
- [ ] 7.7 Run `pnpm test:e2e` and fix any failures
- [ ] 7.8 Kill any vitest worker processes

## 8. Final Verification

- [ ] 8.1 Run full test suite (`pnpm test && pnpm test:e2e`)
- [ ] 8.2 Verify all specs are satisfied by reviewing implementation against specs
- [ ] 8.3 Kill any vitest worker processes
