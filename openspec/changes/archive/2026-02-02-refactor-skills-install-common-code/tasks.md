## 1. Core Package: Path Utilities

- [x] 1.1 Create `packages/core/src/experimental/paths.ts` with `getAxmDir()`, `getProjectDir()`, `getGlobalDir()` stubs
- [x] 1.2 Write tests for path utilities in `paths.test.ts`
- [x] 1.3 Implement path utility functions to make tests pass
- [x] 1.4 Run typecheck and tests, fix any issues
- [x] 1.5 Kill any runaway vitest worker processes
- [x] 1.6 Export path utilities from `core/experimental/index.ts`

## 2. Core Package: Source URL Builders

- [x] 2.1 Write tests for `buildCloneUrl()` and `getOriginFromParsed()` in `source-parser.test.ts`
- [x] 2.2 Add `buildCloneUrl()` and `getOriginFromParsed()` to `source-parser.ts`
- [x] 2.3 Run typecheck and tests, fix any issues
- [x] 2.4 Kill any runaway vitest worker processes
- [x] 2.5 Export new functions from skills module index

## 3. CLI Package: Spinner Utility

- [x] 3.1 Create `packages/cli/src/utils/spinner.ts` with `SpinnerHelper` interface and `createSpinnerHelper()` stub
- [x] 3.2 Write tests for spinner utility in `spinner.test.ts`
- [x] 3.3 Implement `createSpinnerHelper()` with TTY fallback logic
- [x] 3.4 Run typecheck and tests, fix any issues
- [x] 3.5 Kill any runaway vitest worker processes

## 4. CLI Package: Prompt Utilities

- [x] 4.1 Create `packages/cli/src/utils/prompts.ts` with `PromptError` type and function stubs
- [x] 4.2 Write tests for `canPrompt()` helper
- [x] 4.3 Implement `canPrompt()` function
- [x] 4.4 Write tests for `promptConfirm()`
- [x] 4.5 Implement `promptConfirm()` with Effect wrapping and cancel handling
- [x] 4.6 Write tests for `promptSelect()`
- [x] 4.7 Implement `promptSelect()` with Effect wrapping and cancel handling
- [x] 4.8 Write tests for `promptMultiselect()`
- [x] 4.9 Implement `promptMultiselect()` with Effect wrapping and cancel handling
- [x] 4.10 Run typecheck and tests, fix any issues
- [x] 4.11 Kill any runaway vitest worker processes

## 5. CLI Package: Error Formatting Enhancement

- [x] 5.1 Write test for `formatEmptyResolutionError()` in `errors.test.ts`
- [x] 5.2 Add `formatEmptyResolutionError()` to `errors.ts`
- [x] 5.3 Run typecheck and tests, fix any issues
- [x] 5.4 Kill any runaway vitest worker processes

## 6. Skills Command: Utils Module

- [x] 6.1 Create `packages/cli/src/commands/skills/utils.ts` with `selectExtensionRef()` stub
- [x] 6.2 Write tests for `selectExtensionRef()` covering empty, single, and multiple result cases
- [x] 6.3 Implement `selectExtensionRef()` using extracted prompt utilities
- [x] 6.4 Run typecheck and tests, fix any issues
- [x] 6.5 Kill any runaway vitest worker processes

## 7. Handler Migration

- [x] 7.1 Update handler imports to use `getAxmDir` from core paths module
- [x] 7.2 Update handler imports to use `buildCloneUrl`, `getOriginFromParsed` from source-parser
- [x] 7.3 Update handler to use `createSpinnerHelper` from utils/spinner
- [x] 7.4 Update handler to use prompt utilities from utils/prompts
- [x] 7.5 Update handler to use `selectExtensionRef` from skills/utils
- [x] 7.6 Update handler to use `formatEmptyResolutionError` from utils/errors
- [x] 7.7 Remove inline utility implementations from handler
- [x] 7.8 Run typecheck and tests, fix any issues
- [x] 7.9 Kill any runaway vitest worker processes

## 8. Cleanup and Verification

- [x] 8.1 Remove any remaining dead code from handler
- [x] 8.2 Verify barrel exports in `core/experimental/index.ts`
- [x] 8.3 Run full test suite including E2E tests
- [x] 8.4 Kill any runaway vitest worker processes
- [x] 8.5 Run `pnpm typecheck` across all packages
- [x] 8.6 Run `pnpm lint` and fix any issues
