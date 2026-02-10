## Context

The codebase uses Effect as its standard library but contains pockets of imperative code within `Effect.gen` blocks. These patterns emerged during rapid development and work correctly, but they:

- Mix paradigms (mutable state inside Effect generators)
- Miss parallelization opportunities
- Make code harder to reason about for Effect-familiar developers

This refactoring brings consistency without changing behavior.

## Goals / Non-Goals

**Goals:**

- Replace mutable array accumulation with functional composition
- Replace for loops with `Effect.forEach` / `Effect.all`
- Enable parallelization where order doesn't matter
- Preserve exact behavior and error semantics

**Non-Goals:**

- Adding new features or capabilities
- Changing public APIs
- Optimizing performance beyond parallelization
- Refactoring test files (focus on production code)

## Decisions

### 1. Recursive directory walking → `Effect.forEach` + `Array.flat()`

**Pattern:** `skill-discovery.ts:63-86`, `content-hash.ts:60-87`

**Current:**

```typescript
const results: string[] = [];
for (const entry of entries) {
  const stat = yield * fs.stat(fullPath);
  if (stat.type === "Directory") {
    const subResults = yield * walkDirectory(fullPath);
    results.push(...subResults);
  } else if (stat.type === "File") {
    results.push(fullPath);
  }
}
return results;
```

**Idiomatic:**

```typescript
const nestedResults =
  yield *
  Effect.forEach(
    entries,
    (entry) =>
      Effect.gen(function* () {
        const fullPath = path.join(dir, entry);
        const stat = yield* fs.stat(fullPath).pipe(Effect.option);
        if (Option.isNone(stat)) return [];
        if (stat.value.type === "Directory") {
          return yield* walkDirectory(fullPath);
        }
        if (stat.value.type === "File") {
          return [fullPath];
        }
        return [];
      }),
    { concurrency: "unbounded" },
  );
return nestedResults.flat();
```

**Rationale:** Each entry is independent—parallelization is safe. Returning arrays and flattening avoids mutation. `Effect.option` handles errors cleanly.

---

### 2. Directory scanning with filtering → `Effect.forEach` + `Effect.filter`

**Pattern:** `local-path.ts:88-115`

**Current:**

```typescript
const results: ExtensionRef[] = [];
for (const { file, type } of EXTENSION_FILES) {
  const exists = yield* fileExists(filePath);
  if (exists) {
    const hasSkillAlready = results.some((r) => r.type === "skill");
    if (type === "skill" && hasSkillAlready) continue;
    results.push({ type, source: "path", ... });
  }
}
return results;
```

**Idiomatic:**

```typescript
const allRefs = yield* Effect.forEach(
  EXTENSION_FILES,
  ({ file, type }) => Effect.gen(function* () {
    const exists = yield* fileExists(filePath);
    if (!exists) return Option.none();
    return Option.some({ type, source: "path", ... });
  })
);

// Filter out None values and dedupe skills
const refs = allRefs.filter(Option.isSome).map((o) => o.value);
const seenSkill = refs.findIndex((r) => r.type === "skill");
return refs.filter((r, i) => r.type !== "skill" || i === seenSkill);
```

**Rationale:** File existence checks can run in parallel. Post-processing handles the "first skill only" logic without mid-loop state checks. Separation of concerns: Effect handles async, pure functions handle filtering.

---

### 3. Index-based validation → `Effect.forEach` with indexed entries

**Pattern:** `wellknown.ts:176-229`

**Current:**

```typescript
for (let i = 0; i < skills.length; i++) {
  const skill = skills[i];
  if (typeof skill !== "object") {
    return Effect.fail(new Error(`Skill at index ${i} must be an object`));
  }
  // ... more validation
}
```

**Idiomatic:**

```typescript
yield *
  Effect.forEach(
    skills.map((skill, i) => [skill, i] as const),
    ([skill, i]) =>
      Effect.gen(function* () {
        if (typeof skill !== "object" || skill === null) {
          return yield* Effect.fail(
            new WellKnownInvalidIndexError({
              message: `Skill at index ${i} must be an object`,
              url,
            }),
          );
        }
        // ... more validation per skill
      }),
    { discard: true },
  );
```

**Rationale:** `Array.map` with index provides the tuple `[skill, i]`. Effect.forEach with `{ discard: true }` validates all items, failing fast on first error. Preserves index for error messages.

---

### 4. Sequential updates → Parallel `Effect.all`

**Pattern:** `handler.ts:279-315`, `handler.ts:420-456`

**Current:**

```typescript
for (const { skillName, contentHash } of installResults) {
  yield * updateLockEntry(axmDir, skillName, lockEntry);
  yield * updateSettings(axmDir, { skills: { [skillName]: "*" } });
}
```

**Idiomatic:**

```typescript
yield* Effect.forEach(
  installResults,
  ({ skillName, contentHash }) => {
    const lockEntry = { source: parsed.canonical, ... };
    return Effect.all([
      updateLockEntry(axmDir, skillName, lockEntry),
      updateSettings(axmDir, { skills: { [skillName]: "*" } }),
    ]);
  },
  { concurrency: "unbounded" }
);
```

**Rationale:** Lock and settings updates for different skills are independent. Each skill's lock + settings update can also run in parallel (inner `Effect.all`). Outer `Effect.forEach` parallelizes across skills.

## Risks / Trade-offs

| Risk                                      | Mitigation                                                                       |
| ----------------------------------------- | -------------------------------------------------------------------------------- |
| Parallel execution changes error ordering | Accept: first error wins is Effect's default; behavior is consistent             |
| Parallel file system ops could hit limits | Use `{ concurrency: 10 }` if issues arise; start with unbounded                  |
| Subtle behavior changes in edge cases     | Existing tests must pass without modification; add edge case tests if gaps found |
| Increased memory from collecting arrays   | Negligible for expected directory sizes; revisit if profiling shows issues       |

## Open Questions

_None—patterns are straightforward refactoring with well-established Effect idioms._
