# Tasks: Align Effect patterns with documented conventions

## Phase 1: Error Type Standardization

### TASK-1.1: Add retryable field to InitError [AUTO]

**Implements:** DES-1

**Description:** Add `retryable: boolean` field to `InitError` in the init handler.
Update all construction sites to set appropriate values.

**Acceptance Criteria:**

- [x] `InitError` class includes `readonly retryable: boolean` field
- [x] All `new InitError({...})` calls include `retryable: false` (validation errors)
- [x] `pnpm typecheck` exits 0
- [x] `pnpm test packages/cli/src/commands/init/handler.test.ts` exits 0

**Dependencies:** None

### TASK-1.2: Add retryable field to AddError [AUTO]

**Implements:** DES-1

**Description:** Add `retryable: boolean` field to `AddError` in the skills add handler.
Update all construction sites to set appropriate values.

**Acceptance Criteria:**

- [x] `AddError` class includes `readonly retryable: boolean` field
- [x] Network-related errors set `retryable: true`
- [x] Validation errors set `retryable: false`
- [x] `pnpm typecheck` exits 0
- [x] `pnpm test packages/cli/src/commands/skills/add/handler.test.ts` exits 0

**Dependencies:** None

### TASK-1.3: Add retryable field to DiscoveryError [AUTO]

**Implements:** DES-1

**Description:** Add `retryable: boolean` field to `DiscoveryError` in skill-discovery.ts.
Update all construction sites.

**Acceptance Criteria:**

- [x] `DiscoveryError` class includes `readonly retryable: boolean` field
- [x] All construction sites set appropriate values (file system errors not retryable)
- [x] `pnpm typecheck` exits 0
- [x] `pnpm test packages/core/src/experimental/skills/skill-discovery.test.ts` exits 0

**Dependencies:** None

### TASK-1.4: Add retryable field to InstallError [AUTO]

**Implements:** DES-1

**Description:** Add `retryable: boolean` field to `InstallError` in installer.ts.
Update all construction sites.

**Acceptance Criteria:**

- [x] `InstallError` class includes `readonly retryable: boolean` field
- [x] All construction sites set appropriate values (file operations not retryable)
- [x] `pnpm typecheck` exits 0
- [x] `pnpm test packages/core/src/experimental/skills/installer.test.ts` exits 0

**Dependencies:** None

### TASK-1.5: Add retryable field to HashError [AUTO]

**Implements:** DES-1

**Description:** Add `retryable: boolean` field to `HashError` in content-hash.ts.
Update all construction sites.

**Acceptance Criteria:**

- [x] `HashError` class includes `readonly retryable: boolean` field
- [x] All construction sites set `retryable: false` (file read errors not retryable)
- [x] `pnpm typecheck` exits 0
- [x] `pnpm test packages/core/src/experimental/skills/content-hash.test.ts` exits 0

**Dependencies:** None

### TASK-1.6: Add retryable field to lockfile errors [AUTO]

**Implements:** DES-1

**Description:** Add `retryable: boolean` field to `LockfileParseError` and
`LockfileWriteError` in lockfile.ts. Update all construction sites.

**Acceptance Criteria:**

- [x] `LockfileParseError` class includes `readonly retryable: boolean` field
- [x] `LockfileWriteError` class includes `readonly retryable: boolean` field
- [x] All construction sites set `retryable: false` (parse/write errors not retryable)
- [x] `pnpm typecheck` exits 0
- [x] `pnpm test packages/core/src/experimental/skills/lockfile.test.ts` exits 0

**Dependencies:** None

## Phase 2: Network Resilience

### TASK-2.1: Add retry policy to wellknown.ts [AUTO]

**Implements:** DES-2

**Description:** Add `Effect.retry()` with exponential backoff to HTTP operations in
wellknown.ts. Retry only when `error.retryable === true`. Use 3 retries with 1s base
delay.

**Acceptance Criteria:**

- [x] `fetchWellKnownIndex` uses `Effect.retry()` with exponential backoff
- [x] `fetchSkillFiles` uses `Effect.retry()` with exponential backoff
- [x] Retry policy uses `Schedule.whileInput((error) => error.retryable)`
- [x] Maximum 3 retry attempts
- [x] Base delay is 1 second with exponential increase
- [x] `pnpm typecheck` exits 0
- [x] `pnpm test packages/core/src/experimental/skills/wellknown.test.ts` exits 0

**Dependencies:** None

## Phase 3: Concurrency Optimization

### TASK-3.1: Parallelize skill installation in add handler [AUTO]

**Implements:** DES-3

**Description:** Refactor the skill installation loop in `installSkillsFromFileSystem`
to use `Effect.all()` with unbounded concurrency instead of sequential processing.

**Acceptance Criteria:**

- [x] Skills are installed using `Effect.all([...], { concurrency: "unbounded" })`
- [x] Results are collected and processed correctly
- [x] Lockfile and settings updates remain sequential (after all installs complete)
- [x] `pnpm typecheck` exits 0
- [x] `pnpm test packages/cli/src/commands/skills/add/handler.test.ts` exits 0

**Dependencies:** TASK-1.2

## Phase 4: Test Pattern Cleanup

### TASK-4.1: Convert test helper to async/await [AUTO]

**Implements:** DES-4

**Description:** Convert the `parseError` test helper in source-parser.test.ts from
`.then()` chain to async/await for consistency with `/effect-testing` patterns.

**Acceptance Criteria:**

- [x] `parseError` helper uses `async/await` instead of `.then()`
- [x] All tests using the helper still pass
- [x] `pnpm test packages/core/src/experimental/skills/source-parser.test.ts` exits 0

**Dependencies:** None

## Phase 5: Error Context Completeness

### TASK-5.1: Add cause field to validation errors [AUTO]

**Implements:** DES-5

**Description:** Ensure validation error paths in init handler include `cause` field
for debugging. The unknown agent error at line 130 is missing cause.

**Acceptance Criteria:**

- [x] Unknown agent error includes original validation context as `cause`
- [x] Error message remains user-friendly
- [x] `pnpm typecheck` exits 0
- [x] `pnpm test packages/cli/src/commands/init/handler.test.ts` exits 0

**Dependencies:** TASK-1.1

## Phase 6: Validation

### TASK-6.1: Run full test suite [AUTO]

**Implements:** All requirements

**Description:** Run the full test suite to verify all changes work together and no
regressions were introduced.

**Acceptance Criteria:**

- [x] `pnpm test` exits 0
- [x] `pnpm test:e2e` exits 0
- [x] `pnpm typecheck` exits 0
- [x] `pnpm lint` exits 0

**Dependencies:** TASK-1.1, TASK-1.2, TASK-1.3, TASK-1.4, TASK-1.5, TASK-1.6, TASK-2.1, TASK-3.1, TASK-4.1, TASK-5.1
