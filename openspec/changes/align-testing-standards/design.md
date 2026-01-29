# Design: Align Testing Standards

## Overview

This design documents the systematic approach to auditing and aligning tests with project standards. The work is organized by test category and priority.

## Test Inventory

### Current State

| Package | Location                                      | Files | Pattern                               |
| ------- | --------------------------------------------- | ----- | ------------------------------------- |
| CLI     | `src/commands/**/handler.test.ts`             | 3     | Colocated (compliant)                 |
| CLI     | `src/main.test.ts`                            | 1     | Colocated (compliant)                 |
| CLI     | `e2e/*.test.ts`                               | 4     | E2E directory (compliant)             |
| Core    | `src/experimental/skills/__tests__/*.test.ts` | 9     | Separate `__tests__/` (non-compliant) |
| Core    | `src/index.test.ts`                           | 1     | Colocated (compliant)                 |

### Target State

All core package tests move from `__tests__/` to colocated files:

```
packages/core/src/experimental/skills/
  content-hash.ts
  content-hash.test.ts        # moved from __tests__/
  git.ts
  git.test.ts                 # moved from __tests__/
  settings.ts
  settings.test.ts            # moved from __tests__/
  source-parser.ts
  source-parser.test.ts       # moved from __tests__/
  ...
```

## Checklist Audit Matrix

### Testing Basics Checklist (All Tests)

| Quality               | Status           | Notes                        |
| --------------------- | ---------------- | ---------------------------- |
| Isolated              | ✅ Most          | All use fresh temp dirs      |
| Composable            | ✅               | Tests are independent        |
| Deterministic         | ✅               | Same results on re-run       |
| Fast                  | ✅ Unit / ⚠️ E2E | E2E tests acceptable         |
| Writable              | ✅               | Good helper patterns         |
| Readable              | ⚠️               | Some names could improve     |
| Behavioral            | ⚠️               | Some test implementation     |
| Structure-insensitive | ✅               | Tests behavior not structure |
| Automated             | ✅               | All via vitest               |
| Specific              | ✅               | Clear assertions             |
| Predictive            | ✅               | Good coverage                |
| Inspiring             | ✅               | Passing builds confidence    |

### Handler Test Checklist

| Item                 | init.handler | skills/add/handler |
| -------------------- | ------------ | ------------------ |
| Fresh temp directory | ✅           | ✅                 |
| Reset cwd            | ✅           | ✅                 |
| Provide layers       | ✅           | ✅                 |
| Error paths tested   | ✅           | ⚠️ Partial         |

### E2E Test Checklist

| Item                  | init.test | skills.test | skills-add.test |
| --------------------- | --------- | ----------- | --------------- |
| Use createTempDir()   | ✅        | ✅          | ✅              |
| Initialize first      | N/A       | ✅          | ✅              |
| Specify --agent       | ⚠️ Some   | ✅          | ✅              |
| Exit codes verified   | ✅        | ✅          | ✅              |
| stdout/stderr checked | ✅        | ✅          | ✅              |
| File system verified  | ✅        | ✅          | ✅              |
| Use fixtures          | N/A       | ✅          | ✅              |

### Effect Testing Checklist

| Item                       | Status                 |
| -------------------------- | ---------------------- |
| Effect.runPromise in tests | ✅ All                 |
| Effect.either for errors   | ⚠️ Inconsistent naming |
| Effect.provide for deps    | ✅ All                 |
| Helpers per describe       | ⚠️ Inconsistent        |

## Implementation Approach

### Phase 1: File Reorganization

Move core test files from `__tests__/` to colocated positions:

1. Move file
2. Update imports in test file
3. Run tests to verify
4. Commit

Files to move:

- `agent-detection.test.ts`
- `content-hash.test.ts`
- `git.test.ts`
- `installer.test.ts`
- `lockfile.test.ts`
- `settings.test.ts`
- `skill-discovery.test.ts`
- `source-parser.test.ts`
- `wellknown.test.ts`

### Phase 2: Standardize Effect Helpers

Audit and align helper function naming across all test files:

| Current             | Standard    |
| ------------------- | ----------- |
| `runEffect`         | `run`       |
| `runWithFileSystem` | `run`       |
| `runHandlerEither`  | `runEither` |

### Phase 3: Add Missing Error Tests

Identify error types and ensure coverage:

| Module        | Error Type              | Test Coverage     |
| ------------- | ----------------------- | ----------------- |
| content-hash  | `HashError`             | ✅ Tested         |
| source-parser | `ParseError`            | ⚠️ Add edge cases |
| settings      | `SettingsNotFoundError` | ✅ Tested         |
| settings      | `SettingsParseError`    | ✅ Tested         |
| lockfile      | `LockfileError`         | ⚠️ Add tests      |
| git           | `GitError`              | ⚠️ Add tests      |
| installer     | `InstallError`          | ⚠️ Add tests      |

### Phase 4: Improve Test Names

Review all test names for behavioral descriptions:

Before:

```typescript
it("computes a hash in sha256:<hex> format", ...)
```

After:

```typescript
it("returns hash in sha256:<hex> format", ...)
```

Focus on verbs that describe observable behavior: "returns", "creates", "fails with", "preserves".

## Verification

After each phase:

1. Run `pnpm test` - all tests pass
2. Run `pnpm typecheck` - no type errors
3. Verify imports resolve correctly

## Dependencies

- Phase 2 can start after Phase 1 completes
- Phase 3 can run in parallel with Phase 2
- Phase 4 can run in parallel with Phases 2-3
