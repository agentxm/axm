# Tasks: Convert tests to @effect/vitest patterns

## Phase 1: Core Module Tests (Pure Effect, FileSystem dependencies)

### TASK-1.1: Convert source-parser.test.ts [AUTO]

**Implements:** DES-2, DES-3

**Description:** Convert source-parser tests to use `it.effect` and `Effect.flip` for error assertions. This is a pure Effect module with no service dependencies.

**Acceptance Criteria:**

- [x] Import from `@effect/vitest` instead of `vitest`
- [x] Replace `parse()` helper with direct Effect in `it.effect`
- [x] Replace `parseError()` helper with `Effect.flip` pattern
- [x] All tests pass: `pnpm test packages/core/src/experimental/skills/source-parser.test.ts`

**Dependencies:** None

---

### TASK-1.2: Convert content-hash.test.ts [AUTO]

**Implements:** DES-2, DES-3, DES-4, DES-5, DES-6

**Description:** Convert content-hash tests to use `it.effect` with `NodeContext.layer` provision. Tests use temp directories which remain in beforeEach/afterEach. The timestamp independence test uses `Date.now()` for mtime manipulation and needs `it.live`.

**Acceptance Criteria:**

- [x] Import from `@effect/vitest` instead of `vitest`
- [x] Replace `runEffect()` helper with `Effect.provide` inline or helper
- [x] Use `Effect.flip` for HashError assertion
- [x] Use `it.live` for "is independent of file timestamps" test
- [x] All tests pass: `pnpm test packages/core/src/experimental/skills/content-hash.test.ts`

**Dependencies:** None

---

### TASK-1.3: Convert settings.test.ts [AUTO]

**Implements:** DES-2, DES-3, DES-4, DES-5

**Description:** Convert settings tests to use `it.effect` with `NodeFileSystem.layer` provision.

**Acceptance Criteria:**

- [x] Import from `@effect/vitest` instead of `vitest`
- [x] Replace `runWithFileSystem()` helper with `Effect.provide` pattern
- [x] Use `Effect.flip` for SettingsNotFoundError and SettingsParseError assertions
- [x] All tests pass: `pnpm test packages/core/src/experimental/skills/settings.test.ts`

**Dependencies:** None

---

### TASK-1.4: Convert installer.test.ts [AUTO]

**Implements:** DES-2, DES-3, DES-4, DES-5, DES-6

**Description:** Convert installer tests to use `it.effect` with FileSystem layer provision. Includes tests with custom failing layers for symlink fallback. The concurrency test measures elapsed time and needs `it.live`.

**Acceptance Criteria:**

- [x] Import from `@effect/vitest` instead of `vitest`
- [x] Replace `runWithFileSystem()` helper with `Effect.provide` pattern
- [x] Use `Effect.flip` for InstallError assertions
- [x] Custom failing layer test uses `Effect.provide` directly
- [x] Use `it.live` for "runs installations concurrently" test (elapsed time check)
- [x] All tests pass: `pnpm test packages/core/src/experimental/skills/installer.test.ts`

**Dependencies:** None

---

### TASK-1.5: Convert lockfile.test.ts [AUTO]

**Implements:** DES-2, DES-3, DES-4, DES-6

**Description:** Convert lockfile tests to use `it.effect` with FileSystem/Path layers. The updatedAt timestamp test needs `it.live`.

**Acceptance Criteria:**

- [x] Import from `@effect/vitest` instead of `vitest`
- [x] Replace `runEffect()` helper with `Effect.provide` pattern
- [x] Use `Effect.flip` for LockfileError assertions
- [x] Use `it.live` for "updates the updatedAt timestamp" test
- [x] All tests pass: `pnpm test packages/core/src/experimental/skills/lockfile.test.ts`

**Dependencies:** None

---

### TASK-1.6: Convert git.test.ts [AUTO]

**Implements:** DES-2, DES-3, DES-4

**Description:** Convert git tests to use `it.effect`. These tests may use CommandExecutor or shell operations.

**Acceptance Criteria:**

- [x] Import from `@effect/vitest` instead of `vitest`
- [x] Convert Effect-based tests to `it.effect`
- [x] Use `Effect.flip` for error assertions
- [x] All tests pass: `pnpm test packages/core/src/experimental/skills/git.test.ts`

**Dependencies:** None

---

### TASK-1.7: Convert skill-discovery.test.ts [AUTO]

**Implements:** DES-2, DES-3, DES-4

**Description:** Convert skill-discovery tests to use `it.effect` with FileSystem layer.

**Acceptance Criteria:**

- [x] Import from `@effect/vitest` instead of `vitest`
- [x] Convert Effect-based tests to `it.effect`
- [x] Use `Effect.flip` for DiscoveryError assertions
- [x] All tests pass: `pnpm test packages/core/src/experimental/skills/skill-discovery.test.ts`

**Dependencies:** None

---

### TASK-1.8: Convert agent-detection.test.ts [AUTO]

**Implements:** DES-2, DES-4, DES-6

**Description:** Convert agent-detection tests to use `it.effect` with FileSystem layer. The concurrency test measures elapsed time and needs `it.live`.

**Acceptance Criteria:**

- [x] Import from `@effect/vitest` instead of `vitest`
- [x] Convert Effect-based tests to `it.effect`
- [x] Use `it.live` for elapsed time check test (if present)
- [x] All tests pass: `pnpm test packages/core/src/experimental/skills/agent-detection.test.ts`

**Dependencies:** None

---

### TASK-1.9: Convert wellknown.test.ts [AUTO]

**Implements:** DES-2, DES-3, DES-4

**Description:** Convert wellknown tests to use `it.effect` with HttpClient layer.

**Acceptance Criteria:**

- [x] Import from `@effect/vitest` instead of `vitest`
- [x] Convert Effect-based tests to `it.effect`
- [x] Use `Effect.flip` for WellKnownError assertions
- [x] All tests pass: `pnpm test packages/core/src/experimental/skills/wellknown.test.ts`

**Dependencies:** None

---

## Phase 2: Handler Tests (CLI handlers with service dependencies)

### TASK-2.1: Convert init/handler.test.ts [AUTO]

**Implements:** DES-2, DES-3, DES-4, DES-5, DES-6

**Description:** Convert init handler tests to use `it.effect` with NodeFileSystem layer. Uses temp directories and vi.mock for TTY utilities. The timestamp test requires `it.live` for real file mtimes.

**Acceptance Criteria:**

- [x] Import from `@effect/vitest` instead of `vitest`
- [x] Replace `runHandler()` and `runHandlerEither()` helpers with `it.effect` + `Effect.provide`
- [x] Use `Effect.flip` for InitError assertions
- [x] Use `it.live` for "does not modify settings file timestamp" test
- [x] Preserve vi.mock and vi.spyOn usage for TTY utilities
- [x] All tests pass: `pnpm test packages/cli/src/commands/init/handler.test.ts`

**Dependencies:** TASK-1.3 (settings tests use similar patterns)

---

### TASK-2.2: Convert skills/add/handler.test.ts [AUTO]

**Implements:** DES-2, DES-3, DES-4, DES-5

**Description:** Convert add handler tests to use `it.effect` with multi-service layer. Uses temp directories and vi.mock for TTY utilities.

**Acceptance Criteria:**

- [x] Import from `@effect/vitest` instead of `vitest`
- [x] Replace `runHandler()` and `runHandlerEither()` helpers with `it.effect` + `Effect.provide`
- [x] Use `Effect.flip` for AddError assertions
- [x] Preserve vi.mock and vi.spyOn usage for TTY utilities
- [x] All tests pass: `pnpm test packages/cli/src/commands/skills/add/handler.test.ts`

**Dependencies:** TASK-2.1 (similar handler test patterns)

---

### TASK-2.3: Convert skills/remove/handler.test.ts [AUTO]

**Implements:** DES-2, DES-3, DES-4, DES-5

**Description:** Convert remove handler tests to use `it.effect`.

**Acceptance Criteria:**

- [x] Import from `@effect/vitest` instead of `vitest`
- [x] Replace Effect run helpers with `it.effect` + `Effect.provide`
- [x] Use `Effect.flip` for RemoveError assertions
- [x] All tests pass: `pnpm test packages/cli/src/commands/skills/remove/handler.test.ts`

**Dependencies:** TASK-2.1 (similar handler test patterns)

---

## Phase 3: Validation

### TASK-3.1: Verify full test suite passes [AUTO]

**Implements:** All tasks

**Description:** Run the complete test suite to verify all conversions work correctly together.

**Acceptance Criteria:**

- [x] `pnpm test` passes with zero failures
- [x] `pnpm typecheck` passes

**Dependencies:** TASK-2.1, TASK-2.2, TASK-2.3

---

### TASK-3.2: Update testing skills if patterns evolved [HYBRID]

**Implements:** Documentation consistency

**Description:** Review and update testing skills based on patterns from effect.solutions/testing and implementation learnings.

**Acceptance Criteria:**

- [x] `/effect-testing` skill documents `it.live` for real-time tests (file timestamps, actual delays)
- [x] `/effect-testing` skill documents `it.effect.skip`, `it.effect.only`, `it.effect.fails` modifiers
- [x] `/effect-testing` skill notes TestClock starts at 0ms (affects time-dependent code)
- [x] `/testing-handler` skill reflects actual handler test patterns with Layer.mergeAll
- [x] `/testing-unit` skill references `it.effect` for Effect functions

**Dependencies:** TASK-3.1
