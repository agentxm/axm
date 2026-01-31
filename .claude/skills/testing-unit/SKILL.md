---
name: testing-unit
description: Unit test patterns for pure functions and business logic. Use for *.test.ts colocated with source in packages/core/ or packages/cli/src/.
user-invocable: false
---

# Unit Testing Patterns

Unit tests verify business logic. For pure functions, no dependencies are needed.
For handlers, provide test layers—see `/effect-testing`.

Location: colocated with source (e.g., `packages/core/src/**/*.test.ts`).

---

## Pattern

For pure functions returning Effect, use `it.effect` from `@effect/vitest`:

```typescript
import { Effect } from "effect";
import { describe, expect, it } from "@effect/vitest";
import { parseSource, ParseError } from "../source-parser.js";

describe("source-parser", () => {
  describe("GitHub shorthand", () => {
    it.effect("parses owner/repo", () =>
      Effect.gen(function* () {
        const result = yield* parseSource("owner/repo");

        expect(result.type).toBe("github");
        expect(result.owner).toBe("owner");
        expect(result.repo).toBe("repo");
      }),
    );
  });

  describe("error cases", () => {
    it.effect("fails with ParseError for invalid input", () =>
      Effect.gen(function* () {
        const error = yield* parseSource("").pipe(Effect.flip);
        expect(error).toBeInstanceOf(ParseError);
      }),
    );
  });
});
```

For functions requiring services, provide layers—see `/effect-testing`.

---

## Checklist

- [ ] **Use it.effect for Effects** — Stay in Effect-land, no runPromise
- [ ] **Single behavior per test** — One assertion per logical behavior
- [ ] **Descriptive names** — Test name describes behavior being verified
- [ ] **Edge cases covered** — Empty inputs, boundaries, error cases
- [ ] **Provide layers for services** — Use test layers for service dependencies
