## 1. Core Package: Path Utilities

- [ ] 1.1 Create `packages/core/src/experimental/paths.ts` with `getAxmDir()`, `getProjectDir()`, `getGlobalDir()` stubs
- [ ] 1.2 Write tests for path utilities in `paths.test.ts`
- [ ] 1.3 Implement path utility functions to make tests pass
- [ ] 1.4 Run typecheck and tests, fix any issues
- [ ] 1.5 Kill any runaway vitest worker processes
- [ ] 1.6 Export path utilities from `core/experimental/index.ts`

## 2. Core Package: Source URL Builders

- [ ] 2.1 Write tests for `buildCloneUrl()` and `getOriginFromParsed()` in `source-parser.test.ts`
- [ ] 2.2 Add `buildCloneUrl()` and `getOriginFromParsed()` to `source-parser.ts`
- [ ] 2.3 Run typecheck and tests, fix any issues
- [ ] 2.4 Kill any runaway vitest worker processes
- [ ] 2.5 Export new functions from skills module index

## 3. CLI Package: Spinner Utility

- [ ] 3.1 Create `packages/cli/src/utils/spinner.ts` with `SpinnerHelper` interface and `createSpinnerHelper()` stub
- [ ] 3.2 Write tests for spinner utility in `spinner.test.ts`
- [ ] 3.3 Implement `createSpinnerHelper()` with TTY fallback logic
- [ ] 3.4 Run typecheck and tests, fix any issues
- [ ] 3.5 Kill any runaway vitest worker processes

## 4. CLI Package: Prompt Utilities

- [ ] 4.1 Create `packages/cli/src/utils/prompts.ts` with `PromptError` type and function stubs
- [ ] 4.2 Write tests for `canPrompt()` helper
- [ ] 4.3 Implement `canPrompt()` function
- [ ] 4.4 Write tests for `promptConfirm()`
- [ ] 4.5 Implement `promptConfirm()` with Effect wrapping and cancel handling
- [ ] 4.6 Write tests for `promptSelect()`
- [ ] 4.7 Implement `promptSelect()` with Effect wrapping and cancel handling
- [ ] 4.8 Write tests for `promptMultiselect()`
- [ ] 4.9 Implement `promptMultiselect()` with Effect wrapping and cancel handling
- [ ] 4.10 Run typecheck and tests, fix any issues
- [ ] 4.11 Kill any runaway vitest worker processes

## 5. CLI Package: Error Formatting Enhancement

- [ ] 5.1 Write test for `formatEmptyResolutionError()` in `errors.test.ts`
- [ ] 5.2 Add `formatEmptyResolutionError()` to `errors.ts`
- [ ] 5.3 Run typecheck and tests, fix any issues
- [ ] 5.4 Kill any runaway vitest worker processes

## 6. Skills Command: Utils Module

- [ ] 6.1 Create `packages/cli/src/commands/skills/utils.ts` with `selectExtensionRef()` stub
- [ ] 6.2 Write tests for `selectExtensionRef()` covering empty, single, and multiple result cases
- [ ] 6.3 Implement `selectExtensionRef()` using extracted prompt utilities
- [ ] 6.4 Run typecheck and tests, fix any issues
- [ ] 6.5 Kill any runaway vitest worker processes

## 7. Handler Migration

- [ ] 7.1 Update handler imports to use `getAxmDir` from core paths module
- [ ] 7.2 Update handler imports to use `buildCloneUrl`, `getOriginFromParsed` from source-parser
- [ ] 7.3 Update handler to use `createSpinnerHelper` from utils/spinner
- [ ] 7.4 Update handler to use prompt utilities from utils/prompts
- [ ] 7.5 Update handler to use `selectExtensionRef` from skills/utils
- [ ] 7.6 Update handler to use `formatEmptyResolutionError` from utils/errors
- [ ] 7.7 Remove inline utility implementations from handler
- [ ] 7.8 Run typecheck and tests, fix any issues
- [ ] 7.9 Kill any runaway vitest worker processes

## 8. Cleanup and Verification

- [ ] 8.1 Remove any remaining dead code from handler
- [ ] 8.2 Verify barrel exports in `core/experimental/index.ts`
- [ ] 8.3 Run full test suite including E2E tests
- [ ] 8.4 Kill any runaway vitest worker processes
- [ ] 8.5 Run `pnpm typecheck` across all packages
- [ ] 8.6 Run `pnpm lint` and fix any issues
