---
status: active
last-reviewed: 2026-04-03
version: 0.2.0
description: Common v3 to v4 renames and migration patterns
depends-on: [./effect.md]
---

# Effect v4 Quick Reference

Short migration reference for the Effect v4 APIs used in this repo. Use it when
you encounter older examples, outdated blog posts, or code copied from v3-era
projects.

> [Effect](../../CLAUDE.md#effect) - duplicate agent copy

## Key Resources

- [Effect Guide](./effect.md) - Main Effect orientation for this repo
- [Effect Option Guide](./effect-option.md) - Option and nullable boundaries
- [effect-smol source](../../../external/Effect-TS/effect-smol) - Effect v4
  source, tests, and API reference; see `MIGRATION.md` and `migration/` there
  for v3 → v4 details by topic

---

## Services

`Context.Tag` became `ServiceMap.Service`.

```typescript
// v3
class Database extends Context.Tag("Database")<Database, Shape>() {}

// v4
class Database extends ServiceMap.Service<Database, Shape>()("Database") {}
```

---

## Error Catching

| v3                      | v4                   |
| ----------------------- | -------------------- |
| `Effect.catchAll`       | `Effect.catch`       |
| `Effect.catchAllCause`  | `Effect.catchCause`  |
| `Effect.catchAllDefect` | `Effect.catchDefect` |
| `Effect.catchSome`      | `Effect.catchFilter` |

---

## Forking and Yieldables

| v3                  | v4                  |
| ------------------- | ------------------- |
| `Effect.fork`       | `Effect.forkChild`  |
| `Effect.forkDaemon` | `Effect.forkDetach` |
| `Effect.either`     | `Effect.result`     |
| `Effect.context`    | `Effect.services`   |

`Ref`, `Deferred`, and `Fiber` are no longer yieldable Effects.

```typescript
const value = yield * Ref.get(myRef);
yield * Deferred.await(myDeferred);
const result = yield * Fiber.join(myFiber);
```

---

## Imports

Platform modules moved into the `effect` package namespace.

```typescript
// old
import { FileSystem } from "@effect/platform/FileSystem";
import { Path } from "@effect/platform/Path";
import { NodeContext } from "@effect/platform-node/NodeContext";

// v4
import { FileSystem } from "effect/FileSystem";
import { Path } from "effect/Path";
import { NodeServices } from "@effect/platform-node/NodeServices";
```

---

## See Also

- [Effect Guide](./effect.md) - Service, error, and runtime patterns
- [TypeScript Style Guide](./typescript-style.md) - Narrowing and assertions
