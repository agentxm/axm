## Context

Test suite audit identified gaps between current implementation and documented testing guidelines in CLAUDE.md, testing skills, and CLI spec.

### Current State

| Area                    | Compliance   | Notes                                    |
| ----------------------- | ------------ | ---------------------------------------- |
| Test quality principles | Excellent    | Isolation, determinism, behavioral focus |
| Effect patterns         | Excellent    | runPromise, layers, error handling       |
| Handler tests           | Complete     | All handlers have `handler.test.ts`      |
| E2E tests               | Good         | Major flows covered                      |
| Command tests           | Missing      | No yargs parsing tests                   |
| Core test location      | Inconsistent | Uses `__tests__/` vs colocation          |

### Relevant Guidelines

From CLI spec (`openspec/specs/cli/spec.md`):

> Tests are colocated with the handler file as `handler.test.ts`
> Tests are NOT placed in separate `__tests__/` directories

From testing-unit skill:

> Location: colocated with source (e.g., `packages/core/src/**/*.test.ts`)

## Goals / Non-Goals

**Goals:**

- Add command tests for yargs parsing validation
- Colocate core tests with source files
- Add E2E test for root command

**Non-Goals:**

- Changing test patterns (already excellent)
- Adding tests for test utility files
- Modifying existing test assertions

## Decisions

### DES-1: Command Test Pattern

Command tests verify yargs command definition, not handler logic.

```typescript
// command.test.ts pattern
describe("init command", () => {
  it("registers with correct description", () => {
    expect(initCommand.describe).toBe("...");
  });

  it("defines expected options", () => {
    const options = buildOptions();
    expect(options.yes).toBeDefined();
  });
});
```

Alternatives:

- Test commands via E2E only: Rejected—too slow for option validation
- Mock yargs entirely: Rejected—tests internal implementation

### DES-2: Core Test Relocation

Move tests from `__tests__/` to colocated files:

- `source-parser.test.ts` alongside `source-parser.ts`
- Same for all other modules

Alternatives:

- Keep `__tests__/` for core: Rejected—inconsistent with guidelines
- Create separate test directory structure: Rejected—diverges from skills

### DES-3: Root Command E2E Test

Add E2E test verifying `axm` (no args) shows help and exits 0, per CLI spec.

## Risks / Trade-offs

| Risk                      | Mitigation                            |
| ------------------------- | ------------------------------------- |
| Many file moves for core  | Atomic rename commits, update imports |
| Git history fragmentation | Use `git mv` for history preservation |

## Migration Plan

1. Add command tests (no file moves)
2. Add E2E root command test (no file moves)
3. Relocate core tests one module at a time with `git mv`
4. Remove empty `__tests__/` directory
