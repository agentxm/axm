## 1. Remove Global Flags

- [ ] 1.1 Remove `--verbose` and `--quiet` option definitions from `packages/cli/src/main.ts`
- [ ] 1.2 Run `pnpm typecheck` and fix any errors

## 2. Update OperationContext Service

- [ ] 2.1 Remove `verbose` property from `OperationContextConfig` interface in `packages/cli/src/services/operation-context.ts`
- [ ] 2.2 Remove `verbose` from default layer configuration
- [ ] 2.3 Run `pnpm typecheck` and fix any errors

## 3. Update Command Interfaces and Handlers

- [ ] 3.1 Remove `verbose` and `quiet` from `InitArgs` interface in `packages/cli/src/commands/init/command.ts`
- [ ] 3.2 Remove `verbose` and `quiet` from handler call in init command
- [ ] 3.3 Remove `verbose` and `quiet` from `InitOptions` interface in `packages/cli/src/commands/init/handler.ts`
- [ ] 3.4 Remove `verbose` and `quiet` from `InstallArgs` interface in `packages/cli/src/commands/skills/install/command.ts`
- [ ] 3.5 Remove `verbose` and `quiet` from handler call in install command
- [ ] 3.6 Remove `verbose` and `quiet` from `InstallOptions` interface in `packages/cli/src/commands/skills/install/handler.ts`
- [ ] 3.7 Run `pnpm typecheck` and fix any errors

## 4. Verification

- [ ] 4.1 Run `pnpm lint` and fix any errors
- [ ] 4.2 Run `pnpm test` and fix any failures
- [ ] 4.3 Run `pnpm test:e2e` and fix any failures
- [ ] 4.4 Kill any vitest worker processes
