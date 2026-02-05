## Context

The `/effect-concurrency` skill establishes that `Effect.all` and `Effect.forEach` are sequential by default. For independent operations (especially I/O-bound work), explicit concurrency options should be added.

Current state:

- Most code correctly uses `{ concurrency: "unbounded" }` for independent I/O
- A few places use `"inherit"` or omit concurrency for small `Effect.all` calls
- The skill recommends `"unbounded"` for "small, known-size collections"

## Goals / Non-Goals

**Goals:**

- Align all `Effect.all`/`Effect.forEach` calls with the concurrency skill guidelines
- Make concurrency explicit for independent I/O operations
- Improve performance by parallelizing independent network/file operations

**Non-Goals:**

- Adding bounded concurrency (`concurrency: N`) - not needed for current use cases
- Refactoring sequential operations that have dependencies
- Adding new concurrency primitives (Semaphore, Queue, etc.)

## Decisions

### 1. Use `"unbounded"` for small, known-size `Effect.all` calls

**Decision:** Add `{ concurrency: "unbounded" }` to `Effect.all` calls with 2-3 independent I/O operations.

**Rationale:** The skill states `"unbounded"` is appropriate for "small, known-size collections." While the current code works (Effect's defaults are sensible), being explicit:

- Documents intent (these operations are independent)
- Ensures parallel execution regardless of context
- Aligns with the skill's checklist item: "Independent effects run concurrently"

**Alternative considered:** Leave as-is since defaults work. Rejected because explicit is better than implicit for concurrency.

### 2. Replace `"inherit"` with `"unbounded"` for network fetches

**Decision:** Change `ideal-state.ts` from `{ concurrency: "inherit" }` to `{ concurrency: "unbounded" }`.

**Rationale:** `"inherit"` defers to parent context, which may be sequential at top-level. For independent network requests (fetching latest versions), we want guaranteed parallelism. The skill notes `"inherit"` is for "library code, configurable pipelines" - this is application code with known requirements.

### 3. Add concurrency to validation forEach

**Decision:** Add `{ concurrency: "unbounded" }` to the outer `forEach` in `wellknown.ts` validation.

**Rationale:** While validation is mostly CPU-bound, the inner loop does file I/O. Explicit concurrency ensures consistent behavior and documents that skill validations are independent.

## Change Inventory

### 1. `packages/cli/src/workspace/ideal-state.ts:436`

**Issue:** Uses `{ concurrency: "inherit" }` for independent network requests.

**Before:**

```typescript
{ concurrency: "inherit" },
```

**After:**

```typescript
{ concurrency: "unbounded" },
```

**Rationale:** Each `fetchLatestVersion` call is independent. `"inherit"` may default to sequential at top-level. Network I/O should run in parallel.

---

### 2. `packages/cli/src/workspace/load-state.ts:628`

**Issue:** `Effect.all` with 2 independent I/O operations, no explicit concurrency.

**Before:**

```typescript
const [externalSkills, registrySkills] =
  yield * Effect.all([scanSkillsDir(externalSkillsDir), scanRegistryScopes(extensionsDir)]);
```

**After:**

```typescript
const [externalSkills, registrySkills] =
  yield *
  Effect.all([scanSkillsDir(externalSkillsDir), scanRegistryScopes(extensionsDir)], {
    concurrency: "unbounded",
  });
```

**Rationale:** Scanning two independent directories should run in parallel. Makes intent explicit.

---

### 3. `packages/cli/src/workspace/load-state.ts:662`

**Issue:** `Effect.all` with 2 independent I/O operations, no explicit concurrency.

**Before:**

```typescript
const [actualSkills, lockedSkills] =
  yield * Effect.all([loadActualSkills(ws.path), readLockfile(ws.path)]);
```

**After:**

```typescript
const [actualSkills, lockedSkills] =
  yield *
  Effect.all([loadActualSkills(ws.path), readLockfile(ws.path)], { concurrency: "unbounded" });
```

**Rationale:** Loading skills from disk and reading lockfile are independent. Makes intent explicit.

---

### 4. `packages/cli/src/agents/codex/detection.ts:27`

**Issue:** `Effect.all` with 2 independent file existence checks, no explicit concurrency.

**Before:**

```typescript
const [codexExists, etcExists] =
  yield * Effect.all([fs.exists(codexHome), fs.exists("/etc/codex")]);
```

**After:**

```typescript
const [codexExists, etcExists] =
  yield * Effect.all([fs.exists(codexHome), fs.exists("/etc/codex")], { concurrency: "unbounded" });
```

**Rationale:** Two independent file existence checks. Makes intent explicit.

---

### 5. `packages/cli/src/extensions/skills/wellknown.ts:237`

**Issue:** Outer `Effect.forEach` for skill validation has only `{ discard: true }`, missing concurrency.

**Before:**

```typescript
    { discard: true },
  );
```

(at end of outer forEach, line 237)

**After:**

```typescript
    { concurrency: "unbounded", discard: true },
  );
```

**Rationale:** Each skill validation is independent. The inner forEach (line 234) already uses `{ discard: true }` and could also benefit from concurrency, but the inner loop is typically small (few files per skill), so outer concurrency is sufficient.

---

## Risks / Trade-offs

**[Risk] Increased parallel file operations** → Mitigation: File system operations are already parallelized elsewhere in the codebase without issues. The changes affect small, bounded collections (2-3 items or known skill counts).

**[Risk] Network request spikes** → Mitigation: `fetchLatestVersion` calls are bounded by the number of skills being updated, typically small. If this becomes an issue in the future, can add bounded concurrency.

**[Trade-off] Slightly more verbose code** → Acceptable: Explicit concurrency options are a few extra characters but document intent clearly.
