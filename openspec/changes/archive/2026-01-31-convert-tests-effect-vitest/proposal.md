# Change: Convert tests to use @effect/vitest patterns

## Why

The codebase uses Effect for business logic but tests bridge to Promise-land via `Effect.runPromise()` helpers. The `/effect-testing` skill documents idiomatic patterns using `@effect/vitest` that stay in Effect-land. Converting tests to these patterns will:

1. Eliminate async/await boilerplate in favor of pure Effect tests
2. Use `it.effect` for Effect-based tests instead of `runPromise` wrappers
3. Use `Effect.flip` for error assertions instead of `Effect.either` + manual checks
4. Leverage `it.scoped` for tests with resource lifecycle
5. Provide test layers via `Effect.provide` within tests

## What Changes

**Handler tests** (require service dependencies):

- `packages/cli/src/commands/init/handler.test.ts` - convert to `it.effect` + `Effect.provide`
- `packages/cli/src/commands/skills/add/handler.test.ts` - convert to `it.effect` + `Effect.provide`
- `packages/cli/src/commands/skills/remove/handler.test.ts` - convert to `it.effect` + `Effect.provide`

**Core module tests** (require FileSystem/Path services):

- `packages/core/src/experimental/skills/settings.test.ts` - convert to `it.effect`
- `packages/core/src/experimental/skills/installer.test.ts` - convert to `it.effect`
- `packages/core/src/experimental/skills/content-hash.test.ts` - convert to `it.effect`
- `packages/core/src/experimental/skills/lockfile.test.ts` - convert to `it.effect`
- `packages/core/src/experimental/skills/git.test.ts` - convert to `it.effect`
- `packages/core/src/experimental/skills/wellknown.test.ts` - convert to `it.effect`
- `packages/core/src/experimental/skills/skill-discovery.test.ts` - convert to `it.effect`
- `packages/core/src/experimental/skills/agent-detection.test.ts` - convert to `it.effect`

**Unit tests for pure Effect functions**:

- `packages/core/src/experimental/skills/source-parser.test.ts` - convert to `it.effect`

**Tests that remain unchanged** (E2E tests, command tests):

- `packages/cli/e2e/*.test.ts` - E2E tests spawn CLI subprocess, no Effect usage
- `packages/cli/src/commands/**/*.command.test.ts` - Test yargs parsing, no Effect
- `packages/cli/src/utils/tty.test.ts` - Pure function tests, no Effect
- `packages/cli/src/utils/errors.test.ts` - Error display tests, no Effect
- `packages/core/src/index.test.ts` - Export tests, no Effect

## Impact

- Affected specs: None (internal testing patterns, no user-facing behavior)
- Affected code: 12 test files

## Notes

- Import from `@effect/vitest` replaces `vitest` for Effect tests
- `describe`, `expect`, `beforeEach`, `afterEach` still come from `@effect/vitest`
- `it.effect` returns `Effect<void, E, R>` - no explicit return needed
- Tests with `async () => { await ... }` become `() => Effect.gen(function* () { ... })`
- `it.effect` provides `TestContext` with `TestClock` starting at 0ms
- Tests requiring real time (elapsed time, file timestamps) must use `it.live` instead
- Test modifiers available: `it.effect.skip`, `it.effect.only`, `it.effect.fails`
