# Tasks

## 1. Package Setup

- [x] 1.1 Create `packages/core/` directory structure
- [x] 1.2 Create `packages/core/package.json` with `@agentxm/core` name
- [x] 1.3 Create `packages/core/tsconfig.json` extending base config
- [x] 1.4 Create `packages/core/src/index.ts` as entry point
- [x] 1.5 Create `packages/core/vitest.config.ts` for tests

## 2. Initial Content

- [x] 2.1 Add placeholder export in `src/index.ts`
- [x] 2.2 Add basic test file `src/index.test.ts`

## 3. CLI Integration

- [x] 3.1 Add `@agentxm/core` as dependency in CLI package.json

## 4. Validation

- [x] 4.1 Run `pnpm install` to link workspace packages
- [x] 4.2 Run `pnpm build` to verify compilation
- [x] 4.3 Run `pnpm test` to verify tests pass
- [x] 4.4 Run `pnpm typecheck` to verify types
