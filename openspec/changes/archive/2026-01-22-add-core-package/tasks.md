# Tasks

## 1. Package Setup

- [x] 1.1 Create `packages/core/` directory structure
- [x] 1.2 Create `packages/core/package.json` with `@axm.sh/core` name
- [x] 1.3 Create `packages/core/tsconfig.json` extending base config
- [x] 1.4 Create `packages/core/src/index.ts` as entry point
- [x] 1.5 Create `packages/core/vitest.config.ts` for tests

## 2. Initial Content

- [x] 2.1 Add placeholder export in `src/index.ts`
- [x] 2.2 Add basic test file `src/index.test.ts`

## 3. Experimental Subpath

- [x] 3.1 Create `src/experimental/` folder
- [x] 3.2 Create `src/experimental/index.ts` barrel export
- [x] 3.3 Add `./experimental` export path in `package.json`
- [x] 3.4 Add `@experimental` JSDoc tags to exports
- [x] 3.5 Create `packages/core/CLAUDE.md` with experimental API guidance

## 4. CLI Integration

- [x] 4.1 Add `@axm.sh/core` as dependency in CLI package.json

## 5. Validation

- [x] 5.1 Run `pnpm install` to link workspace packages
- [x] 5.2 Run `pnpm build` to verify compilation
- [x] 5.3 Run `pnpm test` to verify tests pass
- [x] 5.4 Run `pnpm typecheck` to verify types
