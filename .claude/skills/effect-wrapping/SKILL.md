---
name: effect-wrapping
description: Wrap Promise-based APIs with Effect conventions. Use when integrating third-party libraries or wrapping any Promise-returning code.
user-invocable: false
---

# Effect Wrapping

Wrap Promise-based APIs to integrate with the Effect ecosystem.

---

## Wrapping Pattern

```typescript
import * as lib from "some-lib";
import { Effect, Data } from "effect";

export class LibError extends Data.TaggedError("LibError")<{
  readonly cause: unknown;
}> {}

export const wrappedFn = (opts: Parameters<typeof lib.fn>[0]) =>
  Effect.tryPromise({
    try: () => lib.fn(opts),
    catch: (error) => new LibError({ cause: error }),
  });
```

---

## Third-Party Library Wrappers

When wrapping an entire third-party library, create a dedicated wrapper module.

**Location:** `packages/cli/src/<lib>-effect/`

**Naming:** `<lib>-effect` (e.g., `clack-effect`, `octokit-effect`)

**Structure:**

```
<lib>-effect/
  index.ts              # Re-exports public API
  errors.ts             # TaggedError types
  <module>.ts           # Wrapped functions by domain
```

---

## Effect Wrapping Checklist

- [ ] **Effect.tryPromise** — Wrap all Promise-returning functions
- [ ] **Typed errors** — Define TaggedError types for failure cases
- [ ] **Preserve signatures** — Wrappers accept same options as originals
- [ ] **Re-export via index** — Public API exported from index.ts (for library wrappers)
- [ ] **Let Effect infer types** — Don't add explicit return type annotations
