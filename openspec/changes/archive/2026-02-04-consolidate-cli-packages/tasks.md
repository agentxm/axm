## 1. Move clack-effect

- [x] 1.1 Move `cli/src/services/clack-effect/` to `cli/src/clack-effect/`
- [x] 1.2 Update imports in moved files
- [x] 1.3 Update imports in dependent files
- [x] 1.4 Run `pnpm typecheck` and fix errors
- [x] 1.5 Run `pnpm lint` and fix errors
- [x] 1.6 Run `pnpm test` and fix failures
- [x] 1.7 Run `pnpm test:e2e` and fix failures
- [x] 1.8 Kill vitest worker processes

## 2. Move schemas

- [x] 2.1 Move `core/src/experimental/schemas/` to `cli/src/schemas/`
- [x] 2.2 Update imports in moved files (change `@axm.sh/core` to relative)
- [x] 2.3 Update imports in dependent files
- [x] 2.4 Run `pnpm typecheck` and fix errors
- [x] 2.5 Run `pnpm lint` and fix errors
- [x] 2.6 Run `pnpm test` and fix failures
- [x] 2.7 Run `pnpm test:e2e` and fix failures
- [x] 2.8 Kill vitest worker processes

## 3. Move agents

- [x] 3.1 Move `core/src/experimental/agents/` to `cli/src/agents/`
- [x] 3.2 Update imports in moved files
- [x] 3.3 Update imports in dependent files
- [x] 3.4 Run `pnpm typecheck` and fix errors
- [x] 3.5 Run `pnpm lint` and fix errors
- [x] 3.6 Run `pnpm test` and fix failures
- [x] 3.7 Run `pnpm test:e2e` and fix failures
- [x] 3.8 Kill vitest worker processes

## 4. Move resolution

- [x] 4.1 Move `core/src/experimental/resolution/` to `cli/src/resolution/`
- [x] 4.2 Update imports in moved files
- [x] 4.3 Update imports in dependent files
- [x] 4.4 Run `pnpm typecheck` and fix errors
- [x] 4.5 Run `pnpm lint` and fix errors
- [x] 4.6 Run `pnpm test` and fix failures
- [x] 4.7 Run `pnpm test:e2e` and fix failures
- [x] 4.8 Kill vitest worker processes

## 5. Move skills

- [x] 5.1 Move `core/src/experimental/skills/` to `cli/src/skills/`
- [x] 5.2 Update imports in moved files
- [x] 5.3 Update imports in dependent files
- [x] 5.4 Run `pnpm typecheck` and fix errors
- [x] 5.5 Run `pnpm lint` and fix errors
- [x] 5.6 Run `pnpm test` and fix failures
- [x] 5.7 Run `pnpm test:e2e` and fix failures
- [x] 5.8 Kill vitest worker processes

## 6. Consolidate workspace

- [x] 6.1 Move `core/src/experimental/workspace/` contents to `cli/src/workspace/`
- [x] 6.2 Move `core/src/experimental/workspace-init/` contents to `cli/src/workspace/`
- [x] 6.3 Move `core/src/experimental/paths.ts` and `paths.test.ts` to `cli/src/workspace/`
- [x] 6.4 Merge `cli/src/services/workspace-context/` into `cli/src/workspace/`
- [x] 6.5 Update imports in all workspace files
- [x] 6.6 Update imports in dependent files across codebase
- [x] 6.7 Run `pnpm typecheck` and fix errors
- [x] 6.8 Run `pnpm lint` and fix errors
- [x] 6.9 Run `pnpm test` and fix failures
- [x] 6.10 Run `pnpm test:e2e` and fix failures
- [x] 6.11 Kill vitest worker processes

## 7. Delete core package

- [x] 7.1 Remove `@axm.sh/core` from cli's package.json dependencies
- [x] 7.2 Delete `packages/core/` directory
- [x] 7.3 Delete empty `cli/src/services/` directory
- [x] 7.4 Update pnpm-workspace.yaml if needed
- [x] 7.5 Run `pnpm install` to update lockfile
- [x] 7.6 Run `pnpm typecheck` and fix errors
- [x] 7.7 Run `pnpm lint` and fix errors
- [x] 7.8 Run `pnpm test` and fix failures
- [x] 7.9 Run `pnpm test:e2e` and fix failures
- [x] 7.10 Kill vitest worker processes
