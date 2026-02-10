## 1. Remove Global Flags

- [x] 1.1 Remove `--verbose` and `--quiet` option definitions from `packages/cli/src/main.ts`
- [x] 1.2 Run `pnpm typecheck` and fix any errors

## 2. Update OperationContext Service

- [x] 2.1 Remove `verbose` property from `OperationContextConfig` interface in `packages/cli/src/services/operation-context.ts`
- [x] 2.2 Remove `verbose` from default layer configuration
- [x] 2.3 Run `pnpm typecheck` and fix any errors

## 3. Update Command Interfaces and Handlers

- [x] 3.1 Remove `verbose` and `quiet` from `InitArgs` interface in `packages/cli/src/commands/init/command.ts`
- [x] 3.2 Remove `verbose` and `quiet` from handler call in init command
- [x] 3.3 Remove `verbose` and `quiet` from `InitOptions` interface in `packages/cli/src/commands/init/handler.ts`
- [x] 3.4 Remove `verbose` and `quiet` from `InstallArgs` interface in `packages/cli/src/commands/skills/install/command.ts`
- [x] 3.5 Remove `verbose` and `quiet` from handler call in install command
- [x] 3.6 Remove `verbose` and `quiet` from `InstallOptions` interface in `packages/cli/src/commands/skills/install/handler.ts`
- [x] 3.7 Run `pnpm typecheck` and fix any errors

## 4. Verification

- [x] 4.1 Run `pnpm lint` and fix any errors
- [x] 4.2 Run `pnpm test` and fix any failures
- [x] 4.3 Run `pnpm test:e2e` and fix any failures
- [x] 4.4 Kill any vitest worker processes
