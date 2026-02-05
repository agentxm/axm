## Context

The codebase has 7 functions using `for` + `yield*` + `push` patterns for I/O operations. This anti-pattern was identified during guidance updates and represents missed parallelization opportunities. Each location processes independent items sequentially when they could run concurrently.

Current state: All 7 functions work correctly but run slower than necessary due to sequential I/O.

## Goals / Non-Goals

**Goals:**

- Refactor all 7 identified functions to use `Effect.forEach` with concurrency
- Eliminate mutable array patterns in favor of immutable returns
- Improve I/O throughput for file system and HTTP operations

**Non-Goals:**

- Changing any external behavior or API signatures
- Adding new tests (existing tests should continue to pass)
- Optimizing pure synchronous loops (those are fine as-is)

## Decisions

### 1. Concurrency Level: `"unbounded"` for all refactored locations

**Rationale:** All 7 locations process small, bounded collections:

- Agent syncing: typically 1-3 agents
- File copying: skill directories have ~5-20 files
- GitHub API calls: typically 1-10 skills
- Well-known fetches: skill file lists are small

**Alternative considered:** Bounded concurrency (`concurrency: 10`) — rejected because collections are already small and the overhead of semaphore management isn't justified.

### 2. Refactoring Pattern

Transform this:

```typescript
const results: T[] = [];
for (const item of items) {
  const result = yield * processItem(item);
  results.push(result);
}
return results;
```

To this:

```typescript
return yield * Effect.forEach(items, (item) => processItem(item), { concurrency: "unbounded" });
```

For side-effect-only loops (no return value), add `{ discard: true }`:

```typescript
yield *
  Effect.forEach(items, (item) => processItem(item), { concurrency: "unbounded", discard: true });
```

### 3. Recursive `copyDirectory` handling

The `copyDirectory` function is recursive (directories contain subdirectories). Strategy:

- Parallelize file operations within each directory level
- Keep recursion sequential (depth-first) to avoid complex coordination
- This still provides significant speedup for wide directories

### 4. Well-known file fetches: preserve directory creation order

Files may have nested paths (e.g., `references/commands.md`). Current code creates parent directories before writing files. With parallelization:

- Use `Effect.forEach` with `{ concurrency: "unbounded" }`
- Each file operation creates its own parent directory with `{ recursive: true }`
- No ordering dependency since `mkdir -p` is idempotent

## Risks / Trade-offs

**[Risk] Race conditions in directory creation** → Mitigated by using `makeDirectory({ recursive: true })` which is idempotent.

**[Risk] Error handling changes** → Effect.forEach with concurrency uses fail-fast by default (interrupts on first error), same as sequential behavior. No change needed.

**[Risk] Test flakiness from parallelism** → Low risk since operations are independent. Existing tests mock file system, so parallelism is transparent.

**[Trade-off] Increased concurrent connections** → Acceptable for small collections. If future use cases involve large collections, add bounded concurrency at that time.
