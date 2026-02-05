## 1. Rename getSourcePath to getSourcePathOrThrow

- [x] 1.1 Rename function `getSourcePath` to `getSourcePathOrThrow` in `packages/cli/src/workspace/apply.ts`
- [x] 1.2 Update the call site at line 570 to use the new name

## 2. Verification

- [x] 2.1 Run typecheck (`pnpm typecheck`) and fix any errors
- [x] 2.2 Run linting (`pnpm lint`) and fix any errors
- [x] 2.3 Run tests (`pnpm test`) and fix any failures
- [x] 2.4 Kill any vitest worker processes
