## Why

The codebase uses inconsistent array type patterns (`readonly T[]`, `ReadonlyArray<T>`) instead of Effect's `Array.Array<T>` in type signatures. Additionally, consuming code uses native array methods (`.filter(Option.isSome).map(opt => opt.value)`, `.find()`, `arr[0]`) where Effect utilities (`Array.getSomes`, `Array.findFirst`, `Array.head`) would be more idiomatic and type-safe.

## What Changes

- **Standardize array types in public signatures** — Replace mutable `T[]` with `Array.Array<T>` in exported functions and interfaces
- **Update consuming code to use Effect Array utilities** — Replace native methods with idiomatic Effect patterns throughout
- **Fix unsafe index access** — Replace `arr[0]` and `arr[index]` with `Array.head` and `Array.get` (return Option)
- **No changes to Chunk/HashMap** — Current absence is correct (no repeated concat, no complex keys)
- **No changes to Record types** — Already correctly using `Record.ReadonlyRecord<string, T>` in public signatures

## Capabilities

### New Capabilities

None — this is a refactoring change to align existing code with conventions.

### Modified Capabilities

None — no spec-level behavior changes, only implementation alignment.

## Impact

### 1. Array Type Signatures (~15 public signatures)

| File                                       | Lines    | Pattern                              | Context                   |
| ------------------------------------------ | -------- | ------------------------------------ | ------------------------- |
| `agents/registry.ts`                       | 137, 156 | `AgentId[]`, `AgentConfig[]`         | Public API return types   |
| `utils/errors.ts`                          | 35       | `details?: string[]`                 | Public function parameter |
| `e2e/utils.ts`                             | 55       | `args: string[]`                     | Public function parameter |
| `cli-commands/init/command.ts`             | 7        | `agent: string[]`                    | Interface property        |
| `cli-commands/skills/install/command.ts`   | 8-9      | `agent: string[]`, `skill: string[]` | Interface properties      |
| `cli-commands/skills/uninstall/command.ts` | 13       | `agent: string[]`                    | Interface property        |
| `workspace/load-state.ts`                  | 104      | `agents: string[]`                   | Interface property        |

### 2. Replace `.filter(Option.isSome).map(...)` with `Array.getSomes`

| File                                       | Lines   | Current Pattern                                                  |
| ------------------------------------------ | ------- | ---------------------------------------------------------------- |
| `cli-commands/skills/install/handler.ts`   | 382-385 | `.map(getAgentById).filter(Option.isSome).map(opt => opt.value)` |
| `cli-commands/skills/install/handler.ts`   | 411-415 | Same pattern                                                     |
| `cli-commands/skills/uninstall/handler.ts` | 273-278 | Same pattern                                                     |
| `cli-commands/skills/uninstall/handler.ts` | 406-409 | Same pattern                                                     |

**Idiomatic replacement:**

```typescript
// Before
agents = args.agent
  .map((id) => getAgentById(id))
  .filter(Option.isSome)
  .map((opt) => opt.value);

// After
agents = pipe(
  args.agent,
  Array.map((id) => getAgentById(id)),
  Array.getSomes,
);
```

### 3. Replace `.map().filter().map()` chains with `Array.filterMap`

| File                      | Lines   | Current Pattern                                  |
| ------------------------- | ------- | ------------------------------------------------ |
| `clack-effect/service.ts` | 152-163 | `.map().filter().map()` chain for initialIndices |
| `clack-effect/service.ts` | 191-192 | `.map().filter(undefined)` chain                 |

### 4. Replace `.find()` with `Array.findFirst` (returns Option)

| File                                       | Lines    | Current Pattern                       |
| ------------------------------------------ | -------- | ------------------------------------- |
| `cli-commands/skills/uninstall/handler.ts` | 150      | `.find((s) => s.name === args.skill)` |
| `cli-commands/skills/uninstall/handler.ts` | 270      | `.find()` with type guard             |
| `workspace/apply.ts`                       | 481, 534 | `.find((a) => a.id === agentId)`      |
| `extensions/skills/github-api.ts`          | 140      | `.find()` for tree entry              |
| `extensions/skills/wellknown.ts`           | 393-394  | `.find()` for skill file              |

### 5. Replace unsafe index access with `Array.head`/`Array.get`

| File                             | Line | Current Pattern               | Risk   |
| -------------------------------- | ---- | ----------------------------- | ------ |
| `cli-commands/skills/utils.ts`   | 68   | `refs[0]` after length check  | HIGH   |
| `workspace/load-state.ts`        | 703  | `actualList[0]` without guard | MEDIUM |
| `cli-commands/skills/display.ts` | 52   | `.split(":")[1]` with `??`    | MEDIUM |
| `agents/detection.ts`            | 50   | `.split("/")[0]?`             | MEDIUM |

**Idiomatic replacement:**

```typescript
// Before
const ref = refs[0];

// After
const ref = Array.head(refs);
// Then use Option.match or Option.getOrThrow where appropriate
```

### 6. Fix double-call anti-pattern

| File                                     | Lines   | Issue                                    |
| ---------------------------------------- | ------- | ---------------------------------------- |
| `cli-commands/skills/install/handler.ts` | 388-389 | Calls `getAgentById()` twice per element |

**Before:**

```typescript
const validIds = args.agent.filter((id) => Option.isSome(getAgentById(id)));
const invalidIds = args.agent.filter((id) => Option.isNone(getAgentById(id)));
```

**After (single pass):**

```typescript
const [validIds, invalidIds] = pipe(
  args.agent,
  Array.partition((id) => Option.isSome(getAgentById(id))),
);
```

### 7. Update native `.map()`/`.filter()` to Effect utilities (consistency)

| File                                       | Lines             | Pattern                                 |
| ------------------------------------------ | ----------------- | --------------------------------------- |
| `workspace/service.ts`                     | 148, 168          | `.map((a) => a.id)`                     |
| `cli-commands/skills/install/handler.ts`   | 557-558, 622, 631 | `.filter()` and `.map()`                |
| `cli-commands/skills/uninstall/handler.ts` | 359               | `.filter()`                             |
| `agents/detection.ts`                      | 142-149           | `.map()` + `Effect.all()` + `.filter()` |

### 8. Replace array destructuring with Effect utilities

| File                     | Line | Pattern                                 |
| ------------------------ | ---- | --------------------------------------- |
| `resolution/resolver.ts` | 120  | `const [resolver, ...rest] = remaining` |

**After:**

```typescript
const head = Array.head(remaining);
const tail = Array.tailNonEmpty(remaining);
```

### Already Correct (No Changes Needed)

- `workspace/service.ts:105-107` — Uses `Arr.filterMap()` correctly
- `workspace/ideal-state.ts` — Uses piped `Arr.filter`, `Arr.filterMap` correctly
- `workspace/plan.ts` — Uses `Arr.findFirst`, `Arr.filterMap` correctly
- Record types — All use `Record.ReadonlyRecord<string, T>` in public signatures
- Chunk/HashMap — Correctly absent (no use cases)

**No breaking changes** — All modifications are internal type annotations and implementation details.
